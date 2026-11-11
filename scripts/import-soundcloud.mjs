#!/usr/bin/env node
/**
 * Import the hymnstream SoundCloud library into Life Stream.
 *
 * Source files come from the yt-dlp bulk download in imports/soundcloud/:
 * each track has `<scid>.info.json` + `<scid>.<ext>` audio.
 *
 * Albums: the account has no album/playlist metadata on SoundCloud, and every
 * track gets a unique artwork ID even when the same image covers a whole
 * album — so grouping is by artwork CONTENT (sha1 of the image bytes, fetched
 * at t500x500). Identical bytes => same album. Groups of >= 2 become albums;
 * singletons keep their artwork on the track itself.
 *
 * Album titles default to "Untitled set" — pass --titles=path.json mapping
 * content-hash -> title (the dry run prints the hashes), or rename later in
 * the admin UI.
 *
 * Usage:
 *   node scripts/import-soundcloud.mjs --dry
 *   node scripts/import-soundcloud.mjs --email=you@example.com --password=secret
 *   node scripts/import-soundcloud.mjs --titles=album-titles.json
 *
 * Idempotent: tracks keyed on source_sc_id; artwork hashes cached in
 * imports/soundcloud/.artwork-hashes.json; yt-dlp side is resumable.
 */
import { readdir, readFile, stat, mkdir, copyFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { hash } from "@node-rs/argon2";

// ---------- args ----------

const args = new Map();
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--")) {
    const [k, v] = a.slice(2).split("=");
    args.set(k, v ?? true);
  }
}

const DRY = args.has("dry");
const DIR = path.resolve(String(args.get("dir") ?? path.join(process.cwd(), "imports/soundcloud")));
const DB_URL = process.env.DATABASE_URL ?? "postgres://regan@localhost:5432/lifestream";
const OWNER_EMAIL = String(args.get("email") ?? "owner@lifestream.local").toLowerCase();
const OWNER_HANDLE = "hymnstream";
const OWNER_NAME = "Hymn Stream";
const STORAGE_MODE = process.env.STORAGE_MODE === "r2" ? "r2" : "local";
const LOCAL_STORAGE = path.join(process.cwd(), ".storage");
const CACHE_FILE = path.join(DIR, ".artwork-hashes.json");

const MIME = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  wav: "audio/wav",
};

let albumTitles = {};
if (args.has("titles")) {
  albumTitles = JSON.parse(await readFile(String(args.get("titles")), "utf8"));
}

// ---------- storage helpers ----------

async function putStorage(key, buf, contentType) {
  if (STORAGE_MODE === "local") {
    const dest = path.join(LOCAL_STORAGE, key);
    await mkdir(path.dirname(dest), { recursive: true });
    const { writeFile: wf } = await import("node:fs/promises");
    await wf(dest, buf);
    return;
  }
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: buf,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

async function copyAudio(src, key) {
  if (STORAGE_MODE === "local") {
    const dest = path.join(LOCAL_STORAGE, key);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(src, dest);
    return;
  }
  const buf = await readFile(src);
  await putStorage(key, buf, "application/octet-stream");
}

// url -> 12-char content hash (null if unfetchable); persisted for resume speed
const urlHashCache = existsSync(CACHE_FILE)
  ? JSON.parse(await readFile(CACHE_FILE, "utf8"))
  : {};

/**
 * Fetch artwork for a track URL, store it content-keyed, return the hash.
 * In dry-run mode nothing is written to storage.
 */
async function artworkHashFor(url) {
  if (!url) return null;
  if (url in urlHashCache) return urlHashCache[url];

  const candidates = [url.replace(/-original\./, "-t500x500."), url];
  for (const u of candidates) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.byteLength < 1000) continue;
      const h = createHash("sha1").update(buf).digest("hex").slice(0, 12);
      const key = `img/sc-${h}.jpg`;
      if (!DRY) {
        const already =
          STORAGE_MODE === "local" ? existsSync(path.join(LOCAL_STORAGE, key)) : false;
        if (!already) await putStorage(key, buf, "image/jpeg");
      }
      urlHashCache[url] = h;
      return h;
    } catch {
      /* try next candidate */
    }
  }
  urlHashCache[url] = null;
  return null;
}

// ---------- scan ----------

const files = await readdir(DIR);
const infoFiles = files.filter((f) => f.endsWith(".info.json"));

const tracks = [];
for (const f of infoFiles) {
  const scId = f.replace(/\.info\.json$/, "");
  let info;
  try {
    info = JSON.parse(await readFile(path.join(DIR, f), "utf8"));
  } catch {
    console.warn(`  ! unreadable ${f}, skipping`);
    continue;
  }
  const audioFile = files.find((x) =>
    new RegExp(`^${scId}\\.(mp3|m4a|aac|ogg|opus|flac|wav)$`).test(x),
  );
  if (!audioFile) continue; // not downloaded yet; re-run the script later

  const ext = audioFile.split(".").pop().toLowerCase();
  tracks.push({
    scId,
    title: (info.title ?? `Track ${scId}`).trim(),
    durationSec: Math.round(Number(info.duration ?? 0)),
    uploadDate: String(info.upload_date ?? ""),
    artworkUrl: info.thumbnail ?? null,
    audioPath: path.join(DIR, audioFile),
    ext,
    mime: MIME[ext] ?? "application/octet-stream",
  });
}

tracks.sort((a, b) => (a.uploadDate < b.uploadDate ? -1 : a.uploadDate > b.uploadDate ? 1 : 0));

// resolve artwork content hashes (network; cached across runs)
console.log(`Resolving artwork hashes for ${tracks.length} tracks…`);
let n = 0;
for (const t of tracks) {
  t.artworkHash = await artworkHashFor(t.artworkUrl);
  if (++n % 100 === 0) console.log(`  ${n}/${tracks.length}`);
}
await writeFile(CACHE_FILE, JSON.stringify(urlHashCache, null, 0)).catch(() => {});

// group by artwork content hash
const groups = new Map();
const ungrouped = [];
for (const t of tracks) {
  if (!t.artworkHash) ungrouped.push(t);
  else {
    const g = groups.get(t.artworkHash) ?? [];
    g.push(t);
    groups.set(t.artworkHash, g);
  }
}

const albumGroups = [...groups.entries()].filter(([, list]) => list.length >= 2);
const singletons = [...groups.values()].filter((list) => list.length === 1).flat().concat(ungrouped);

// ---------- dry run ----------

if (DRY) {
  const totalBytes = await tracks.reduce(
    async (acc, t) => {
      const s = await stat(t.audioPath).catch(() => null);
      return (await acc) + (s?.size ?? 0);
    },
    Promise.resolve(0),
  );
  console.log(`\nScanned ${DIR}`);
  console.log(`  info jsons:        ${infoFiles.length}`);
  console.log(`  with audio:        ${tracks.length}`);
  console.log(
    `  album groups (2+): ${albumGroups.length} covering ${albumGroups.reduce((n, [, l]) => n + l.length, 0)} tracks`,
  );
  console.log(`  singletons:        ${singletons.length}`);
  console.log(`  distinct artworks: ${groups.size + ungrouped.length}`);
  console.log(`  audio bytes:       ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log("\nAlbum groups (content-hash — use these keys for --titles):");
  for (const [h, list] of [...albumGroups].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${h}: ${list.length} tracks — e.g. "${list[0].title}"`);
  }
  process.exit(0);
}

// ---------- import ----------

const sql = postgres(DB_URL);

let ownerRows = await sql`select id from users where handle = ${OWNER_HANDLE}`;
if (ownerRows.length === 0) {
  let password = String(args.get("password") ?? "");
  if (!password) {
    password = randomUUID().slice(0, 13);
    console.log(`\n*** Created owner — email: ${OWNER_EMAIL}  password: ${password} (save it!) ***\n`);
  }
  ownerRows = await sql`
    insert into users (email, password_hash, handle, display_name, is_admin)
    values (${OWNER_EMAIL}, ${await hash(password)}, ${OWNER_HANDLE}, ${OWNER_NAME}, true)
    returning id`;
} else {
  console.log(`owner @${OWNER_HANDLE} exists`);
}
const ownerId = ownerRows[0].id;

const existing = new Set(
  (
    await sql`select source_sc_id from tracks where source_sc_id is not null`
  ).map((r) => r.source_sc_id),
);

let albumsCreated = 0;
let tracksImported = 0;
let skipped = 0;

console.log(`\nImporting (db has ${existing.size} of these already)…`);

for (const [h, list] of albumGroups) {
  let albumRow = await sql`select id from albums where source_artwork_id = ${h}`;
  if (albumRow.length === 0) {
    const title = albumTitles[h] ?? "Untitled set";
    albumRow = await sql`
      insert into albums (user_id, title, artwork_key, source_artwork_id)
      values (${ownerId}, ${title}, ${`img/sc-${h}.jpg`}, ${h})
      returning id`;
    albumsCreated++;
  }
  const albumId = albumRow[0].id;

  let trackNo = 1;
  for (const t of list) {
    if (existing.has(t.scId)) {
      skipped++;
      trackNo++;
      continue;
    }
    const audioKey = `a/${randomUUID()}.${t.ext}`;
    const s = await stat(t.audioPath);
    await copyAudio(t.audioPath, audioKey);
    await sql`
      insert into tracks (user_id, album_id, track_no, title, audio_key, mime, ext,
        size_bytes, duration_sec, source_sc_id)
      values (${ownerId}, ${albumId}, ${trackNo}, ${t.title}, ${audioKey}, ${t.mime}, ${t.ext},
        ${s.size}, ${t.durationSec}, ${t.scId})
      on conflict (source_sc_id) do nothing`;
    tracksImported++;
    trackNo++;
  }
}

for (const t of singletons) {
  if (existing.has(t.scId)) {
    skipped++;
    continue;
  }
  const artworkKey = t.artworkHash ? `img/sc-${t.artworkHash}.jpg` : null;
  const audioKey = `a/${randomUUID()}.${t.ext}`;
  const s = await stat(t.audioPath);
  await copyAudio(t.audioPath, audioKey);
  await sql`
    insert into tracks (user_id, title, audio_key, mime, ext, size_bytes, duration_sec,
      artwork_key, source_sc_id)
    values (${ownerId}, ${t.title}, ${audioKey}, ${t.mime}, ${t.ext}, ${s.size}, ${t.durationSec},
      ${artworkKey}, ${t.scId})
    on conflict (source_sc_id) do nothing`;
  tracksImported++;
}

console.log(
  `\nDone: ${tracksImported} imported, ${albumsCreated} albums created, ${skipped} already present.`,
);
await sql.end();
