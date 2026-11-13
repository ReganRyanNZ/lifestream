#!/usr/bin/env node
/**
 * Generate the solid-color / italic-serif album covers used when an import
 * has no artwork of its own (matches the covers already in the library:
 * plain color field, title centered in an italic serif, wrapped).
 *
 * Reusable: `import { generateCover } from "./gen-album-art.mjs"` — or from
 * the CLI:
 *   node scripts/gen-album-art.mjs --title="Into His Marvellous Light" out.jpg
 *   node scripts/gen-album-art.mjs --title=Foo --color=6 out.png
 *
 * The palette is curated to sit with the site's dark slate UI and sky-blue
 * accent: muted, mid-tone hues with similar chroma so any set of albums
 * looks like one collection. Color choice is deterministic per title (hash),
 * or force one with --color=<index>.
 */
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

export const PALETTE = [
  "#a58e8e", // warm rose-gray
  "#c17a5a", // terracotta
  "#b98a4e", // clay / amber
  "#93a26b", // olive
  "#6f8f7d", // deep sage
  "#5c9698", // teal
  "#7fae9e", // seafoam
  "#6d94c0", // dusty sky
  "#6a7fb5", // slate blue
  "#8b8cc4", // periwinkle
  "#9a7fb0", // mauve
  "#8d6b8f", // plum
  "#7d8fa3", // slate
  "#b07b8c", // dusty rose
];

const FONT = "/System/Library/Fonts/Supplemental/Georgia Italic.ttf";

/** Deterministic palette index for a string. */
export function colorIndexFor(key) {
  const h = createHash("sha1").update(key).digest();
  return h[0] % PALETTE.length;
}

/** Greedy word wrap; CJK / unspaced text wraps by characters instead. */
function wrap(title, maxChars) {
  const lines = [];
  if (!/\s/.test(title)) {
    for (let i = 0; i < title.length; i += maxChars) lines.push(title.slice(i, i + maxChars));
    return lines;
  }
  for (const para of title.split(/\n+/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if ((line + " " + word).length <= maxChars) line += " " + word;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.slice(0, 4); // 4 lines max; the rest truncates
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

/**
 * Render a cover to `outPath` (.jpg/.png by extension).
 * Returns the palette color used (hex, without #).
 */
export async function generateCover({ title, outPath, color }) {
  const idx =
    color != null
      ? ((Number(color) % PALETTE.length) + PALETTE.length) % PALETTE.length
      : colorIndexFor(title);
  const hex = PALETTE[idx].slice(1);

  const maxChars = title.length > 72 ? 26 : title.length > 40 ? 22 : 18;
  const lines = wrap(title, maxChars);
  const fontsize = lines.length >= 4 ? 40 : lines.length === 3 ? 48 : lines.length === 2 ? 56 : 64;

  const dir = await mkdtemp(path.join(tmpdir(), "cover-"));
  const textFile = path.join(dir, "title.txt");
  await writeFile(textFile, lines.join("\n"), "utf8");
  try {
    await run("ffmpeg", [
      "-v", "error",
      "-f", "lavfi", "-i", `color=c=0x${hex}:s=600x600`,
      "-frames:v", "1",
      "-vf",
      `drawtext=fontfile='${FONT}':textfile='${textFile}':fontcolor=white:` +
        `fontsize=${fontsize}:line_spacing=14:shadowcolor=black@0.35:shadowx=2:shadowy=2:` +
        `x=(w-text_w)/2:y=(h-text_h)/2`,
      "-q:v", "3",
      outPath,
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return hex;
}

// ---------- CLI ----------
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = new Map();
  let out = null;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      args.set(k, v ?? true);
    } else out = a;
  }
  if (!out || !args.get("title")) {
    console.log("usage: gen-album-art.mjs --title=\"Album title\" [--color=N] out.jpg");
    process.exit(1);
  }
  const hex = await generateCover({ title: String(args.get("title")), outPath: out, color: args.get("color") });
  console.log(`${out} — color #${hex}`);
}
