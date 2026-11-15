import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { playEvents, tracks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

/**
 * Play beacon from the client. A "counted" play = listened >= 30s or half the
 * track (YouTube-style), at most once per track/client/24h — and never before
 * 12 seconds. Everything else is recorded raw (for listening-hours analytics)
 * but doesn't bump the public count.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const trackId = typeof body?.trackId === "string" ? body.trackId : null;
  const clientUuid =
    typeof body?.clientUuid === "string" ? body.clientUuid.slice(0, 64) : null;
  const seconds = Math.max(0, Math.min(86_400, Math.round(Number(body?.secondsPlayed ?? 0))));

  if (!trackId || !clientUuid || seconds < 12) return new Response(null, { status: 204 });

  const rows = await db
    .select({ id: tracks.id, durationSec: tracks.durationSec })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!rows[0]) return new Response(null, { status: 204 });

  const user = await getCurrentUser().catch(() => null);
  const threshold = Math.min(30, Math.max(12, rows[0].durationSec / 2));

  if (seconds >= threshold) {
    const alreadyCounted = await db
      .select({ id: playEvents.id })
      .from(playEvents)
      .where(
        and(
          eq(playEvents.trackId, trackId),
          eq(playEvents.clientUuid, clientUuid),
          eq(playEvents.counted, true),
          sql`${playEvents.playedAt} > now() - interval '24 hours'`,
        ),
      )
      .limit(1);

    await db.insert(playEvents).values({
      trackId,
      userId: user?.id ?? null,
      clientUuid,
      secondsPlayed: seconds,
      counted: true,
    });

    if (alreadyCounted.length === 0) {
      await db
        .update(tracks)
        .set({ playCount: sql`${tracks.playCount} + 1` })
        .where(eq(tracks.id, trackId));
    }
  } else {
    await db.insert(playEvents).values({
      trackId,
      userId: user?.id ?? null,
      clientUuid,
      secondsPlayed: seconds,
      counted: false,
    });
  }

  return new Response(null, { status: 204 });
}
