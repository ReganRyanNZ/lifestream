import Link from "next/link";
import { TrackList } from "@/components/TrackList";
import { ShuffleButton } from "@/components/PlayButtons";
import { getCurrentUser } from "@/lib/auth";
import { getAllTracks } from "@/lib/queries";
import type { TrackDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "All songs" };

/** Artists per page — keeps the rendered list snappy (the full library is
 *  2,900+ rows / several MB of HTML, which took seconds to paint). */
const ARTISTS_PER_PAGE = 7;

/** Browse every song on the site, grouped by artist, paged by artist. */
export default async function SongsPage({
  searchParams,
}: PageProps<"/songs">) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(String(sp?.page ?? "1"), 10) || 1);

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

  const artists = [...byArtist.entries()];
  const pages = Math.max(1, Math.ceil(artists.length / ARTISTS_PER_PAGE));
  const current = Math.min(page, pages);
  const slice = artists.slice((current - 1) * ARTISTS_PER_PAGE, current * ARTISTS_PER_PAGE);

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

      {slice.map(([handle, { userArtist, tracks }]) => (
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

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-2 pb-2 text-sm">
          {current > 1 ? (
            <Link href={`/songs?page=${current - 1}`} className="btn btn-ghost !px-4 !py-2">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Page {current} of {pages}
          </span>
          {current < pages ? (
            <Link href={`/songs?page=${current + 1}`} className="btn btn-ghost !px-4 !py-2">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
