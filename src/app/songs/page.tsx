import Link from "next/link";
import { TrackList } from "@/components/TrackList";
import { ShuffleButton } from "@/components/PlayButtons";
import { getCurrentUser } from "@/lib/auth";
import { getAllTracks } from "@/lib/queries";
import type { TrackDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "All songs" };

/** Browse every song on the site, grouped by artist. */
export default async function SongsPage() {
  const [tracks, user] = await Promise.all([
    getAllTracks(),
    getCurrentUser().catch(() => null),
  ]);

  // group by owning account (query sorts by account name)
  const byArtist = new Map<string, { userArtist: string; tracks: TrackDTO[] }>();
  for (const t of tracks) {
    const g = byArtist.get(t.handle) ?? { userArtist: t.artist, tracks: [] };
    g.tracks.push(t);
    byArtist.set(t.handle, g);
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">All songs</h1>
          <p className="mt-1 text-sm text-muted">
            {tracks.length.toLocaleString()} {tracks.length === 1 ? "song" : "songs"} from{" "}
            {byArtist.size} {byArtist.size === 1 ? "artist" : "artists"}.
          </p>
        </div>
        <ShuffleButton label="Play" icon="play" className="btn btn-primary !px-5 !py-2.5" />
      </div>

      {[...byArtist.entries()].map(([handle, { userArtist, tracks }]) => (
        <section key={handle}>
          <h2 className="section-title">
            <Link href={`/u/${handle}`} className="hover:text-accent">
              {userArtist}
            </Link>{" "}
            <span className="text-sm font-normal text-muted">
              ({tracks.length})
            </span>
          </h2>
          <TrackList tracks={tracks} showArtist={false} authed={!!user} />
        </section>
      ))}
    </div>
  );
}
