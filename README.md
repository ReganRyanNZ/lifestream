# Life Stream

A SoundCloud-style music PWA for sharing church-community recordings: listen
without an account, like and build playlists with one, aggressive offline
caching, and background/lock-screen playback. Full architecture and decision
log in [PLAN.md](./PLAN.md).

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4) — UI + API
- **Postgres** (Neon in prod / Postgres.app locally) via **Drizzle ORM**
- **Cloudflare R2** for audio/artwork in prod; `.storage/` directory served by
  `/api/file/*` in local dev (STORAGE_MODE=local|r2)
- Hand-rolled **service worker** (`public/sw.js`): cache-first audio with range
  synthesis for offline seeking, bounded playback cache, network-first pages
  with offline fallback
- **Media Session API** wired from day one (lock-screen controls, iOS
  background playback technique)

## Local development

```bash
# 1. Postgres (any local instance; default URL assumes Postgres.app)
createdb lifestream

# 2. Schema
npm install
npm run db:push

# 3. Import the SoundCloud library (after/during the yt-dlp download)
node scripts/import-soundcloud.mjs --dry          # preview artwork-grouped albums
node scripts/import-soundcloud.mjs \
  --email=you@example.com --password=yourpassword # idempotent, re-run anytime

# 4. Run
npm run dev
```

The bulk download (one-time, resumable — it was started from the project root
and writes to `imports/`):

```bash
yt-dlp -P imports/soundcloud --download-archive imports/soundcloud/archive.txt \
  -f "hls_aac_160k/hls_aac_96k/bestaudio" --write-info-json --no-write-thumbnail \
  --sleep-interval 1 --max-sleep-interval 3 --ignore-errors \
  -o "%(id)s.%(ext)s" "https://soundcloud.com/hymnstream/tracks"
```

Album grouping: the SoundCloud account has no album metadata, so the importer
groups tracks by **artwork content hash** (identical image bytes = same album;
SoundCloud gives every upload a unique artwork id even for the same image).
Groups of ≥2 tracks become albums titled "Untitled set" — name them with
`--titles=album-titles.json` (`{"<hash>": "Title"}`, hashes printed by `--dry`)
or later via the admin UI.

Owner account for the import is `@hymnstream` (isAdmin). In local dev it was
created as `owner@lifestream.local` / `lifestream-dev` — change for production.

## Production checklist (not yet done)

1. **Vercel** project (Hobby) — `vercel link`, push, deploy; audio never
   proxies through Vercel.
2. **Neon** Postgres — set `DATABASE_URL`, run `npm run db:push`.
3. **Cloudflare R2** — create bucket; API token (S3-compatible keys); enable
   bucket CORS (GET, `*` origin) so the service worker can slice audio; bind a
   custom domain (`cdn.<domain>`) and set env: `STORAGE_MODE=r2`,
   `R2_PUBLIC_BASE`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET`. Re-run the importer against prod creds.
4. **Resend** — API key for upload-notification and password-reset emails.
5. Domain + Cloudflare Email Routing for a support address.

## Status (2026-11-11)

Phase 1 core built and verified in-browser: library browse (artist/album/track
pages), player with Media Session + next-track preload, playback cache SW,
anonymous listening, auth (permanent sessions), likes, playlists, search,
popularity-weighted shuffle, play counting with public counts, settings/storage
page, PWA icons + manifest. Still to build (Phase 2): in-app uploads +
Turnstile, moderation email + admin view, pin-for-offline UI, analytics
dashboard. Background download of the 1,053-track SoundCloud library was
in progress; re-run the importer when it completes.
