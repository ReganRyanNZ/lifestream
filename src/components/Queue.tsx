"use client";

import { useState } from "react";
import Link from "next/link";
import { usePlayer, type PlayContextKind } from "@/components/player-store";
import { PauseIcon, PlayIcon } from "@/components/icons";
import { fmtDuration } from "@/lib/format";
import type { TrackDTO } from "@/lib/types";

/** What the current queue represents — shown as a chip and switchable. */
export const CONTEXT_LABEL: Record<PlayContextKind, string> = {
  station: "Radio mix · all songs",
  album: "Album · in order",
  playlist: "Playlist",
  list: "Queue",
};

/** Rows shown for the live queue (current song + up next) before "+N more". */
const MAX_ROWS = 50;

/** One queue row: a number that becomes ▶ on hover; the current song toggles. */
export function QueueRow({
  track,
  onPlay,
  current = false,
  numbered,
}: {
  track: TrackDTO;
  onPlay: () => void;
  /** this row is the currently-playing song (click toggles pause, accent style) */
  current?: boolean;
  /** 1-based position shown to the user (hidden on hover for the play icon) */
  numbered?: number;
}) {
  const playing = usePlayer((s) => s.playing);
  const isPlaying = current && playing;

  return (
    <li
      className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2 ${
        current ? "bg-surface-2" : ""
      }`}
    >
      <button
        onClick={onPlay}
        aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/80 transition hover:bg-accent hover:text-[#06121c]"
      >
        {isPlaying ? (
          <PauseIcon size={14} />
        ) : (
          <>
            {numbered != null && (
              <span className="text-xs tabular-nums text-muted group-hover:hidden">{numbered}</span>
            )}
            <PlayIcon size={14} className={numbered != null ? "hidden group-hover:block" : ""} />
          </>
        )}
      </button>
      <Link
        href={`/track/${track.id}`}
        className={`min-w-0 flex-1 truncate text-sm hover:underline ${
          current ? "font-semibold text-accent" : ""
        }`}
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
 * The live queue: current song + up next, with radio-mix / album switching.
 * Used by the full-screen Now Playing view and the track page's "Up next".
 * When `albumTracks` isn't supplied, "Album in order" fetches them on demand.
 */
export function QueuePanel({ albumTracks }: { albumTracks?: TrackDTO[] }) {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const contextKind = usePlayer((s) => s.contextKind);
  const [albumBusy, setAlbumBusy] = useState(false);

  const current = queue[index];
  if (!current) return null;

  const upcoming = queue.slice(index + 1, index + 1 + MAX_ROWS);
  const more = queue.length - (index + 1 + upcoming.length);

  async function playAlbumInOrder() {
    if (!current.albumId || albumBusy) return;
    setAlbumBusy(true);
    try {
      let list = albumTracks;
      if (!list) {
        const j = await fetch(`/api/albums/${current.albumId}/tracks`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        list = (j as { tracks?: TrackDTO[] } | null)?.tracks;
      }
      // switchToQueue keeps the current song playing if it's in the album
      if (list?.length) usePlayer.getState().switchToQueue(list, "album");
    } finally {
      setAlbumBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="section-title !mb-0">Up next</h2>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
          {CONTEXT_LABEL[contextKind ?? "list"]}
        </span>
        <span className="ml-auto flex gap-2">
          {contextKind !== "station" && (
            <button
              className="btn btn-ghost !px-3 !py-1.5"
              onClick={() => usePlayer.getState().regenerateStation()}
            >
              Radio mix
            </button>
          )}
          {current.albumId && contextKind !== "album" && (
            <button
              className="btn btn-ghost !px-3 !py-1.5"
              onClick={playAlbumInOrder}
              disabled={albumBusy}
            >
              {albumBusy ? "Loading…" : "Album in order"}
            </button>
          )}
        </span>
      </div>
      <ol className="flex flex-col gap-0.5">
        <QueueRow
          track={current}
          current
          onPlay={() => usePlayer.getState().toggle()}
        />
        {upcoming.map((t, k) => (
          <QueueRow
            key={`${t.id}-${k}`}
            track={t}
            numbered={k + 1}
            onPlay={() => {
              const s = usePlayer.getState();
              s.playQueue(s.queue, index + 1 + k, s.contextKind ?? "list");
            }}
          />
        ))}
      </ol>
      {upcoming.length === 0 && (
        <p className="px-2 py-4 text-sm text-muted">
          End of queue — switch to the radio mix to keep the music going.
        </p>
      )}
      {more > 0 && <p className="px-2 pt-2 text-xs text-muted">+{more} more in the queue</p>}
    </section>
  );
}
