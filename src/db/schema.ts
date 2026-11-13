import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  doublePrecision,
  boolean,
  timestamp,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    handle: text("handle").notNull(), // url slug, unique
    displayName: text("display_name").notNull(),
    artistName: text("artist_name"), // shown on their music; null = use displayName
    color: text("color"),
    isAdmin: boolean("is_admin").notNull().default(false),
    storageBytes: bigint("storage_bytes", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_handle_idx").on(t.handle),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const albums = pgTable(
  "albums",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    artistName: text("artist_name"), // credited artist; null = the owner's name
    artworkKey: text("artwork_key"),
    color: text("color"),
    // idempotency for the SoundCloud import: the artwork group this album came from
    sourceArtworkId: text("source_artwork_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("albums_user_idx").on(t.userId),
    uniqueIndex("albums_source_artwork_idx").on(t.sourceArtworkId),
  ],
);

export const tracks = pgTable(
  "tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    albumId: uuid("album_id").references(() => albums.id, { onDelete: "set null" }),
    trackNo: integer("track_no"),
    title: text("title").notNull(),
    audioKey: text("audio_key").notNull(),
    mime: text("mime").notNull(),
    ext: text("ext").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    durationSec: doublePrecision("duration_sec").notNull().default(0),
    artworkKey: text("artwork_key"),
    color: text("color"),
    playCount: integer("play_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(true),
    sourceScId: text("source_sc_id"), // SoundCloud track id, for idempotent import
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tracks_user_idx").on(t.userId),
    index("tracks_album_idx").on(t.albumId),
    index("tracks_created_idx").on(t.createdAt),
    uniqueIndex("tracks_source_sc_id_idx").on(t.sourceScId),
  ],
);

export const playlists = pgTable(
  "playlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("playlists_user_idx").on(t.userId)],
);

export const playlistTracks = pgTable(
  "playlist_tracks",
  {
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.playlistId, t.trackId] }),
    index("playlist_tracks_playlist_idx").on(t.playlistId),
  ],
);

export const likes = pgTable(
  "likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.trackId] })],
);

export const playEvents = pgTable(
  "play_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    clientUuid: text("client_uuid").notNull(),
    secondsPlayed: integer("seconds_played").notNull().default(0),
    counted: boolean("counted").notNull().default(false),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("play_events_track_idx").on(t.trackId),
    index("play_events_played_idx").on(t.playedAt),
    index("play_events_user_idx").on(t.userId),
  ],
);

/**
 * Per-listener taste for radio weighting, keyed on the device's client UUID
 * (works signed-in or not; user_id kept for future account merging).
 * weight ∈ [-5, 5]: early-skip −1, like +2, unlike −2. Applied to station
 * sampling as a 2^weight multiplier — downweighted, never banned.
 */
export const trackPreferences = pgTable(
  "track_preferences",
  {
    clientUuid: text("client_uuid").notNull(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    weight: doublePrecision("weight").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.clientUuid, t.trackId] }),
    index("track_prefs_track_idx").on(t.trackId),
  ],
);
