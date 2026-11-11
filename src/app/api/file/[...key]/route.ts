import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * Local-storage-mode file server (dev / self-host without R2). Supports HTTP
 * Range so seeking works; objects are immutable so we cache aggressively.
 */
const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  wav: "audio/wav",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  if (parts.some((p) => !/^[a-zA-Z0-9._-]+$/.test(p))) {
    return new Response("Not found", { status: 404 });
  }
  const full = path.join(process.cwd(), ".storage", ...parts);

  let stat;
  try {
    stat = await fs.stat(full);
    if (!stat.isFile()) throw new Error("not a file");
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(full).slice(1).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";

  const headers = new Headers({
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start: number;
      let end = stat.size - 1;
      if (m[1] === "") {
        // suffix range: bytes=-N (last N bytes)
        const n = m[2] === "" ? stat.size : parseInt(m[2], 10);
        start = Math.max(0, stat.size - n);
      } else {
        start = parseInt(m[1], 10);
        if (m[2] !== "") end = Math.min(parseInt(m[2], 10), stat.size - 1);
      }
      if (start > end || start >= stat.size) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${stat.size}` },
        });
      }
      headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      headers.set("Content-Length", String(end - start + 1));
      const stream = Readable.toWeb(
        createReadStream(full, { start, end }),
      ) as unknown as ReadableStream;
      return new Response(stream, { status: 206, headers });
    }
  }

  headers.set("Content-Length", String(stat.size));
  const stream = Readable.toWeb(createReadStream(full)) as unknown as ReadableStream;
  return new Response(stream, { status: 200, headers });
}
