import { and, desc, eq, gte, ilike, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  albums,
  likes,
  playEvents,
  playlistTracks,
  playlists,
  trackPreferences,
  tracks,
  users,
} from "@/db/schema";
import { publicUrlFor } from "@/lib/storage";
import type { AlbumDTO, TrackDTO } from "@/lib/types";

const trackSelection = {
  id: tracks.id,
  title: tracks.title,
  albumId: tracks.albumId,
  trackNo: tracks.trackNo,
  audioKey: tracks.audioKey,
  artworkKey: tracks.artworkKey,
  albumArtworkKey: albums.artworkKey,
  color: tracks.color,
  durationSec: tracks.durationSec,
  playCount: tracks.playCount,
  likeCount: tracks.likeCount,
  createdAt: tracks.createdAt,
  artist: sql<string>`coalesce(${users.artistName}, ${users.displayName})`,
  handle: users.handle,
};

type TrackRow = {
  id: string;
  title: string;
  albumId: string | null;
  trackNo: number | null;
  audioKey: string;
  artworkKey: string | null;
  albumArtworkKey: string | null;
  color: string | null;
  durationSec: number;
  playCount: number;
  likeCount: number;
  createdAt: Date;
  artist: string;
  handle: string;
};

function toDTO(r: TrackRow, liked = false): TrackDTO {
  const artKey = r.artworkKey ?? r.albumArtworkKey; // album tracks inherit album art
  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    handle: r.handle,
    audioUrl: publicUrlFor(r.audioKey),
    artworkUrl: artKey ? publicUrlFor(artKey) : null,
    color: r.color,
    durationSec: r.durationSec,
    playCount: r.playCount,
    likeCount: r.likeCount,
    liked,
    albumId: r.albumId,
    trackNo: r.trackNo,
  };
}

const baseTrackQuery = () =>
  db
    .select(trackSelection)
    .from(tracks)
    .innerJoin(users, eq(tracks.userId, users.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id));

export async function getRecentTracks(limit = 24): Promise<TrackDTO[]> {
  const rows = await baseTrackQuery()
    .where(eq(tracks.isPublished, true))
    .orderBy(desc(tracks.createdAt))
    .limit(limit);
  return rows.map((r) => toDTO(r));
}

export async function getTopTracks(limit = 10): Promise<TrackDTO[]> {
  const rows = await baseTrackQuery()
    .where(eq(tracks.isPublished, true))
    .orderBy(desc(tracks.playCount), desc(tracks.likeCount))
    .limit(limit);
  return rows.map((r) => toDTO(r));
}

/**
 * "Popular" = plays counted in the last 30 days (rolling, so newly uploaded
 * songs can chart). To keep the section from being a static top-10, we draw a
 * random sample from a larger pool of the most-played. When 30-day data is
 * thin, the pool is padded from all-time popularity.
 */
export async function getPopularTracks(limit = 10, poolSize = 40): Promise<TrackDTO[]> {
  const recentRows = await db
    .select({ id: playEvents.trackId, plays: sql<number>`count(*)::int` })
    .from(playEvents)
    .where(
      and(
        eq(playEvents.counted, true),
        sql`${playEvents.playedAt} > now() - interval '30 days'`,
      ),
    )
    .groupBy(playEvents.trackId);

  const recentSorted = [...recentRows].sort((a, b) => b.plays - a.plays);
  let poolIds = recentSorted.slice(0, poolSize).map((r) => r.id);

  if (poolIds.length < poolSize) {
    const fill = await db
      .select({ id: tracks.id })
      .from(tracks)
      .where(
        and(
          eq(tracks.isPublished, true),
          poolIds.length > 0 ? notInArray(tracks.id, poolIds) : undefined,
        ),
      )
      .orderBy(desc(tracks.playCount), desc(tracks.likeCount), desc(tracks.createdAt))
      .limit(poolSize - poolIds.length);
    poolIds = poolIds.concat(fill.map((r) => r.id));
  }

  // Fisher–Yates sample so the section refreshes between visits
  const shuffled = [...poolIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return getTracksByIdsOrdered(shuffled.slice(0, limit));
}

/** This listener's most recent tracks (by account and/or device), newest first, deduped. */
export async function getRecentlyPlayed(
  userId: string | null,
  clientUuid: string,
  limit = 12,
): Promise<TrackDTO[]> {
  const conds = [eq(playEvents.clientUuid, clientUuid), gte(playEvents.secondsPlayed, 5)];
  if (userId) conds.push(eq(playEvents.userId, userId));
  const rows = await db
    .select({ id: playEvents.trackId, last: sql<string>`max(${playEvents.playedAt})` })
    .from(playEvents)
    .where(or(...conds))
    .groupBy(playEvents.trackId)
    .orderBy(desc(sql`max(${playEvents.playedAt})`))
    .limit(limit);
  return getTracksByIdsOrdered(rows.map((r) => r.id));
}

export async function getTrackById(id: string, userId?: string): Promise<TrackDTO | null> {
  const rows = await baseTrackQuery().where(eq(tracks.id, id)).limit(1);
  if (!rows[0]) return null;
  let liked = false;
  if (userId) {
    const l = await db
      .select({ trackId: likes.trackId })
      .from(likes)
      .where(and(eq(likes.userId, userId), eq(likes.trackId, id)))
      .limit(1);
    liked = l.length > 0;
  }
  return toDTO(rows[0], liked);
}

export async function getTracksByIdsOrdered(
  ids: string[],
  userId?: string | null,
): Promise<TrackDTO[]> {
  if (ids.length === 0) return [];
  const rows = await baseTrackQuery().where(inArray(tracks.id, ids));
  let likedIds: Set<string> = new Set();
  if (userId && ids.length > 0) {
    const l = await db
      .select({ trackId: likes.trackId })
      .from(likes)
      .where(
        and(
          eq(likes.userId, userId),
          inArray(likes.trackId, ids),
        ),
      );
    likedIds = new Set(l.map((r) => r.trackId));
  }
  const byId = new Map(rows.map((r) => [r.id, toDTO(r, likedIds.has(r.id))]));
  return ids.map((id) => byId.get(id)).filter((t): t is TrackDTO => !!t);
}

export async function getUserByHandle(handle: string) {
  const rows = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
  return rows[0] ?? null;
}

export async function getUserAlbums(userId: string): Promise<AlbumDTO[]> {
  const rows = await db
    .select({
      id: albums.id,
      title: albums.title,
      artworkKey: albums.artworkKey,
      color: albums.color,
      trackCount: sql<number>`count(${tracks.id})::int`,
    })
    .from(albums)
    .leftJoin(tracks, eq(tracks.albumId, albums.id))
    .where(eq(albums.userId, userId))
    .groupBy(albums.id)
    .orderBy(desc(albums.createdAt));
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    artworkUrl: a.artworkKey ? publicUrlFor(a.artworkKey) : null,
    color: a.color,
    trackCount: a.trackCount,
  }));
}

/** A rotating random sample of albums for the home row. */
export async function getRandomAlbums(limit = 12) {
  const rows = await db
    .select({
      id: albums.id,
      title: albums.title,
      artworkKey: albums.artworkKey,
      color: albums.color,
      artist: sql<string>`coalesce(${users.artistName}, ${users.displayName})`,
      handle: users.handle,
    })
    .from(albums)
    .innerJoin(users, eq(albums.userId, users.id))
    .where(sql`exists (select 1 from tracks t where t.album_id = ${albums.id} and t.is_published)`)
    .orderBy(sql`random()`)
    .limit(limit);
  return rows.map((a) => ({
    ...a,
    artworkUrl: a.artworkKey ? publicUrlFor(a.artworkKey) : null,
  }));
}

export async function getAlbum(id: string) {
  const rows = await db
    .select({
      id: albums.id,
      title: albums.title,
      artworkKey: albums.artworkKey,
      color: albums.color,
      artist: sql<string>`coalesce(${users.artistName}, ${users.displayName})`,
      handle: users.handle,
    })
    .from(albums)
    .innerJoin(users, eq(albums.userId, users.id))
    .where(eq(albums.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAlbumTracks(albumId: string): Promise<TrackDTO[]> {
  const rows = await baseTrackQuery()
    .where(and(eq(tracks.albumId, albumId), eq(tracks.isPublished, true)))
    .orderBy(sql`${tracks.trackNo} asc nulls last`, tracks.createdAt);
  return rows.map((r) => toDTO(r));
}

export async function getUserTracks(userId: string, limit = 500): Promise<TrackDTO[]> {
  const rows = await baseTrackQuery()
    .where(and(eq(tracks.userId, userId), eq(tracks.isPublished, true)))
    .orderBy(desc(tracks.createdAt))
    .limit(limit);
  return rows.map((r) => toDTO(r));
}

export async function searchEverything(q: string) {
  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const [t, u, a] = await Promise.all([
    baseTrackQuery()
      .where(and(eq(tracks.isPublished, true), ilike(tracks.title, like)))
      .orderBy(desc(tracks.playCount))
      .limit(25),
    db
      .select({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        artistName: users.artistName,
      })
      .from(users)
      .where(or(ilike(users.displayName, like), ilike(users.artistName, like)))
      .limit(10),
    db
      .select({
        id: albums.id,
        title: albums.title,
        artworkKey: albums.artworkKey,
        color: albums.color,
        artist: users.displayName,
        handle: users.handle,
      })
      .from(albums)
      .innerJoin(users, eq(albums.userId, users.id))
      .where(ilike(albums.title, like))
      .limit(10),
  ]);
  return {
    tracks: t.map((r) => toDTO(r)),
    users: u,
    albums: a.map((al) => ({
      ...al,
      artworkUrl: al.artworkKey ? publicUrlFor(al.artworkKey) : null,
    })),
  };
}

export async function getLikedTracks(userId: string): Promise<TrackDTO[]> {
  const rows = await db
    .select(trackSelection)
    .from(likes)
    .innerJoin(tracks, eq(likes.trackId, tracks.id))
    .innerJoin(users, eq(tracks.userId, users.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .where(eq(likes.userId, userId))
    .orderBy(desc(likes.createdAt));
  return rows.map((r) => toDTO(r, true));
}

export type ShuffleScope =
  | { kind: "all" }
  | { kind: "user"; id: string }
  | { kind: "album"; id: string }
  | { kind: "playlist"; id: string }
  | { kind: "liked"; id: string };

/**
 * Popularity-skewed shuffle: weighted sampling without replacement via
 * exponential ordering. Base weight = plays + 2×likes + 5 (smoothing keeps
 * quiet tracks alive). When a clientUuid is given (radio mixes), that weight
 * is multiplied by 2^preference for this listener: likes boost, early skips
 * demote — downweighted, never excluded.
 */
export async function shuffledTrackIds(
  scope: ShuffleScope,
  limit = 80,
  clientUuid?: string,
): Promise<string[]> {
  let where: SQL<unknown> | undefined = eq(tracks.isPublished, true);
  if (scope.kind === "user") where = and(where, eq(tracks.userId, scope.id));
  if (scope.kind === "album") where = and(where, eq(tracks.albumId, scope.id));

  if (scope.kind === "playlist" || scope.kind === "liked") {
    // explicit contexts: the listener chose this list — no preference bending
    const weight = sql`(${tracks.playCount} + 2 * ${tracks.likeCount} + 5)::float`;
    const order = sql`-ln(greatest(random(), 1e-9)) / ${weight} asc`;

    let list: string[];
    if (scope.kind === "playlist") {
      const rows = await db
        .select({ id: playlistTracks.trackId })
        .from(playlistTracks)
        .where(eq(playlistTracks.playlistId, scope.id));
      list = rows.map((r) => r.id);
    } else {
      const rows = await db
        .select({ id: likes.trackId })
        .from(likes)
        .where(eq(likes.userId, scope.id));
      list = rows.map((r) => r.id);
    }
    if (list.length === 0) return [];
    const rows = await db
      .select({ id: tracks.id })
      .from(tracks)
      .where(and(inArray(tracks.id, list), eq(tracks.isPublished, true)))
      .orderBy(order)
      .limit(limit);
    return rows.map((r) => r.id);
  }

  const prefWeight = sql`((${tracks.playCount} + 2 * ${tracks.likeCount} + 5) * coalesce(2 ^ ${trackPreferences.weight}, 1))::float`;
  const prefOrder = sql`-ln(greatest(random(), 1e-9)) / ${prefWeight} asc`;

  const rows = await db
    .select({ id: tracks.id })
    .from(tracks)
    .leftJoin(
      trackPreferences,
      clientUuid
        ? and(
            eq(trackPreferences.trackId, tracks.id),
            eq(trackPreferences.clientUuid, clientUuid),
          )
        : sql`false`,
    )
    .where(where)
    .orderBy(prefOrder)
    .limit(limit);
  return rows.map((r) => r.id);
}

export async function getPlaylistsFor(userId: string) {
  return db
    .select({
      id: playlists.id,
      title: playlists.title,
      count: sql<number>`count(${playlistTracks.trackId})::int`,
    })
    .from(playlists)
    .leftJoin(playlistTracks, eq(playlistTracks.playlistId, playlists.id))
    .where(eq(playlists.userId, userId))
    .groupBy(playlists.id)
    .orderBy(desc(playlists.createdAt));
}

export async function getPlaylist(id: string) {
  const rows = await db
    .select({
      id: playlists.id,
      title: playlists.title,
      ownerHandle: users.handle,
      ownerName: users.displayName,
      ownerId: users.id,
    })
    .from(playlists)
    .innerJoin(users, eq(playlists.userId, users.id))
    .where(eq(playlists.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPlaylistTracks(playlistId: string): Promise<TrackDTO[]> {
  const rows = await db
    .select({ ...trackSelection, position: playlistTracks.position })
    .from(playlistTracks)
    .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
    .innerJoin(users, eq(tracks.userId, users.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .where(and(eq(playlistTracks.playlistId, playlistId), eq(tracks.isPublished, true)))
    .orderBy(playlistTracks.position);
  return rows.map((r) => toDTO(r));
}

export async function siteStats() {
  const rows = await db
    .select({
      trackCount: sql<number>`count(*)::int`,
      artistCount: sql<number>`count(distinct ${tracks.userId})::int`,
      totalSeconds: sql<number>`coalesce(sum(${tracks.durationSec}), 0)::float`,
    })
    .from(tracks)
    .where(eq(tracks.isPublished, true));
  return rows[0] ?? { trackCount: 0, artistCount: 0, totalSeconds: 0 };
}
