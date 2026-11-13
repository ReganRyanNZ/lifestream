#!/usr/bin/env node
/**
 * Apply artwork-read album titles (from .storage/work/album-groups.json, built
 * from .storage/work/titles.tsv) to the database:
 *   - rename every album group to its real title (never all-caps)
 *   - merge groups sharing a title into one album (largest group wins, keeps
 *     its artwork), moving all tracks over
 *   - renumber track_no in original SoundCloud upload order
 *   - set credited artist overrides where known
 * Safe to re-run.
 */
import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://regan@localhost:5432/lifestream");

// ---- corrections from review ----
const TITLE_FIXES = {
  "4brothers": "Four Brothers",
  "stephen joseph keep spreading lord": "Keep Spreading Lord",
  "be thou supreme the green room": "Be Thou Supreme",
};
const ARTIST_OVERRIDES = {
  "keep spreading lord": "Stephen & Joseph",
  "be thou supreme": "The Green Room",
  "with those in long beach": "Long Beach",
  "christ only always": "Long Beach Trainees",
  "the dance of two camps": "chords of a man",
};

const titleCase = (s) =>
  s === s.toUpperCase() && /[A-Z]/.test(s)
    ? s
        .toLowerCase()
        .replace(/(^|[\s'—-])([a-z])/g, (_, p, c) => p + c.toUpperCase())
        .replace(/\bWa\b/, "WA")
    : s;

const groups = JSON.parse(await readFile(".storage/work/album-groups.json", "utf8"));

// upload dates for ordering
const dir = "imports/soundcloud";
const uploadDate = new Map();
for (const f of (await readdir(dir)).filter((f) => f.endsWith(".info.json"))) {
  try {
    const info = JSON.parse(await readFile(`${dir}/${f}`, "utf8"));
    uploadDate.set(f.replace(/\.info\.json$/, ""), String(info.upload_date ?? ""));
  } catch {}
}

let renamed = 0,
  mergedInto = 0,
  deletedAlbums = 0,
  renumbered = 0;

for (const g of groups) {
  // resolve final title
  const normKey = g.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let title = TITLE_FIXES[normKey] ?? g.title;
  title = titleCase(title);
  const finalNorm = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const artist = ARTIST_OVERRIDES[finalNorm] ?? null;

  // canonical album = group with the most tracks (stable: first max)
  const rows = await sql`select id, source_artwork_id, title from albums where source_artwork_id in ${sql(g.ids)} order by created_at`;
  if (rows.length === 0) continue;
  let canonical = rows[0];
  const counts = await sql`select album_id, count(*)::int as n from tracks where album_id in ${sql(rows.map((r) => r.id))} group by album_id`;
  const countMap = new Map(counts.map((c) => [c.album_id, c.n]));
  canonical = rows.reduce((a, b) => ((countMap.get(b.id) ?? 0) > (countMap.get(a.id) ?? 0) ? b : a));

  // rename canonical (+ artist credit)
  await sql`update albums set title = ${title}, artist_name = ${artist} where id = ${canonical.id}`;
  renamed++;

  // merge siblings into canonical
  const siblings = rows.filter((r) => r.id !== canonical.id);
  if (siblings.length > 0) {
    await sql`update tracks set album_id = ${canonical.id} where album_id in ${sql(siblings.map((r) => r.id))}`;
    mergedInto += siblings.length;
    await sql`delete from albums where id in ${sql(siblings.map((r) => r.id))}`;
    deletedAlbums += siblings.length;
  }

  // renumber in upload order (fallback: existing track_no)
  const tracks = await sql`select id, source_sc_id, track_no from tracks where album_id = ${canonical.id}`;
  tracks.sort(
    (a, b) =>
      (uploadDate.get(a.source_sc_id) ?? "").localeCompare(uploadDate.get(b.source_sc_id) ?? "") ||
      (a.track_no ?? 999) - (b.track_no ?? 999),
  );
  for (let i = 0; i < tracks.length; i++) {
    await sql`update tracks set track_no = ${i + 1} where id = ${tracks[i].id}`;
    renumbered++;
  }
  console.log(`${title}${artist ? ` [${artist}]` : ""} — ${tracks.length} tracks`);
}

const final = await sql`select count(*)::int as albums from albums`;
console.log(
  `\nDone: ${renamed} titled, ${deletedAlbums} duplicates merged, ${renumbered} tracks renumbered. Albums now: ${final[0].albums}`,
);
await sql.end();
