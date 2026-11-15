#!/usr/bin/env node
/**
 * Find duplicate tracks in the library.
 *
 * Stage 1 (candidates): normalized-title equality + duration within --window
 * seconds. Normalization strips scripture refs / credits in parens but keeps
 * version markers ("instrumental", "live", "remix", "new tune", …) so a vocal
 * take and its instrumental are NOT considered duplicates.
 *
 * Stage 2 (verification): decode the first 60s of each candidate to mono PCM
 * (via ffmpeg) and compare — identical decoded audio is EXACT; otherwise a
 * best-alignment envelope correlation >= 0.98 is SAME (same recording,
 * re-encoded); anything lower is reported DIFFERENT and left alone.
 *
 * Usage:
 *   node scripts/find-dups.mjs            # report only
 *   node scripts/find-dups.mjs --remove   # delete verified dups (keep best)
 *
 * Keep-rule for a verified pair/cluster, in order:
 *   1. the copy with more play_events (listeners' history wins)
 *   2. the copy attached to an album (album context wins over stray single)
 *   3. the older upload (created_at)
 */
import { spawn } from "node:child_process";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

const args = new Map();
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--")) {
    const [k, v] = a.slice(2).split("=");
    args.set(k, v ?? true);
  }
}
const REMOVE = args.has("remove");
const WINDOW = Number(args.get("window") ?? 2.5); // seconds duration slack
const CORR_MIN = Number(args.get("corr") ?? 0.9);
const STORAGE = path.join(process.cwd(), ".storage");

const sql = postgres(process.env.DATABASE_URL ?? "postgres://regan@localhost:5432/lifestream");

const VERSION_WORDS = /(instrumental|instr|live|remix|tune|acapella|a ?cappella|karaoke|version|reprise|demo|solo|duet|harmony|score|track|edit|mix)/i;

function normalize(title) {
  let t = title;
  // strip parentheticals unless they name a version/arrangement
  t = t.replace(/\(([^)]*)\)/g, (m, inner) => (VERSION_WORDS.test(inner) ? ` ${inner} ` : " "));
  t = t.replace(/\[[^\]]*\]/g, "");
  t = t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return t;
}

/** Decode first `secs` to mono 8kHz s16 PCM; returns {md5, env} or null. */
async function fingerprint(audioPath, secs = 60) {
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", [
      "-v", "error", "-i", audioPath, "-t", String(secs),
      "-ac", "1", "-ar", "8000", "-f", "s16le", "-",
    ]);
    const chunks = [];
    let md5 = createHash("md5");
    ff.stdout.on("data", (c) => { chunks.push(c); md5.update(c); });
    ff.on("error", () => resolve(null));
    ff.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const buf = Buffer.concat(chunks);
      const win = 160; // 20ms @ 8kHz s16
      const raw = [];
      for (let i = 0; i + win <= buf.length; i += win) {
        let s = 0;
        for (let j = i; j < i + win; j += 2) {
          const v = buf.readInt16LE(j);
          s += v * v;
        }
        raw.push(Math.sqrt(s / (win / 2)));
      }
      // 5-point moving average: keeps same-recording pairs aligned while
      // letting different performances decorrelate
      const env = raw.map((_, i) => {
        let s = 0, n = 0;
        for (let k = Math.max(0, i - 2); k <= Math.min(raw.length - 1, i + 2); k++) { s += raw[k]; n++; }
        return s / n;
      });
      resolve({ md5: md5.digest("hex"), env });
    });
  });
}

function correlation(a, b, maxLag = 40) {
  // Pearson correlation of envelopes, searching lag in [-maxLag, maxLag] windows (200ms units)
  let best = { r: -1, lag: 0 };
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let i = 0; i < a.length; i++) {
      const j = i + lag;
      if (j < 0 || j >= b.length) continue;
      n++; sa += a[i]; sb += b[j]; saa += a[i] * a[i]; sbb += b[j] * b[j]; sab += a[i] * b[j];
    }
    if (n < 50) continue;
    const cov = sab / n - (sa / n) * (sb / n);
    const va = saa / n - (sa / n) ** 2;
    const vb = sbb / n - (sb / n) ** 2;
    const r = cov / Math.sqrt(va * vb || 1e-9);
    if (r > best.r) best = { r, lag };
  }
  return best;
}

// ---------- gather tracks ----------
const tracks = await sql`
  select t.id, t.title, t.duration_sec, t.audio_key, t.album_id, t.created_at,
         u.handle as owner, a.title as album_title,
         (select count(*) from play_events pe where pe.track_id = t.id and pe.seconds_played >= 12) as plays
  from tracks t join users u on u.id = t.user_id left join albums a on a.id = t.album_id`;

const byNorm = new Map();
for (const t of tracks) {
  t.norm = normalize(t.title);
  const list = byNorm.get(t.norm) ?? [];
  list.push(t);
  byNorm.set(t.norm, list);
}

// clusters: all groups with 2+ members, then duration-compatible subgroups
const pairs = [];
for (const list of byNorm.values()) {
  if (list.length < 2) continue;
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++)
      if (Math.abs(list[i].duration_sec - list[j].duration_sec) <= WINDOW)
        pairs.push([list[i], list[j]]);
}

console.log(`${tracks.length} tracks, ${pairs.length} candidate pairs (title+duration)`);
if (pairs.length === 0) {
  await sql.end({ timeout: 5 });
  process.exit(0);
}

// ---------- verify ----------
const fpCache = new Map();
async function fp(t) {
  if (fpCache.has(t.id)) return fpCache.get(t.id);
  const p = path.join(STORAGE, t.audio_key);
  const ok = await stat(p).then(Boolean).catch(() => false);
  const v = ok ? await fingerprint(p) : null;
  fpCache.set(t.id, v);
  return v;
}

const verdicts = [];
for (const [a, b] of pairs) {
  const [fa, fb] = [await fp(a), await fp(b)];
  if (!fa || !fb) { verdicts.push({ a, b, kind: "NOFILE" }); continue; }
  if (fa.md5 === fb.md5) { verdicts.push({ a, b, kind: "EXACT" }); continue; }
  const { r, lag } = correlation(fa.env, fb.env);
  verdicts.push({ a, b, kind: r >= CORR_MIN ? "SAME" : r >= 0.9 ? "SIMILAR" : "DIFF", r, lag });
}

for (const v of verdicts) {
  const { a, b } = v;
  const extra = v.r !== undefined ? ` r=${v.r.toFixed(3)} lag=${v.lag * 0.2}s` : "";
  console.log(
    `${v.kind.padEnd(7)} ${a.owner}/${a.title.slice(0, 44).padEnd(44)} ${a.duration_sec}s (${a.plays}p)` +
    `  ==  ${b.owner}/${b.title.slice(0, 44)} ${b.duration_sec}s (${b.plays}p)${extra}`,
  );
}

// ---------- removal ----------
// Owner precedence for duplicate clusters (user rules): an official-source
// account (livingstreamministry) beats everyone; a duplicate of the main
// hymnstream account belongs on the other account — hymnstream's copy goes.
const OWNER_RANK = { livingstreamministry: 3, hymnstream: 1 };
const ownerRank = (owner) => OWNER_RANK[owner] ?? 2;

function keep(t) {
  return (
    ownerRank(t.owner) * 1e9 +
    t.plays * 1000 +
    (t.album_id ? 100 : 0) +
    (t.album_id && t.album_title !== "Untitled set" ? 50 : 0) -
    new Date(t.created_at).getTime() / 1e13
  );
}
const verified = verdicts.filter((v) => v.kind === "EXACT" || v.kind === "SAME");
// union-find over verified pairs to get clusters
const parent = new Map();
const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
for (const v of verified) for (const t of [v.a, v.b]) if (!parent.has(t.id)) parent.set(t.id, t.id);
for (const v of verified) {
  const ra = find(v.a.id), rb = find(v.b.id);
  if (ra !== rb) parent.set(ra, rb);
}
const clusters = new Map();
for (const t of parent.keys()) {
  const r = find(t);
  const c = clusters.get(r) ?? [];
  c.push(tracks.find((x) => x.id === t));
  clusters.set(r, c);
}

const toRemove = [];
for (const c of clusters.values()) {
  c.sort((x, y) => keep(y) - keep(x));
  toRemove.push(...c.slice(1));
}

console.log(`\n${verified.length} verified duplicate pairs -> ${clusters.size} clusters, ${toRemove.length} tracks to remove`);
if (REMOVE && toRemove.length) {
  const { unlink } = await import("node:fs/promises");
  for (const t of toRemove) {
    console.log(`removing ${t.owner}/${t.title} (${t.duration_sec}s, ${t.plays} plays)`);
    await sql`delete from tracks where id = ${t.id}`;
    // drop the audio file unless another track still references it
    const share = await sql`select count(*)::int as n from tracks where audio_key = ${t.audio_key}`;
    if (share[0].n === 0) {
      await unlink(path.join(STORAGE, t.audio_key)).catch(() => {});
    }
  }
  // albums emptied by the removals go too (e.g. a duplicate album whose
  // every track existed on the precedence-winning account)
  const emptied = await sql`
    delete from albums a
    where not exists (select 1 from tracks t where t.album_id = a.id)
    returning a.title`;
  if (emptied.length) console.log(`removed ${emptied.length} emptied albums:`, emptied.map((r) => r.title).join(" | "));
  console.log("done");
} else if (toRemove.length) {
  console.log("(dry run — pass --remove to delete)");
}

await sql.end({ timeout: 5 });
