import Link from "next/link";
import { CoverPlayButton } from "@/components/CoverPlayButton";
import { TrackList } from "@/components/TrackList";
import { ShuffleButton } from "@/components/PlayButtons";
import { getCurrentUser } from "@/lib/auth";
import { getRecentTracks, getTopTracks, siteStats } from "@/lib/queries";
import { fmtPlays } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [user, stats, recent, top] = await Promise.all([
    getCurrentUser().catch(() => null),
    siteStats(),
    getRecentTracks(18),
    getTopTracks(10),
  ]);

  const hours = Math.round(stats.totalSeconds / 3600);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Music from our community</h1>
          <p className="mt-2 text-muted">
            {fmtPlays(stats.trackCount)} {stats.trackCount === 1 ? "song" : "songs"} from{" "}
            {stats.artistCount} {stats.artistCount === 1 ? "artist" : "artists"}
            {hours > 0 && ` · about ${fmtPlays(hours)} hours of listening`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ShuffleButton
            label="Shuffle everything"
            className="btn btn-primary !px-5 !py-2.5"
          />
          <Link href="/search" className="btn btn-ghost !px-5 !py-2.5">
            Browse & search
          </Link>
        </div>
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="section-title">Recently added</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {recent.slice(0, 12).map((t) => (
              <div key={t.id} className="flex flex-col gap-2">
                <CoverPlayButton track={t} />
                <Link
                  href={`/track/${t.id}`}
                  className="truncate text-sm font-medium hover:text-accent"
                >
                  {t.title}
                </Link>
                <Link
                  href={`/u/${t.handle}`}
                  className="-mt-2 truncate text-xs text-muted hover:text-foreground"
                >
                  {t.artist}
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {top.length > 0 && (
        <section>
          <h2 className="section-title">Most played</h2>
          <TrackList tracks={top} authed={!!user} station />
        </section>
      )}
    </div>
  );
}
