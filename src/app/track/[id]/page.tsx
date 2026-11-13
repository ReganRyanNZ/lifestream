import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/Cover";
import { LikeButton } from "@/components/LikeButton";
import { AddToPlaylist } from "@/components/AddToPlaylist";
import { PlayAlbumButton, PlayTrackButton } from "@/components/PlayButtons";
import { UpNext } from "@/components/UpNext";
import { getCurrentUser } from "@/lib/auth";
import { getAlbumTracks, getPlaylistsFor, getTrackById } from "@/lib/queries";
import { fmtDuration, fmtPlays } from "@/lib/format";
import type { TrackDTO } from "@/lib/types";

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
  const [playlists, albumTracks] = await Promise.all([
    user ? getPlaylistsFor(user.id) : Promise.resolve([]),
    track.albumId
      ? getAlbumTracks(track.albumId).catch(() => [] as TrackDTO[])
      : Promise.resolve([] as TrackDTO[]),
  ]);

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
            {track.isInstrumental && <> · Instrumental</>}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <PlayTrackButton track={track} />
            {albumTracks.length > 0 && <PlayAlbumButton tracks={albumTracks} fromId={track.id} />}
            <LikeButton
              trackId={track.id}
              initialLiked={!!track.liked}
              authed={!!user}
            />
            {user && <AddToPlaylist trackId={track.id} playlists={playlists} />}
          </div>
        </div>
      </header>

      <UpNext track={track} albumTracks={albumTracks.length > 0 ? albumTracks : undefined} />
    </div>
  );
}
