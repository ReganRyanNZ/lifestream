# Life Stream

A music streaming PWA for sharing church-community recordings (non-commercial).

Listen without an account, like and build playlists with one, aggressive offline
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

# 4. Run
npm run dev
```

## Status (2026-11-11)

Phase 1 done
- App built and deployed
- Listening & browsing

Phase 2
- User uploads

