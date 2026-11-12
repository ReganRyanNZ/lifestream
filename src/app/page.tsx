import Link from "next/link";
import { RecentlyPlayed } from "@/components/RecentlyPlayed";
import { TrackList } from "@/components/TrackList";
import { ShuffleButton } from "@/components/PlayButtons";
import { getCurrentUser } from "@/lib/auth";
import { getPopularTracks, siteStats } from "@/lib/queries";
import { fmtPlays } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [user, stats, popular] = await Promise.all([
    getCurrentUser().catch(() => null),
    siteStats(),
    getPopularTracks(10, 40),
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
        </div>
      </section>

      <RecentlyPlayed />

      {popular.length > 0 && (
        <section>
          <h2 className="section-title">Popular songs</h2>
          <TrackList tracks={popular} authed={!!user} station />
          <p className="px-2 pt-2 text-xs text-muted">
            A rotating pick from the most-played songs over the last 30 days.
          </p>
        </section>
      )}

      {popular.length === 0 && (
        <section className="card max-w-xl p-4 text-sm text-muted">
          Nothing has been played yet —{" "}
          <Link href="/search" className="text-accent hover:underline">
            browse the library
          </Link>{" "}
          and press play.
        </section>
      )}
    </div>
  );
}
