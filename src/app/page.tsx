import Link from "next/link";
import { RecentlyPlayed } from "@/components/RecentlyPlayed";
import { TrackTileGrid } from "@/components/TrackTileGrid";
import { AlbumTileRow } from "@/components/AlbumTileRow";
import { ShuffleButton } from "@/components/PlayButtons";
import { getCurrentUser } from "@/lib/auth";
import { getPlaylistsFor, getPopularTracks, getRandomAlbums } from "@/lib/queries";
import { randomVerse } from "@/lib/verses";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser().catch(() => null);
  const [popular, albums, allPlaylists] = await Promise.all([
    getPopularTracks(12, 40),
    getRandomAlbums(12),
    user ? getPlaylistsFor(user.id) : Promise.resolve([]),
  ]);
  const playlists = allPlaylists.filter((p) => p.count > 0);

  const verse = randomVerse();

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Life stream</h1>
          <blockquote className="mt-3 max-w-2xl">
            <p className="italic leading-relaxed text-foreground/90">“{verse.text}”</p>
            <cite className="mt-1 block text-xs not-italic text-muted">
              {verse.ref} · Recovery Version
            </cite>
          </blockquote>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShuffleButton
            label="Play"
            icon="play"
            className="btn btn-primary !px-5 !py-2.5"
          />
          {playlists.slice(0, 5).map((p) => (
            <ShuffleButton
              key={p.id}
              scope={{ kind: "playlist", id: p.id }}
              label={p.title}
              icon="play"
              className="btn btn-ghost !px-4 !py-2.5"
            />
          ))}
          {playlists.length > 5 && (
            <Link href="/library" className="text-sm text-muted hover:text-foreground">
              +{playlists.length - 5} more
            </Link>
          )}
        </div>
      </section>

      <RecentlyPlayed />

      {popular.length > 0 && (
        <section>
          <h2 className="section-title">Popular songs</h2>
          <TrackTileGrid tracks={popular} layout="row" />
          <p className="pt-1 text-xs text-muted">
            A rotating pick from the most-played songs over the last 30 days.
          </p>
        </section>
      )}

      {albums.length > 0 && (
        <section>
          <h2 className="section-title">Albums</h2>
          <AlbumTileRow albums={albums} />
        </section>
      )}
    </div>
  );
}
