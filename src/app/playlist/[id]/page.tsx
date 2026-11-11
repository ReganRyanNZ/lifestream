import { notFound } from "next/navigation";
import { TrackList } from "@/components/TrackList";
import { PlayAllButton, ShuffleButton } from "@/components/PlayButtons";
import { deletePlaylist, removeFromPlaylist } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { getPlaylist, getPlaylistTracks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/playlist/[id]">) {
  const { id } = await params;
  const pl = await getPlaylist(id).catch(() => null);
  return { title: pl ? pl.title : "Playlist" };
}

export default async function PlaylistPage({ params }: PageProps<"/playlist/[id]">) {
  const { id } = await params;
  const playlist = await getPlaylist(id);
  if (!playlist) notFound();

  const [viewer, tracks] = await Promise.all([
    getCurrentUser().catch(() => null),
    getPlaylistTracks(playlist.id),
  ]);
  const isOwner = viewer?.id === playlist.ownerId;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-xl border border-border bg-surface sm:h-44 sm:w-44">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="text-muted" aria-hidden>
            <path d="M3 6h13v2H3V6zm0 5h13v2H3v-2zm0 5h9v2H3v-2zm15-9v8.17a3 3 0 1 0 2 2.83V7h3V5h-5z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Playlist</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-4xl">{playlist.title}</h1>
          <p className="mt-2 text-sm text-muted">
            by{" "}
            <a href={`/u/${playlist.ownerHandle}`} className="text-foreground hover:underline">
              {playlist.ownerName}
            </a>{" "}
            · {tracks.length} {tracks.length === 1 ? "song" : "songs"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {tracks.length > 0 && <PlayAllButton tracks={tracks} />}
            {tracks.length > 1 && (
              <ShuffleButton scope={{ kind: "playlist", id: playlist.id }} />
            )}
            {isOwner && (
              <form action={deletePlaylist.bind(null, playlist.id)}>
                <button type="submit" className="btn btn-ghost text-rose-300">
                  Delete playlist
                </button>
              </form>
            )}
          </div>
        </div>
      </header>

      {isOwner ? (
        <TrackList
          tracks={tracks}
          authed
          onRemove={async (trackId: string) => {
            "use server";
            await removeFromPlaylist(playlist.id, trackId);
          }}
        />
      ) : (
        <TrackList tracks={tracks} authed={!!viewer} />
      )}
    </div>
  );
}
