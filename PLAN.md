# lifestream — streaming music PWA

Status: planning · Last updated: 2026-11-11 · Decisions locked in §17

## 1. What this is

- A crowd-sourced music sharing site for a church community (open signup, expected dozens–low-thousands of users)
- Users **are** the artists: people upload their own recordings; there is no separate "artist" entity and no third-party music
- Anyone can **listen without an account**; accounts unlock likes, playlists, and uploading
- Organised as user → albums → tracks; albums are just groupings that behave like playlists (no "singles" concept, no year metadata)
- Installable PWA: aggressive client caching, offline listening, keeps playing with the screen off
- Near-zero running cost (~$1–2/month all-in)

Non-goals: monetization, native apps, social features beyond likes/playlists, video/podcasts, lossless tier, waveforms (skipped), per-user storage quotas (manual oversight instead).

---

## 2. Recommended architecture

```
┌─────────────────────────────────────────────┐
│  Browser (installed PWA)                     │
│   Next.js UI · single <audio> element        │
│   Media Session API · Workbox service worker │
│   Cache Storage (audio LRU + pinned offline) │
└──────┬───────────────────────────┬──────────┘
       │ metadata/API (small JSON) │ audio + artwork
       │                           │ (immutable, range, CORS)
┌──────▼──────────┐        ┌───────▼──────────────────┐
│ Next.js on      │        │ Cloudflare R2             │
│ Vercel (Hobby)  │        │ cdn.<domain>              │
│  pages, API,    │        │  /a/<trackId>.<ext>       │
│  presigned      │        │  /img/<hash>.jpg          │
│  uploads        │        │ zero egress fees          │
└──────┬──────────┘        └───────▲──────────────────┘
       │                           │ direct presigned PUT
┌──────▼──────────┐                │ (never through functions)
│ Neon Postgres   │────────────────┘
└──────┬──────────┘
       │ notification emails (new upload, password reset)
┌──────▼──────────┐
│ Resend (free)   │
└─────────────────┘
```

| Piece | Choice | Why |
|---|---|---|
| App | Next.js (App Router) + TypeScript, on Vercel Hobby | One codebase for UI + API, $0 hosting, HTTPS + PWA trivial |
| DB | Neon Postgres (free tier ≈0.5 GB) + Drizzle ORM | Metadata only; tiny. Raw play events pruned + rolled up monthly (§13) |
| Audio/artwork | **Cloudflare R2** behind a custom domain | **Zero egress fees** — the key cost decision for a streaming app |
| Email | Resend free tier (100/day) | Upload-review notifications to the owner + password resets |
| Bot protection | Cloudflare Turnstile (free) on signup + upload only | Keeps listening friction-free (§10) |
| Offline/cache | Workbox service worker + Cache Storage | Cache-first audio, offline pinning |
| Auth | Email + password (argon2), permanent sessions (§9) | $0, dependency-free |
| Styling | Tailwind (+ shadcn/ui if wanted) | Fast, small |

Rules of thumb: never proxy audio through Vercel functions/rewrites (bandwidth); link straight to R2 URLs. Dev can run entirely on free subdomains (`*.vercel.app` + R2's free `*.r2.dev`) — domain only needed at production launch.

**Uptime posture (per requirement "mostly available is fine"):** nothing extra to buy. Free tiers have occasional blips; acceptable. Two free resilience wins: (1) Neon autosuspend cold-start is sub-second; (2) the PWA keeps working for listening even when the backend is down — the service worker serves the cached app shell + cached/pinned audio, and writes (likes, play counts) queue in IndexedDB and sync when the server returns.

---

## 3. Audio storage & delivery

- **Bucket layout:** `a/<trackId>.<ext>` (audio), `img/<contentHash>.jpg` (artwork). Content-keyed, immutable: audio objects never change in place, so everything can cache them forever.
- **Headers:** `Cache-Control: public, max-age=31536000, immutable` on audio + artwork. Browsers and Cloudflare's edge serve repeats for free.
- **Range requests:** native on R2 (seeking works); Workbox `RangeRequestsPlugin` lets the SW synthesise seeks from cached files.
- **CORS:** bucket configured to allow the app origin — without it the SW gets opaque responses it can't slice for offline seeking.
- **Playback URLs are public + unguessable** (no signing): the library is meant to be heard, and this caches perfectly.
- **Formats:** accept and serve as-uploaded: mp3, m4a/aac (iPhone/Android voice recordings), ogg, opus, flac, wav. mp3 + m4a play everywhere; the rest are fine on modern browsers (spot-check in Phase 0). No transcoding in v1; revisit (64k Opus derivatives) only if bandwidth ever matters.
- **Sizing:** 8–10 GB at launch → 15–20 GB within a year. Storage beyond R2's free 10 GB: 10 GB × $0.015 ≈ **$0.15/mo**. Egress always $0.

**Cost math:** 128 kbps ≈ 1 MB/min ≈ 60 MB/h. A few thousand listeners streaming freely ≈ $0 egress on R2 (vs ~$85/TB on S3+CloudFront). Client caching (§4) means regular listeners mostly hit their device cache, not the network at all.

---

## 4. Client caching & offline

Two layers, both in Cache Storage via the service worker:

1. **Automatic playback cache:** every track played is cached cache-first, bounded LRU (default 1 GB Android / 500 MB iOS, user-adjustable in Settings). Replay is instant and costs no bandwidth.
2. **Pinned offline ("download"):** toggle per track/album/playlist; page-side `cache.add()` into a pinned cache. An "On device" screen lists pinned content and total size.

Rules:

- SW routing: `/a/*`, `/img/*` → cache-first; API JSON → stale-while-revalidate.
- `navigator.storage.persist()` on first login (asks the browser not to evict us).
- Settings shows `storage.estimate()` ("2.1 GB used / ~12 GB available"), cache-size slider, "clear cached music".
- **Quotas:** Chrome allows a generous disk share; iOS Safari ≈ 1 GB per origin and stingier under pressure — hence the conservative default. "Bigger if possible": the slider can go higher on Android.
- **iOS eviction:** Safari purges site data unused for 7 days *except installed home-screen web apps* → the iOS install sheet (Share → Add to Home Screen; no auto-prompt on iOS) protects the offline library.
- **Next-track preload:** when a track starts, prefetch the next 2–3 queue items into the playback cache. Also what makes background track-advance work on iOS (§5).

---

## 5. Background & lock-screen playback

"Phone off" in practice = screen off / locked. Platform reality:

| Platform | Screen off / locked | Notes |
|---|---|---|
| Android, installed PWA | ✅ reliable | Media notification, lock-screen controls |
| Android, browser tab | ✅ mostly | Audible tabs exempt from freezing |
| iOS Safari tab | ⚠️ works with the right technique | iOS 15.4+; Media Session handlers + preloaded next track |
| iOS home-screen PWA | ⚠️ same technique | Also exempts cached data from the 7-day purge — prefer installed |

Technique (day 1): one shared `<audio>` element (never remounted); register Media Session action handlers (`play`/`pause`/`previoustrack`/`nexttrack`/`seekto`) immediately; set metadata + artwork + `setPositionState()` per track; start from user gesture; preload next tracks. Lock-screen controls, Bluetooth, CarPlay/Android Auto come free with Media Session.

Per decision #9: plenty of iPhone users; we do our best for them (the above), but iOS limitations won't block development. **Still Phase 0: a throwaway page playing 3 files from R2, tested on real phones.**

---

## 6. Importing the existing library

Source: the hymnstream account's public tracks — **verified working with yt-dlp on 2026-11-11.**

Findings from the verification run:

- **1,053 tracks** enumerable; single-track download tested end-to-end (audio + info JSON + artwork, ~5s/track).
- **Originals are not exposed.** The source site serves only its own transcodes; for the sampled tracks the best is **HLS AAC 160 kbps** (m4a) — good quality (≈ mp3 192k), fine for streaming. `download` (original file) appears only if downloads were enabled per-track; none sampled had it.
- Metadata available per track: title, duration, upload date, description, artwork URL. → Estimated full download: ~2.5–4 GB, ~2–3 h with polite rate limiting (one-time, resumable).

Import pipeline (`scripts/import-library.mjs`):

1. `yt-dlp` pulls the whole account with `--download-archive` (resumable), `-f hls_aac_160k` (fall back to best available), `--write-info-json`, optional `--write-thumbnail`, into `imports/` (**gitignored** — never commit audio).
2. Script walks the folder, parses info JSONs, uploads each file to R2 with correct MIME (`audio/mp4` for m4a), stores the source track id for idempotent re-runs, inserts track rows under the owner account.

---

## 7. Uploads & moderation

- **In-app upload:** request presigned PUT → upload browser → R2 directly → POST metadata → server parses audio with `music-metadata` (duration, validation), sets MIME, publishes.
- **Open to all registered users, no storage quota** (owner monitors manually). Guardrails instead of limits: a **storage-by-user table in the admin view** + a Cloudflare R2 billing alert (e.g. >$5/mo) so abuse is visible without blocking anyone.
- **Moderation = publish-then-review:** every upload triggers an email to the owner (Resend) with track details and a direct link; an admin action can **unpublish** (hide, reversible) or **delete** (removes R2 object). This keeps friction low for legit users while giving the owner oversight.
- **Virus scanning: not needed for this threat model.** Browsers decode audio; they never execute it. Real protections we do have: (1) server-side parsing rejects anything that isn't actually audio; (2) files are served with correct `Content-Type` from R2 + `X-Content-Type-Options: nosniff` so nothing renders as HTML; (3) size cap ~100 MB; (4) the review email. AV products would only matter if we were distributing files people open on desktops — we're not.
- **Formats:** mp3, m4a/aac, ogg, opus, flac, wav; ≤100 MB; serve as-uploaded.

---

## 8. Data model (sketch)

- `users` — id, email, password_hash, handle, display_name, artist_name (nullable — shown on their music, defaults to display_name), color?, is_admin, created_at
- `sessions` — token_hash, user_id, expires_at, last_seen_at (supports permanent login + revoke-all)
- `albums` — id, user_id, title, artwork_key?, color?, position? — groupings owned by a user, behave like playlists
- `tracks` — id, user_id, album_id?, title, audio_key, mime, size_bytes, duration_sec, artwork_key?, color?, play_count (denormalised, public), is_published, source_sc_id?, created_at
- `playlists` — id, user_id, title · `playlist_tracks` — playlist_id, track_id, position (playlists may contain anyone's tracks)
- `likes` — user_id, track_id (unique)
- `play_events` — id, track_id, user_id?, played_at, seconds_played, client_uuid — powers play counts, popularity shuffle, and listening-hours analytics; raw rows pruned after 90 days, monthly rollups kept (§13)

No `artists` table (user == artist). No `year`. Tracks without an album simply appear in the user's track list.

Search: Postgres trigram index over track/user/album names (`ILIKE` + `pg_trgm`) — instant at this scale, no search service. Priority feature (§11).

---

## 9. Auth: email + password, permanent sessions

- argon2id password hashing; minimal fields (email, password, display name).
- **Permanent login:** httpOnly + Secure + SameSite=Lax cookie holding an opaque random token (only its hash stored in `sessions`), 365-day sliding expiry — refreshed on use, so active devices never get logged out. Manual logout revokes the session; password change revokes all sessions.
- **Password reset needs email** — one of the two things Resend is for (the other is upload notifications). No email verification required to sign up (church circles, low stakes).
- Anonymous visitors: full listening, no identity. Likes/playlists/upload require an account.

---

## 10. Anonymous listening & bots

Do bots try to stream? Sometimes (scrapers, AI crawlers) — but it doesn't matter here:

- **Cost:** R2 egress is free and reads (10M/month Class B ops free) plus Cloudflare's edge cache make scraping effectively $0. With unguessable IDs and immutable caching, a bot flood can't degrade human experience — repeats hit the CDN, not the origin.
- **What bots actually damage is writes:** fake signups and spam uploads. So protection goes exactly there: **Cloudflare Turnstile** (free, privacy-friendly, no puzzles for humans) + per-IP rate limits on signup and upload endpoints. Listening stays completely open — no login, no captcha, ever.
- Optional later: Cloudflare bot-fight mode on the R2 domain if a crawler ever gets obnoxious.

---

## 11. Search & weighted shuffle

Both priority features (decision #6):

- **Search:** trigram search across tracks, users, albums; server components render results; works anonymous. Phase 1 ships `ILIKE`, Phase 2 polishes with `pg_trgm` + typo tolerance.
- **Popularity-skewed shuffle:** sample the catalog (or a playlist/album/liked scope) with weights ≈ `(plays_28d + 2×likes + smoothing) ^ 0.7`:
  - exponent < 1 so one viral hit doesn't monopolise, smoothing constant so brand-new tracks still surface occasionally
  - recency window (28 days) keeps the mix following current taste rather than all-time totals
  - no immediate repeats within a session; weights recomputed nightly from `play_events`
  - tune the constants live once real play data exists — the point per the requirement: "bad songs almost never come up randomly."

---

## 12. Artwork

Per decision #16, per-song, simple:

- **Optional manual artwork upload** (image, resized server-side to a few standard sizes, stored in R2).
- **No artwork → generated cover:** the track title (and artist name) rendered on a solid background chosen from a small fixed palette (simple color picker at upload time, stored as `color`). Same mechanism for albums and user avatars. No ID3-embedded art extraction, no placeholder images to design.
- Import exception (§6): the imported back-catalog can keep its existing artwork.

---

## 13. Analytics & public play counts

Own the data in Postgres — no external analytics vendor needed (free, private, answers exactly the three questions asked):

- **Play counting:** a "play" registers after 30s or 50% listened (whichever first — YouTube-style) so skips don't inflate. Offline plays queue in IndexedDB with a client UUID and sync later (deduped).
- **Public play counts** on tracks (YouTube-style "1.2k plays") — denormalised `play_count` on tracks.
- **Admin dashboard:** monthly active listeners, total users, **listening hours per user per month** (sum of `seconds_played`), top tracks, storage by user (§7). One internal page querying rollup tables.
- **Retention:** raw `play_events` pruned after 90 days; monthly rollups (per-track, per-user, per-day aggregates) kept forever — keeps the Neon free tier healthy indefinitely.

---

## 14. Build phases

**Phase 0 — de-risk (S):** background-playback spike on real Android + iPhone (§5); codec spot-check (m4a/ogg/flac in Safari + Chrome); provision Vercel/Neon/R2/Resend on free tiers; pick domain (can defer).

**Phase 1 — MVP (M):** Next.js + PWA shell (manifest, icons, Workbox SW); auth with permanent sessions; **library import (§6) + browse UI** (user pages, albums, tracks, recents); player (single audio element, queue, Media Session, next-track preload); playback cache + Settings; anonymous listening; likes + playlists; play counting with public counts; basic search; simple shuffle-all.

**Phase 2 — community features (M):** in-app upload (presigned, all formats, color-picker artwork); Turnstile + rate limits; moderation email + admin page (unpublish/delete, storage by user, stats dashboard incl. listening hours); pin-for-offline + "On device" screen; weighted shuffle; trigram search polish; iOS install sheet.

**Phase 3 — optional (each S):** Opus derived bitrates; share links; "recently played"; Playwright E2E smoke tests; anything shiny that tempts us.

---

## 15. Cost estimate

| Item | Choice | Cost |
|---|---|---|
| App hosting | Vercel Hobby | $0 |
| Database | Neon free tier | $0 |
| Audio storage | R2 | $0 ≤ 10 GB; 15–20 GB library ≈ **$0.08–0.15/mo** |
| Streaming egress | R2 | **$0 always** |
| Emails | Resend free | $0 (100/day) |
| Bot protection | Turnstile | $0 |
| Domain | registrar | ~$10/yr |

Realistic total: **under $2/month** with a 20 GB library and thousands of listeners. Budget ceiling (decision #19: avoid $100s/mo) met with ~two orders of magnitude to spare.

---

## 16. Risks & mitigations

| Risk | Mitigation |
|---|---|
| iOS background playback flaky | Phase 0 spike; Media Session + preload from day 1; accepted as best-effort (decision #9) |
| Cache eviction (esp. iOS) | `storage.persist()`, conservative caps, install sheet, pinned content re-downloadable |
| Upload abuse / surprise R2 bill | No quota per decision, but: storage-by-user admin table + R2 billing alert + review email per upload |
| Source transcode-only quality (160k AAC) | Acceptable for streaming; if originals exist, hybrid import matched by stored source id |
| Neon free tier fill-up from play events | 90-day raw prune + monthly rollups (§13) |
| Losing data | R2 versioning or periodic `rclone` to B2/local; weekly `pg_dump` to R2 via Vercel cron |
| Vendor free-tier blips | Accepted (decision #17); PWA keeps playing from cache during downtime; writes queue |
| Single maintainer | Boring portable stack (Next.js + Postgres + S3-compatible storage) — runs anywhere later |

---

## 17. Decisions locked (2026-11-11)

1. Open signup, church circles, at most a few thousand users if it takes off
2. Support email address in footer for copyright complaints; content = freely-shared amateur recordings, owner oversees manually (no report/takedown system for now)
3. Public registration; no invite codes
4. Anonymous listening allowed (no account needed to stream)
5. No private/unlisted/draft tracks
6. Search important; shuffle must skew popular (bad songs almost never surface randomly)
7. Desktop and mobile both polished
8. Waveforms skipped
9. Many iPhone users; best-effort iOS, limits won't block development
10. Library: 8–10 GB now → 15–20 GB within a year
11. Serve as uploaded (no transcoding) for now
12. mp3 primary; m4a + other common formats if cheap to add (they are); no format whitelist drama
13. Email + password; permanently logged in (sliding 365-day sessions), manual logout only
14. Offline cache defaults: 1 GB Android / 500 MB iOS, adjustable, avoid breakage
15. No domain yet — develop on free subdomains, buy at launch; site name "Life Stream" / lifestream
16. Artwork: manual upload per song, else title-on-color from a simple palette (no embedded-tag art)
17. Uptime: "mostly available" is fine; offline listening must survive server downtime (it does, §2)
18. Backups as proposed (weekly pg dumps, R2 sync)
19. Budget: not strictly $0, avoid $100s/mo
20. Analytics: users, listening hours/user/month, per-track play counts — public play counts on tracks (YouTube-style)

Earlier decisions still standing: R2 for storage (zero egress), albums-as-playlists, no year metadata, publish-then-review moderation with owner email, no per-user quotas, no virus scanning (validated uploads + review email instead).

Amended 2026-11-11 (later in the day): "user == artist" relaxed — users may set a separate **artist name** (nullable `users.artist_name`, displayed via `coalesce(artist_name, display_name)` on tracks/albums/lock screen/search). Defaults to their own name, so behavior is unchanged unless set.

---
