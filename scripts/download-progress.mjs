#!/usr/bin/env node
// Progress report for the SoundCloud bulk download in imports/soundcloud.
import { readdir, stat, readFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "imports/soundcloud");
const TOTAL = 1053; // tracks enumerated from soundcloud.com/hymnstream/tracks

const files = await readdir(DIR).catch(() => []);
const audio = files.filter((f) => /\.(mp3|m4a|aac|ogg|opus|flac|wav)$/.test(f));

const entries = [];
for (const f of audio) {
  const s = await stat(path.join(DIR, f)).catch(() => null);
  if (s) entries.push({ f, mtime: s.mtimeMs, size: s.size });
}
entries.sort((a, b) => a.mtime - b.mtime);

const now = Date.now();
const recent = entries.filter((e) => now - e.mtime < 10 * 60 * 1000);
const perMin = recent.length / 10;
const remaining = Math.max(0, TOTAL - entries.length);
const etaMin = perMin > 0.05 ? Math.round(remaining / perMin) : null;
const bytes = entries.reduce((a, e) => a + e.size, 0);

let lastTitle = "";
try {
  const id = entries[entries.length - 1].f.replace(/\.\w+$/, "");
  const info = JSON.parse(await readFile(path.join(DIR, `${id}.info.json`), "utf8"));
  lastTitle = info.title ?? id;
} catch {}

const pct = ((entries.length / TOTAL) * 100).toFixed(1);
console.log(`SoundCloud download: ${entries.length} / ${TOTAL} tracks (${pct}%)`);
console.log(`  on disk:        ${(bytes / 1024 / 1024).toFixed(1)} MB`);
if (perMin > 0.05) {
  console.log(
    `  rate:           ${perMin.toFixed(1)} tracks/min over last 10 min` +
      (etaMin !== null
        ? ` — roughly ${etaMin >= 60 ? `${(etaMin / 60).toFixed(1)} h` : `${etaMin} min`} left`
        : ""),
  );
} else {
  console.log("  rate:           no downloads in the last 10 minutes (paused or finished?)");
}
if (lastTitle) console.log(`  latest fetched: "${lastTitle}"`);
