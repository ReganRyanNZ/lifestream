import Link from "next/link";
import { Cover } from "@/components/Cover";
import { getAllAlbums, type AlbumWithArtist } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "All albums" };

/** Browse every album on the site, grouped by artist. */
export default async function AlbumsPage() {
  const albums = await getAllAlbums();

  // group by owning account (query sorts by account name); per-album credits
  // that differ from the account name show under the album title
  const byArtist = new Map<string, { userArtist: string; albums: AlbumWithArtist[] }>();
  for (const a of albums) {
    const g = byArtist.get(a.handle) ?? { userArtist: a.userArtist, albums: [] };
    g.albums.push(a);
    byArtist.set(a.handle, g);
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">All albums</h1>
        <p className="mt-1 text-sm text-muted">
          {albums.length} {albums.length === 1 ? "album" : "albums"} from{" "}
          {byArtist.size} {byArtist.size === 1 ? "artist" : "artists"}.
        </p>
      </div>

      {[...byArtist.entries()].map(([handle, { userArtist, albums }]) => (
        <section key={handle}>
          <h2 className="section-title">
            <Link href={`/u/${handle}`} className="hover:text-accent">
              {userArtist}
            </Link>
          </h2>
          <div className="cover-grid">
            {albums.map((a) => (
              <Link key={a.id} href={`/album/${a.id}`} className="group flex flex-col gap-2">
                <Cover
                  title={a.title}
                  artworkUrl={a.artworkUrl}
                  color={a.color}
                  className="transition group-hover:brightness-110"
                />
                <span className="truncate text-sm font-medium group-hover:text-accent">
                  {a.title}
                </span>
                <span className="-mt-2 truncate text-xs text-muted">
                  {a.artist !== userArtist && `${a.artist} · `}
                  {a.trackCount} {a.trackCount === 1 ? "song" : "songs"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
