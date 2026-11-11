import Link from "next/link";
import { Cover } from "@/components/Cover";
import { TrackList } from "@/components/TrackList";
import { getCurrentUser } from "@/lib/auth";
import { getTopTracks, searchEverything } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const user = await getCurrentUser().catch(() => null);

  if (!q) {
    const top = await getTopTracks(10);
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">Search</h1>
          <p className="mt-1 text-sm text-muted">
            Find songs, artists, and albums. Try a hymn name or a person.
          </p>
        </div>
        <form action="/search" className="flex gap-2" role="search">
          <input
            className="input"
            name="q"
            type="search"
            placeholder="Search…"
            autoFocus
            aria-label="Search"
          />
          <button type="submit" className="btn btn-primary shrink-0">
            Search
          </button>
        </form>
        {top.length > 0 && (
          <section>
            <h2 className="section-title">Most played right now</h2>
            <TrackList tracks={top} authed={!!user} />
          </section>
        )}
      </div>
    );
  }

  const results = await searchEverything(q);
  const nothing =
    results.tracks.length === 0 && results.users.length === 0 && results.albums.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">
        Results for <span className="text-accent">“{q}”</span>
      </h1>

      {nothing && (
        <p className="py-8 text-center text-sm text-muted">
          Nothing matched. Try fewer or different words.
        </p>
      )}

      {results.users.length > 0 && (
        <section>
          <h2 className="section-title">Artists</h2>
          <div className="flex flex-wrap gap-3">
            {results.users.map((u) => (
              <Link
                key={u.id}
                href={`/u/${u.handle}`}
                className="flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 transition hover:border-accent"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-sm font-bold">
                  {(u.artistName ?? u.displayName).slice(0, 1).toUpperCase()}
                </span>
                {u.artistName ?? u.displayName}
              </Link>
            ))}
          </div>
        </section>
      )}

      {results.albums.length > 0 && (
        <section>
          <h2 className="section-title">Albums</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {results.albums.map((a) => (
              <Link key={a.id} href={`/album/${a.id}`} className="group flex flex-col gap-2">
                <Cover title={a.title} artworkUrl={a.artworkUrl} color={a.color} />
                <span className="truncate text-sm font-medium group-hover:text-accent">
                  {a.title}
                </span>
                <span className="-mt-2 truncate text-xs text-muted">{a.artist}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results.tracks.length > 0 && (
        <section>
          <h2 className="section-title">Songs</h2>
          <TrackList tracks={results.tracks} authed={!!user} />
        </section>
      )}
    </div>
  );
}
