import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { trackPreferences, tracks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

/**
 * Per-listener taste signals for radio weighting.
 *   skip −1, like +2, unlike −2 (clamped to ±5)
 *   mute / unmute — floor a single song at −5 (or restore 0)
 *   mute-album / unmute-album — same for every song in the track's album
 * Radio sampling multiplies popularity by 2^weight: muted ≈ 32× rarer, never
 * fully banned from explicit contexts (albums/playlists are never bent).
 */

const VALID = new Set([
  "skip",
  "like",
  "unlike",
  "mute",
  "unmute",
  "mute-album",
  "unmute-album",
]);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const trackId = typeof body?.trackId === "string" ? body.trackId : null;
  const clientUuid =
    typeof body?.clientUuid === "string" ? body.clientUuid.slice(0, 64) : null;
  const kind = body?.kind;

  if (
    !trackId ||
    !clientUuid ||
    !/^[0-9a-zA-Z-]{10,64}$/.test(clientUuid) ||
    !VALID.has(kind)
  ) {
    return new Response(null, { status: 204 });
  }

  const user = await getCurrentUser().catch(() => null);
  const userId = user?.id ?? null;

  if (kind === "mute-album" || kind === "unmute-album") {
    const t = await db
      .select({ albumId: tracks.albumId })
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .limit(1);
    const albumId = t[0]?.albumId;
    if (!albumId) return new Response(null, { status: 204 });

    if (kind === "mute-album") {
      await db.execute(sql`
        insert into track_preferences (client_uuid, user_id, track_id, weight, updated_at)
        select ${clientUuid}, ${userId}, id, -5, now()
        from tracks where album_id = ${albumId} and is_published
        on conflict (client_uuid, track_id)
        do update set weight = least(track_preferences.weight, -5), updated_at = now()
      `);
    } else {
      await db.execute(sql`
        update track_preferences set weight = 0, updated_at = now()
        where client_uuid = ${clientUuid}
          and weight <= -4.5
          and track_id in (select id from tracks where album_id = ${albumId})
      `);
    }
    return new Response(null, { status: 204 });
  }

  const start = kind === "skip" ? -1 : kind === "like" ? 2 : kind === "mute" ? -5 : 0;
  const nextWeight =
    kind === "skip"
      ? sql`greatest(${trackPreferences.weight} - 1, -5)`
      : kind === "like"
        ? sql`least(${trackPreferences.weight} + 2, 5)`
        : kind === "unlike"
          ? sql`greatest(${trackPreferences.weight} - 2, -5)`
          : kind === "mute"
            ? sql`least(${trackPreferences.weight}, -5)`
            : sql`0`;

  await db
    .insert(trackPreferences)
    .values({ clientUuid, trackId, userId, weight: start })
    .onConflictDoUpdate({
      target: [trackPreferences.clientUuid, trackPreferences.trackId],
      set: { weight: nextWeight, userId, updatedAt: new Date() },
    });

  return new Response(null, { status: 204 });
}

/** Mute state for the player-bar kabob menu. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientUuid = url.searchParams.get("client") ?? "";
  const trackId = url.searchParams.get("trackId") ?? "";
  if (!/^[0-9a-zA-Z-]{10,64}$/.test(clientUuid) || !trackId) {
    return Response.json({ songMuted: false, albumMuted: false });
  }

  const song = await db
    .select({ weight: trackPreferences.weight })
    .from(trackPreferences)
    .where(
      and(eq(trackPreferences.clientUuid, clientUuid), eq(trackPreferences.trackId, trackId)),
    )
    .limit(1);

  let albumMuted = false;
  const t = await db
    .select({ albumId: tracks.albumId })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (t[0]?.albumId) {
    const stats = await db
      .select({
        total: sql<number>`count(*)::int`,
        muted: sql<number>`count(*) filter (where coalesce(${trackPreferences.weight}, 0) <= -4.5)::int`,
      })
      .from(tracks)
      .leftJoin(
        trackPreferences,
        and(
          eq(trackPreferences.trackId, tracks.id),
          eq(trackPreferences.clientUuid, clientUuid),
        ),
      )
      .where(eq(tracks.albumId, t[0].albumId));
    albumMuted = (stats[0]?.total ?? 0) > 0 && stats[0].muted === stats[0].total;
  }

  return Response.json({
    songMuted: (song[0]?.weight ?? 0) <= -4.5,
    albumMuted,
  });
}
