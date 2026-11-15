import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { playEvents, tracks, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { fmtDuration } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number) {
  return new Date(Date.now() - n * DAY);
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Admin-only first-party analytics over play_events — plays, listeners,
 *  listening time, and the most-played songs. Everything the site already
 *  records; no third-party tracking involved. */
export default async function AnalyticsPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.isAdmin) redirect("/");

  const since7 = daysAgo(7);
  const since30 = daysAgo(30);

  // headline numbers (last 7 days) + all-time
  const [week] = await db
    .select({
      plays: sql<number>`count(*)::int`,
      listeners: sql<number>`count(distinct ${playEvents.clientUuid})::int`,
      seconds: sql<number>`coalesce(sum(${playEvents.secondsPlayed}), 0)::int`,
    })
    .from(playEvents)
    .where(and(eq(playEvents.counted, true), gte(playEvents.playedAt, since7)));

  const [allTime] = await db
    .select({
      plays: sql<number>`count(*)::int`,
      listeners: sql<number>`count(distinct ${playEvents.clientUuid})::int`,
      seconds: sql<number>`coalesce(sum(${playEvents.secondsPlayed}), 0)::int`,
    })
    .from(playEvents)
    .where(eq(playEvents.counted, true));

  // plays per day for the last 30 days, zero-filled
  const dailyRows = await db
    .select({
      day: sql<string>`to_char(${playEvents.playedAt}, 'YYYY-MM-DD')`,
      plays: sql<number>`count(*)::int`,
    })
    .from(playEvents)
    .where(and(eq(playEvents.counted, true), gte(playEvents.playedAt, since30)))
    .groupBy(sql`to_char(${playEvents.playedAt}, 'YYYY-MM-DD')`);
  const byDay = new Map(dailyRows.map((r) => [r.day, r.plays]));
  const days: { day: string; plays: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = dayKey(daysAgo(i));
    days.push({ day: d, plays: byDay.get(d) ?? 0 });
  }

  // most-played songs, last 7 days
  const topSongs = await db
    .select({
      title: tracks.title,
      artist: sql<string>`coalesce(${users.artistName}, ${users.displayName})`,
      handle: users.handle,
      plays: sql<number>`count(*)::int`,
    })
    .from(playEvents)
    .innerJoin(tracks, eq(tracks.id, playEvents.trackId))
    .innerJoin(users, eq(users.id, tracks.userId))
    .where(and(eq(playEvents.counted, true), gte(playEvents.playedAt, since7)))
    .groupBy(tracks.id, tracks.title, users.artistName, users.displayName, users.handle)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const max = Math.max(1, ...days.map((d) => d.plays));
  const weekAvg = (days.slice(-7).reduce((n, d) => n + d.plays, 0) / 7).toFixed(1);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Analytics</h1>
        <p className="mt-1 text-sm text-muted">
          Real plays (12+ seconds listened) recorded by the site itself.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Plays · 7 days", value: week.plays.toLocaleString() },
          { label: "Listeners · 7 days", value: week.listeners.toLocaleString() },
          { label: "Listening time · 7 days", value: fmtDuration(week.seconds) },
          { label: "Plays · all time", value: allTime.plays.toLocaleString() },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{s.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="section-title !mb-0">Plays per day · 30 days</h2>
          <span className="text-xs text-muted">
            7-day average {weekAvg} · all-time listeners {allTime.listeners}
          </span>
        </div>
        <div className="card p-4">
          <div className="flex h-40 items-end gap-[3px]">
            {days.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 items-end">
                <div
                  className="w-full rounded-t bg-accent/70 transition group-hover:bg-accent"
                  style={{ height: `${Math.round((d.plays / max) * 100)}%` }}
                />
                <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-surface-2 px-1.5 py-0.5 text-xs tabular-nums group-hover:block">
                  {d.day.slice(5)} · {d.plays}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs tabular-nums text-muted">
            <span>{days[0].day}</span>
            <span>peak {max}</span>
            <span>today</span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="section-title">Most played · 7 days</h2>
        {topSongs.length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted">No plays recorded this week yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-2 font-medium">#</th>
                <th className="py-1.5 pr-2 font-medium">Song</th>
                <th className="py-1.5 pr-2 font-medium">Artist</th>
                <th className="py-1.5 text-right font-medium">Plays</th>
              </tr>
            </thead>
            <tbody>
              {topSongs.map((s, i) => (
                <tr key={`${s.handle}-${s.title}`} className="border-t border-border">
                  <td className="py-1.5 pr-2 tabular-nums text-muted">{i + 1}</td>
                  <td className="min-w-0 max-w-[45%] truncate py-1.5 pr-2">{s.title}</td>
                  <td className="py-1.5 pr-2">
                    <Link href={`/u/${s.handle}`} className="text-muted hover:text-foreground">
                      {s.artist}
                    </Link>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{s.plays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
