"use client";

import Link from "next/link";
import { usePlayer } from "@/components/player-store";
import { fmtDuration } from "@/lib/format";
import type { TrackDTO } from "@/lib/types";

const CONTEXT_LABEL: Record<string, string> = {
  station: "Radio mix · all songs",
  album: "Album · in order",
  playlist: "Playlist",
  list: "Queue",
};

const MAX_ROWS = 30;

function Row({
  track,
  onPlay,
  numbered,
}: {
  track: TrackDTO;
  onPlay: () => void;
  numbered?: number;
}) {
  return (
    <li className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
      <button
        onClick={onPlay}
        aria-label={`Play ${track.title}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/80 transition hover:bg-accent hover:text-[#06121c]"
      >
        {numbered ? (
          <span className="text-xs tabular-nums text-muted group-hover:hidden">{numbered}</span>
        ) : null}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
          className={numbered ? "hidden group-hover:block" : ""}
        >
          <path d="M7 4l13 8-13 8z" />
        </svg>
      </button>
      <Link
        href={`/track/${track.id}`}
        className="min-w-0 flex-1 truncate text-sm hover:underline"
      >
        {track.title}
      </Link>
      <span className="hidden max-w-40 shrink-0 truncate text-xs text-muted sm:inline">
        {track.artist}
      </span>
      <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted">
        {fmtDuration(track.durationSec)}
      </span>
    </li>
  );
}

/**
 * "Up next" for a track page: when this song is the one playing, shows the
 * live queue with a switch between the radio mix (all songs, popularity
 * weighted) and this song's album in order — swapping only what comes after
 * the current song. When it isn't playing, shows the album (or an
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
  const contextKind = usePlayer((s) => s.contextKind);
  const playingThis = queue.length > 0 && queue[index]?.id === track.id;

  if (playingThis) {
    const upcoming = queue.slice(index + 1);
    const albumPos = albumTracks?.findIndex((t) => t.id === track.id) ?? -1;
    const canPlayAlbum = !!albumTracks && albumPos >= 0 && contextKind !== "album";
    const canPlayMix = contextKind !== "station";

    return (
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="section-title !mb-0">Up next</h2>
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
            {CONTEXT_LABEL[contextKind ?? "list"]}
          </span>
          <span className="ml-auto flex gap-2">
            {canPlayAlbum && (
              <button
                className="btn btn-ghost !px-3 !py-1.5"
                onClick={() =>
                  usePlayer.getState().switchToQueue(albumTracks!.slice(albumPos), "album")
                }
              >
                Play album in order
              </button>
            )}
            {canPlayMix && (
              <button
                className="btn btn-ghost !px-3 !py-1.5"
                onClick={() => usePlayer.getState().regenerateStation()}
              >
                Radio mix
              </button>
            )}
          </span>
        </div>
        {upcoming.length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted">
            End of queue — switch to the radio mix to keep the music going.
          </p>
        ) : (
          <>
            <ol className="flex flex-col gap-0.5">
              {upcoming.slice(0, MAX_ROWS).map((t, i) => (
                <Row
                  key={`${t.id}-${i}`}
                  track={t}
                  onPlay={() => {
                    const s = usePlayer.getState();
                    s.playQueue(s.queue, index + 1 + i, s.contextKind ?? "list");
                  }}
                />
              ))}
            </ol>
            {upcoming.length > MAX_ROWS && (
              <p className="px-2 pt-2 text-xs text-muted">
                +{upcoming.length - MAX_ROWS} more in the queue
              </p>
            )}
          </>
        )}
      </section>
    );
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M7 4l13 8-13 8z" />
            </svg>
            Play album from here
          </button>
        </div>
        <ol className="flex flex-col gap-0.5">
          {albumTracks.map((t, i) => (
            <Row
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
