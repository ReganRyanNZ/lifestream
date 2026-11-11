/* Life Stream service worker — offline audio caching.
 *
 * Caches:
 *   ls-static-v1  — hashed build assets, icons, manifest (cache-first)
 *   ls-audio-v1   — recently played audio + artwork (cache-first, bounded LRU-ish)
 *   ls-pinned-v1  — explicitly pinned "download" content (never auto-evicted)
 *   ls-pages-v1   — visited pages (network-first, offline fallback)
 *   ls-api-v1     — API GETs (network-first)
 *
 * Audio responses are cached normalized (status 200, no Content-Range) so the
 * worker can synthesize 206 range responses for seeking and serve full files
 * offline. Requires CORS on the storage origin (audio element uses
 * crossorigin="anonymous"), otherwise responses are opaque and unreadable.
 */

const VERSION = "v1";
const STATIC = `ls-static-${VERSION}`;
const AUDIO = `ls-audio-${VERSION}`;
const PINNED = `ls-pinned-${VERSION}`;
const PAGES = `ls-pages-${VERSION}`;
const API = `ls-api-${VERSION}`;
const AUDIO_BUDGET = 200; // max entries in the playback cache

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC, AUDIO, PINNED, PAGES, API]);
      for (const name of await caches.keys()) {
        if (!keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "CLEAR_CACHE") {
    const name = data.cache === "pinned" ? PINNED : AUDIO;
    event.waitUntil(
      (async () => {
        await caches.delete(name);
        const client = await self.clients.get(event.source.id);
        client?.postMessage({ type: "CACHE_CLEARED", cache: data.cache });
      })(),
    );
  }
});

const isAudioPath = (pathname) =>
  pathname.startsWith("/a/") ||
  pathname.startsWith("/img/") ||
  pathname.startsWith("/api/file/a/") ||
  pathname.startsWith("/api/file/img/");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // audio + artwork on any origin (R2 custom domain in prod, same-origin in dev)
  if (isAudioPath(url.pathname)) {
    event.respondWith(audioHandler(req));
    return;
  }

  if (url.origin !== self.location.origin) return; // other cross-origin: passthrough

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/sw.js"
  ) {
    event.respondWith(cacheFirst(req, STATIC));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    // never intercept write-ish or volatile endpoints
    if (url.pathname.startsWith("/api/plays")) return;
    event.respondWith(networkFirst(req, API));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(navigationHandler(req));
    return;
  }
});

// ---------- strategies ----------

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreVary: true });
  if (cached) return cached;
  const resp = await fetch(req);
  if (resp.ok) cache.put(req, resp.clone()).catch(() => {});
  return resp;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const resp = await fetch(req);
    if (resp.ok && resp.type === "basic") cache.put(req, resp.clone()).catch(() => {});
    return resp;
  } catch {
    const cached = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
    if (cached) return cached;
    throw new Error("offline and not cached");
  }
}

const OFFLINE_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · Life Stream</title>
<style>body{background:#0a0e13;color:#e8edf4;font-family:system-ui,sans-serif;
display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:2rem}
p{max-width:28rem;line-height:1.6;color:#8b98a9}h1{font-size:1.25rem;margin-bottom:.5rem}</style></head>
<body><div><h1>You're offline</h1><p>Tracks you've already played (or pinned) still work from this
device's cache — press play on them from your Library or History. Everything else returns when your
connection does.</p></div></body></html>`;

async function navigationHandler(req) {
  try {
    return await networkFirst(req, PAGES);
  } catch {
    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

// ---------- audio (cache-first + range synthesis) ----------

async function audioHandler(req) {
  const rangeHeader = req.headers.get("range");
  const cacheKey = new Request(new URL(req.url).toString()); // range-free key

  for (const name of [PINNED, AUDIO]) {
    const cache = await caches.open(name);
    const cached = await cache.match(cacheKey, { ignoreVary: true });
    if (cached) {
      if (rangeHeader) {
        const partial = await synthesizeRange(cached, rangeHeader);
        if (partial) return partial;
      }
      return cached;
    }
  }

  const resp = await fetch(req); // pass range through to the network

  if (resp.status === 200 || resp.status === 206) {
    const rh = rangeHeader ?? "";
    const isFullGet = rh === "";
    const isOpenFromZero = /^bytes=0-$/.test(rh.trim());
    if (isFullGet || isOpenFromZero) {
      // Cache in the background — never block the response going back to the
      // media element, or playback/advancing stalls behind the full download.
      cacheFullResponse(resp.clone(), cacheKey).catch(() => {});
    }
  }
  return resp;
}

async function cacheFullResponse(src, cacheKey) {
  const body = await src.arrayBuffer();
  const headers = new Headers(src.headers);
  headers.delete("content-range");
  headers.set("accept-ranges", "bytes");
  const cache = await caches.open(AUDIO);
  await cache.put(cacheKey, new Response(body, { status: 200, headers }));
  await trimAudioCache(cache);
}

/** Build a 206 from a cached full-body response. Returns null if unparseable. */
async function synthesizeRange(cached, rangeHeader) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!m) return null;
  const buf = await cached.clone().arrayBuffer();
  const total = buf.byteLength;
  let start;
  let end = total - 1;
  if (m[1] === "") {
    const n = m[2] === "" ? total : parseInt(m[2], 10);
    start = Math.max(0, total - n);
  } else {
    start = parseInt(m[1], 10);
    if (m[2] !== "") end = Math.min(parseInt(m[2], 10), total - 1);
  }
  if (start > end || start >= total) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }
  const headers = new Headers(cached.headers);
  headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(buf.slice(start, end + 1), { status: 206, headers });
}

async function trimAudioCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= AUDIO_BUDGET) return;
  // Cache Storage returns keys roughly in insertion order; drop the oldest third.
  const toDelete = keys.slice(0, keys.length - AUDIO_BUDGET);
  await Promise.all(toDelete.map((k) => cache.delete(k)));
}
