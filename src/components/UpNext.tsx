"use client";

import { usePlayer } from "@/components/player-store";
import { QueuePanel, QueueRow } from "@/components/Queue";
import { PlayAlbumButton } from "@/components/PlayButtons";
import type { TrackDTO } from "@/lib/types";

/**
 * "Up next" for a track page: when this song is the one playing, shows the
 * live queue (QueuePanel — current song plus what follows it, drag-to-
 * reorder). When it isn't playing: its album if it has one, else the live
 * queue if anything else is playing, else nothing.
 */
export function UpNext({
  track,
  albumTracks,
}: {
  track: TrackDTO;
  albumTracks?: TrackDTO[];
}) {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const current = queue[index];
  const playingThis = current?.id === track.id;

  if (playingThis) {
    return <QueuePanel />;
  }

  // this song isn't the one playing: show its album, or the live queue
  if (albumTracks && albumTracks.length > 0) {
    const pos = Math.max(
      0,
      albumTracks.findIndex((t) => t.id === track.id),
    );
    // any entry point plays the full album starting from that track (wrapping)
    const playFrom = (i: number) =>
      usePlayer.getState().playQueue(
        [...albumTracks.slice(i), ...albumTracks.slice(0, i)],
        0,
        "album",
      );
    return (
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="section-title !mb-0">Up next · album</h2>
          <PlayAlbumButton
            tracks={albumTracks}
            fromId={track.id}
            label="Play album from here"
            className="btn btn-primary ml-auto !px-3 !py-1.5"
          />
        </div>
        <ol className="flex flex-col gap-0.5">
          {albumTracks.map((t, i) => (
            <QueueRow
              key={t.id}
              track={t}
              numbered={(i - pos + albumTracks.length) % albumTracks.length + 1}
              onPlay={() => playFrom(i)}
            />
          ))}
        </ol>
      </section>
    );
  }

  // nothing queued for this song: if something else is playing, the live queue
  // is still the real "up next"; otherwise leave the space empty
  if (current) return <QueuePanel />;

  return null;
}
