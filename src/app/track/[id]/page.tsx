import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/Cover";
import { LikeButton } from "@/components/LikeButton";
import { TrackList } from "@/components/TrackList";
import { AddToPlaylist } from "@/components/AddToPlaylist";
import { PlayAllButton } from "@/components/PlayButtons";
import { getCurrentUser } from "@/lib/auth";
import { getPlaylistsFor, getTrackById, getUserByHandle, getUserTracks } from "@/lib/queries";
import { fmtDuration, fmtPlays } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/track/[id]">) {
  const { id } = await params;
  const track = await getTrackById(id).catch(() => null);
  return { title: track ? track.title : "Song" };
}

export default async function TrackPage({ params }: PageProps<"/track/[id]">) {
  const { id } = await params;
  const track = await getTrackById(id);
  if (!track) notFound();

  const user = await getCurrentUser().catch(() => null);
  const artist = await getUserByHandle(track.handle);
  const [playlists, artistTracks] = await Promise.all([
    user ? getPlaylistsFor(user.id) : Promise.resolve([]),
    artist ? getUserTracks(artist.id) : Promise.resolve([]),
  ]);

  const more = artistTracks.filter((t) => t.id !== track.id).slice(0, 10);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end gap-6">
        <div className="w-36 shrink-0 sm:w-52">
          <Cover
            title={track.title}
            artworkUrl={track.artworkUrl}
            color={track.color}
            className="shadow-xl shadow-black/50"
            rounded="rounded-xl"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Song</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-4xl">{track.title}</h1>
          <p className="mt-2 text-sm text-muted">
            <Link href={`/u/${track.handle}`} className="text-foreground hover:underline">
              {track.artist}
            </Link>
            {track.albumId && (
              <>
                {" · "}
                <Link href={`/album/${track.albumId}`} className="hover:underline">
                  album
                </Link>
              </>
            )}
            {" · "}
            {fmtPlays(track.playCount)} {track.playCount === 1 ? "play" : "plays"} ·{" "}
            {fmtDuration(track.durationSec)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <PlayAllButton tracks={[track]} label="Play" />
            <LikeButton
              trackId={track.id}
              initialLiked={!!track.liked}
              authed={!!user}
            />
            {user && <AddToPlaylist trackId={track.id} playlists={playlists} />}
          </div>
        </div>
      </header>

      {more.length > 0 && (
        <section>
          <h2 className="section-title">More from {track.artist}</h2>
          <TrackList tracks={more} showArtist={false} authed={!!user} />
        </section>
      )}
    </div>
  );
}
