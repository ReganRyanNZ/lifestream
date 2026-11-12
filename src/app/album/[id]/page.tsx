import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/Cover";
import { TrackList } from "@/components/TrackList";
import { PlayAllButton, ShuffleButton } from "@/components/PlayButtons";
import { getCurrentUser } from "@/lib/auth";
import { getAlbum, getAlbumTracks } from "@/lib/queries";
import { publicUrlFor } from "@/lib/storage";
import { fmtDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/album/[id]">) {
  const { id } = await params;
  const album = await getAlbum(id).catch(() => null);
  return { title: album ? album.title : "Album" };
}

export default async function AlbumPage({ params }: PageProps<"/album/[id]">) {
  const { id } = await params;
  const album = await getAlbum(id);
  if (!album) notFound();

  const [viewer, tracks] = await Promise.all([
    getCurrentUser().catch(() => null),
    getAlbumTracks(album.id),
  ]);

  const total = tracks.reduce((acc, t) => acc + t.durationSec, 0);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end gap-5">
        <div className="w-32 shrink-0 sm:w-44">
          <Cover
            title={album.title}
            artworkUrl={album.artworkKey ? publicUrlFor(album.artworkKey) : null}
            color={album.color}
            className="shadow-lg shadow-black/40"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Album</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-4xl">{album.title}</h1>
          <p className="mt-2 text-sm text-muted">
            by{" "}
            <Link href={`/u/${album.handle}`} className="text-foreground hover:underline">
              {album.artist}
            </Link>{" "}
            · {tracks.length} {tracks.length === 1 ? "song" : "songs"}
            {total > 0 && ` · ${fmtDuration(total)}`}
          </p>
          {tracks.length > 0 && (
            <div className="mt-4 flex gap-2">
              <PlayAllButton tracks={tracks} />
              <ShuffleButton scope={{ kind: "album", id: album.id }} />
            </div>
          )}
        </div>
      </header>

      <TrackList
        tracks={tracks}
        showArtist={false}
        numbered
        authed={!!viewer}
        contextKind="album"
      />
    </div>
  );
}
