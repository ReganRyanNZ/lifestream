#!/usr/bin/env node
/**
 * Import a local music library laid out as <root>/<Artist>/<Album>/<files>
 * (files directly under <Artist>/ are imported as singles).
 *
 * Title cleanup:
 *  - leading track numbers are stripped ("04 Faith…", "100. Seek…") and kept
 *    as track order; single-digit numbers followed by a space are LEFT ALONE
 *    ("1 Cor 6_9a-11" is a bible ref, not a track number)
 *  - trailing "(E)" (English indicator) is stripped
 *  - Rina: strip leading numbers and trailing "- INITIALS" credits
 *  - Stacie: "_" → ":" (filesystem-safe verse refs)
 *  - album folder titles get "_" → ":" as well
 *
 * Artwork: a file's embedded cover art is used when present (content-hashed);
 * otherwise a solid-color italic-serif cover is generated (gen-album-art.mjs)
 * and its palette color stored on the album/track.
 *
 * Flags: --root=DIR (default ~/MEGA/Music (Full)), --dry.
 *
 * Idempotent-ish: albums keyed on source_artwork_id "local:<artist>/<album>",
 * tracks skipped when a track at the same position already exists.
 */
import { readdir, readFile, stat, mkdir, copyFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { hash } from "@node-rs/argon2";
import { generateCover, PALETTE, colorIndexFor } from "./gen-album-art.mjs";

// ---------- config ----------

const args = new Map();
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--")) {
    const [k, v] = a.slice(2).split("=");
    args.set(k, v ?? true);
  }
}
const DRY = args.has("dry");
const ROOT = path.resolve(
  String(args.get("root") ?? path.join(homedir(), "MEGA", "Music (Full)")),
);
const DB_URL = process.env.DATABASE_URL ?? "postgres://regan@localhost:5432/lifestream";
const STORAGE = path.join(process.cwd(), ".storage");

const SKIP_ARTISTS = new Set(
  [
    "4 brothers", "Brothers Three", "Christina and Emily", "Dunedin Young People",
    "Esther Hong", "FTTLSpring2008", "Heidi and Vanessa", "HST 2009", "Hymn Stream",
    "Hymnal.Net", "Joseph Huang", "Joyful Songs", "Kevin & Janet Seet", "Korea",
    "Living Spring Saints", "Living Stream Ministry", "London Philharmonic Orchestra",
    "Lover's of Christ", "LSM", "LSM Sistrers(명곡들 ㅠㅠ)", "Midwest College Saints",
    "Misc", "Natalie Davis", "NYCYPCD", "Nycypcd - Spanish", "NZ Highschoolers",
    "NZTC Grads 2003", "R&P", "Saints at UCLA", "Saints from Christchurch, NZ",
    "Saints in New Zealand", "Saints in Westland", "Santos Hispanicos", "Seattle",
    "Seattle High School Singing", "T2 Brothers", "The Green Room", "Unknown Artist",
    "ZM, JS",
  ].map((s) => s.normalize("NFC")),
);
const ONLY_ALBUMS = { "Andrew Carton": new Set(["We have a most glorious King"]) };
const EXCEPT_ALBUMS = { "Howard Higashi": new Set(["The Full Ministry of Christ"]) };
const INSTRUMENTAL_ARTISTS = new Set(["Edwin Ch'ng", "Enoch Chen", "Timothy Kang", "Violin & Piano"]);

const AUDIO_RE = /\.(mp3|m4a|mp4|aac|flac|wav|aiff|aif)$/i;
const MIME = {
  mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac",
  flac: "audio/flac", wav: "audio/wav", aiff: "audio/aiff", aif: "audio/aiff",
};

// ---------- helpers ----------

function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs);
    let out = "";
    p.stdout.on("data", (c) => (out += c));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}`))));
  });
}

const probe = (file, extra) =>
  run("ffprobe", ["-v", "error", ...extra, file]).catch(() => "");

const durationOf = async (file) => {
  const out = await probe(file, ["-show_entries", "format=duration", "-of", "csv=p=0"]);
  return Math.round(Number.parseFloat(out.trim()) || 0);
};

const hasEmbeddedArt = async (file) =>
  (await probe(file, ["-select_streams", "v", "-show_entries", "stream=codec_type", "-of", "csv=p=0"]))
    .trim()
    .split("\n")
    .some((l) => l.includes("video"));

/** Extract the first attached picture to jpeg bytes. */
async function extractArt(file) {
  const tmp = path.join(tmpdir(), `art-${randomUUID()}.jpg`);
  await run("ffmpeg", ["-v", "error", "-i", file, "-map", "0:v:0", "-frames:v", "1", "-q:v", "3", tmp]);
  const buf = await readFile(tmp);
  const { rm } = await import("node:fs/promises");
  await rm(tmp, { force: true });
  return buf;
}

const sha12 = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 12);

async function putStorage(key, buf) {
  const dest = path.join(STORAGE, key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
}

function slugify(name) {
  return name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48)
    .replace(/^-|-$/g, "");
}

/** filename (no ext) → { title, trackNo } per the cleanup rules */
export function cleanTitle(raw, artist) {
  let t = raw;
  let trackNo = null;

  if (artist === "Rina") {
    // leading numbers — including "68b." and doubled "73. 1." prefixes
    for (let i = 0; i < 3; i++) {
      const m = /^(\d{1,3})[a-z]?[.\s]+\s*(.+)$/.exec(t);
      if (!m) break;
      trackNo = +m[1];
      t = m[2];
    }
    // trailing "- INITIALS" credits (" - J9&JH", "-RRRT", " - with J9J9", chained)
    for (let i = 0; i < 3; i++) {
      const m2 = /\s+-\s*(?:with\s+)?[A-Z0-9][A-Z0-9&\s]{0,14}$/.exec(t);
      if (!m2 || /[a-z.]/.test(m2[0].replace(" - ", "").replace("with ", ""))) break;
      t = t.slice(0, m2.index);
    }
    t = t
      .replace(/\s+-\s+\d+\s+saints$/i, "") // "- 4 saints"
      .replace(/\s*\((v\d)\)$/i, "") // "(v1)"
      .replace(/\s+v\d$/i, "") // trailing "v2"
      .replace(/(\d+)\s*v(s?)(\d+)/g, "$1:$3") // "84vs6-7" / "55 v8-11" → "84:6-7"
      .replace(/\(revised\)\s*$/i, "") // "(revised)"
      .replace(/\s+MASH$/i, " (mash)") // " MASH" → " (mash)"
      .replace(/\(MASH\)/i, "(mash)")
      .replace(/\s+20\d\d$/, "") // trailing year
      .replace(/\s+[A-Z0-9]+&[A-Z0-9&]+$/, ""); // bare "EH&RT"
  } else {
    const m = /^(\d{1,3})([.\s])\s*(.*)$/.exec(t);
    if (m && (m[1].length >= 2 || m[2] === ".")) {
      trackNo = +m[1];
      t = m[3];
    }
    // "NN - Title" leaves a separator dash behind after the number strip
    t = t.replace(/^\s*[-–—.]+\s*/, "");
  }

  t = t.replace(/\s*\([Ee]\)\s*$/, "");
  // "_" stands in for ":" in filenames (filesystem-safe verse refs); verified
  // every underscore in this library follows the digit_digit pattern
  t = t.replace(/_/g, ":");
  return { title: t.replace(/\s+/g, " ").trim() || raw, trackNo };
}

const cleanAlbumTitle = (name) => name.replace(/_/g, ":").trim();

// ---------- CLI guard: importing this module (for cleanTitle etc.) must not
// run an import — only execute when invoked directly ----------
const IS_MAIN =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

if (IS_MAIN) {

// ---------- scan ----------

const artistDirs = (await readdir(ROOT)).filter((d) => !d.startsWith("."));
const plan = []; // { artist, handle, album: {title, dir, files: [{name, ext, title, trackNo}]} | null(loose singles) }

for (const artist of artistDirs) {
  const aN = artist.normalize("NFC");
  if (SKIP_ARTISTS.has(aN) || aN.startsWith("LSM Sistrers")) continue;

  const entries = await readdir(path.join(ROOT, artist), { withFileTypes: true });
  const albumDirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);
  const loose = entries
    .filter((e) => e.isFile() && AUDIO_RE.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const albums = [];
  for (const albumName of albumDirs) {
    if (ONLY_ALBUMS[aN] && !ONLY_ALBUMS[aN].has(albumName)) continue;
    if (EXCEPT_ALBUMS[aN]?.has(albumName)) continue;
    const files = (await readdir(path.join(ROOT, artist, albumName)))
      .filter((f) => !f.startsWith(".") && AUDIO_RE.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (files.length === 0) continue;
    albums.push({
      title: cleanAlbumTitle(albumName),
      dir: path.join(ROOT, artist, albumName),
      rawName: albumName,
      files,
    });
  }
  if (albums.length === 0 && loose.length === 0) continue;
  plan.push({ artist: aN, handle: slugify(aN), albums, loose });
}

// clean titles + ordering
for (const a of plan) {
  const order = (files, dir) => {
    const items = files.map((name) => {
      const ext = name.split(".").pop().toLowerCase();
      const raw = name.slice(0, -(ext.length + 1));
      const { title, trackNo } = cleanTitle(raw, a.artist);
      return { name, ext, title, trackNo, dir };
    });
    items.forEach((it, i) => (it.sortKey = it.trackNo ?? 1000 + i));
    items.sort((x, y) => x.sortKey - y.sortKey);
    items.forEach((it, i) => (it.trackNo = i + 1));
    return items;
  };
  for (const al of a.albums) al.items = order(al.files, al.dir);
  if (a.loose.length) a.looseItems = order(a.loose, path.join(ROOT, a.artist));
}

// ---------- dry ----------

if (DRY) {
  let tracks = 0;
  let bytes = 0;
  const size = (it) => stat(path.join(it.dir, it.name)).then((s) => s.size).catch(() => 0);
  for (const a of plan) {
    console.log(`\n${a.artist}  (@${a.handle})${INSTRUMENTAL_ARTISTS.has(a.artist) ? "  [instrumental]" : ""}`);
    for (const al of a.albums) {
      console.log(`  ▸ ${al.title} (${al.items.length})`);
      for (const it of al.items.slice(0, 3)) {
        console.log(`      ${it.trackNo}. "${it.title}"  ← ${it.name}`);
        bytes += await size(it);
      }
      if (al.items.length > 3) console.log(`      … +${al.items.length - 3} more`);
      for (const it of al.items.slice(3)) bytes += await size(it);
      tracks += al.items.length;
    }
    if (a.looseItems) {
      console.log(`  ▸ (singles, ${a.looseItems.length})`);
      for (const it of a.looseItems) {
        if (a.looseItems.indexOf(it) < 3) console.log(`      "${it.title}"  ← ${it.name}`);
        bytes += await size(it);
      }
      tracks += a.looseItems.length;
    }
  }
  console.log(`\n${plan.length} artists, ${tracks} tracks, ${(bytes / 1024 / 1024).toFixed(0)} MB`);
  process.exit(0);
}

// ---------- import ----------

const sql = postgres(DB_URL);

async function ownerIdFor(handle, name) {
  const rows = await sql`select id from users where handle = ${handle}`;
  if (rows.length) return { id: rows[0].id, created: false };
  const password = randomUUID().slice(0, 13);
  const r = await sql`
    insert into users (email, password_hash, handle, display_name, is_admin)
    values (${`${handle}@lifestream.local`}, ${await hash(password)}, ${handle}, ${name}, true)
    returning id`;
  console.log(`*** new owner @${handle} (${name}) — password: ${password}`);
  return { id: r[0].id, created: true };
}

/** Album/single artwork resolution. */
const artCache = new Map(); // key -> {key: storageKey, color}
async function artworkForAlbum(album) {
  const cacheKey = `local:${album.rawName}`;
  if (artCache.has(cacheKey)) return artCache.get(cacheKey);
  for (const it of album.items) {
    const f = path.join(it.dir, it.name);
    if (await hasEmbeddedArt(f)) {
      try {
        const buf = await extractArt(f);
        const h = sha12(buf);
        const key = `img/art-${h}.jpg`;
        if (!existsSync(path.join(STORAGE, key))) await putStorage(key, buf);
        const res = { key, color: null };
        artCache.set(cacheKey, res);
        return res;
      } catch { /* fall through to generated */ }
    }
  }
  const genKey = `img/gen-${sha12(Buffer.from(album.title))}.jpg`;
  if (!existsSync(path.join(STORAGE, genKey))) {
    await generateCover({ title: album.title, outPath: path.join(STORAGE, genKey) });
  }
  const res = { key: genKey, color: PALETTE[colorIndexFor(album.title)] };
  artCache.set(cacheKey, res);
  return res;
}

async function artworkForSingle(it) {
  const f = path.join(it.dir, it.name);
  if (await hasEmbeddedArt(f)) {
    try {
      const buf = await extractArt(f);
      const h = sha12(buf);
      const key = `img/art-${h}.jpg`;
      if (!existsSync(path.join(STORAGE, key))) await putStorage(key, buf);
      return { key, color: null };
    } catch { /* generated below */ }
  }
  const genKey = `img/gen-${sha12(Buffer.from(it.title))}.jpg`;
  if (!existsSync(path.join(STORAGE, genKey))) {
    await generateCover({ title: it.title, outPath: path.join(STORAGE, genKey) });
  }
  return { key: genKey, color: PALETTE[colorIndexFor(it.title)] };
}

/** Copy audio into storage; aiff converts to m4a (aac). Returns {key, ext, mime, size}. */
async function storeAudio(it) {
  const src = path.join(it.dir, it.name);
  const s = await stat(src);
  if (it.ext === "aiff" || it.ext === "aif") {
    const tmp = path.join(tmpdir(), `conv-${randomUUID()}.m4a`);
    await run("ffmpeg", ["-v", "error", "-i", src, "-c:a", "aac", "-b:a", "192k", tmp]);
    const buf = await readFile(tmp);
    const { rm } = await import("node:fs/promises");
    await rm(tmp, { force: true });
    const key = `a/${randomUUID()}.m4a`;
    await putStorage(key, buf);
    return { key, ext: "m4a", mime: MIME.m4a, size: buf.length };
  }
  const ext = it.ext === "mp4" ? "m4a" : it.ext;
  const key = `a/${randomUUID()}.${ext}`;
  await mkdir(path.dirname(path.join(STORAGE, key)), { recursive: true });
  await copyFile(src, path.join(STORAGE, key));
  return { key, ext, mime: MIME[ext] ?? "application/octet-stream", size: s.size };
}

let totalTracks = 0;
let totalAlbums = 0;

for (const a of plan) {
  const { id: ownerId } = await ownerIdFor(a.handle, a.artist);
  const instrumental = INSTRUMENTAL_ARTISTS.has(a.artist);

  for (const al of a.albums) {
    const sourceId = `local:${a.artist}/${al.rawName}`;
    let albumId = null;
    const existing = await sql`select id from albums where source_artwork_id = ${sourceId}`;
    if (existing.length) {
      albumId = existing[0].id;
    } else {
      const art = await artworkForAlbum(al);
      const r = await sql`
        insert into albums (user_id, title, artwork_key, color, source_artwork_id)
        values (${ownerId}, ${al.title}, ${art.key}, ${art.color}, ${sourceId})
        returning id`;
      albumId = r[0].id;
      totalAlbums++;
    }

    let done = 0;
    for (const it of al.items) {
      const dup = await sql`
        select 1 from tracks where user_id = ${ownerId} and album_id = ${albumId} and track_no = ${it.trackNo}`;
      if (dup.length) {
        done++;
        continue;
      }
      const audio = await storeAudio(it);
      const duration = await durationOf(path.join(it.dir, it.name));
      await sql`
        insert into tracks (user_id, album_id, track_no, title, audio_key, mime, ext,
          size_bytes, duration_sec, is_instrumental)
        values (${ownerId}, ${albumId}, ${it.trackNo}, ${it.title}, ${audio.key}, ${audio.mime},
          ${audio.ext}, ${audio.size}, ${duration}, ${instrumental})`;
      totalTracks++;
      done++;
      if (totalTracks % 50 === 0) console.log(`  … ${totalTracks} imported`);
    }
    console.log(`${a.artist} — ${al.title}: ${done} tracks`);
  }

  if (a.looseItems) {
    for (const it of a.looseItems) {
      const dup = await sql`
        select 1 from tracks where user_id = ${ownerId} and album_id is null and title = ${it.title}`;
      if (dup.length) continue;
      const audio = await storeAudio(it);
      const duration = await durationOf(path.join(it.dir, it.name));
      const art = await artworkForSingle(it);
      await sql`
        insert into tracks (user_id, title, audio_key, mime, ext, size_bytes, duration_sec,
          artwork_key, color, is_instrumental)
        values (${ownerId}, ${it.title}, ${audio.key}, ${audio.mime}, ${audio.ext}, ${audio.size},
          ${duration}, ${art.key}, ${art.color}, ${instrumental})`;
      totalTracks++;
    }
    console.log(`${a.artist} — singles: ${a.looseItems.length}`);
  }
}

console.log(`\nDone: ${totalTracks} tracks, ${totalAlbums} albums.`);
await sql.end();

} // end IS_MAIN
