"use client";

import { usePlayer } from "@/components/player-store";
import { QueuePanel, QueueRow } from "@/components/Queue";
import { PlayIcon } from "@/components/icons";
import type { TrackDTO } from "@/lib/types";

/**
 * "Up next" for a track page: when this song is the one playing, shows the
 * live queue (QueuePanel) with a switch between the radio mix (all songs,
 * popularity weighted) and this song's album in order — swapping only what
 * comes after the current song. When it isn't playing, shows the album (or an
 * explanation) instead.
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
  const playingThis = queue.length > 0 && queue[index]?.id === track.id;

  if (playingThis) {
    return <QueuePanel albumTracks={albumTracks} />;
  }

  // this song isn't the one playing: show its album, or explain the station flow
  if (albumTracks && albumTracks.length > 0) {
    const pos = Math.max(
      0,
      albumTracks.findIndex((t) => t.id === track.id),
    );
    return (
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="section-title !mb-0">Up next · album</h2>
          <button
            className="btn btn-primary ml-auto !px-3 !py-1.5"
            onClick={() => usePlayer.getState().playQueue(albumTracks, pos, "album")}
          >
            <PlayIcon size={14} />
            Play album from here
          </button>
        </div>
        <ol className="flex flex-col gap-0.5">
          {albumTracks.map((t, i) => (
            <QueueRow
              key={t.id}
              track={t}
              numbered={(i - pos + albumTracks.length) % albumTracks.length + 1}
              onPlay={() => usePlayer.getState().playQueue(albumTracks, i, "album")}
            />
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section className="card max-w-xl p-4 text-sm text-muted">
      Press play and this song will be followed by a <strong className="text-foreground">radio
      mix of all songs</strong> — weighted toward the most-played and most-liked, so the good
      ones keep coming.
    </section>
  );
}
