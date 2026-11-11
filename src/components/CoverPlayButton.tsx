"use client";

import { Cover } from "@/components/Cover";
import { usePlayer } from "@/components/player-store";
import type { TrackDTO } from "@/lib/types";

/** Cover art that plays the track (seeding a station) when clicked. */
export function CoverPlayButton({ track }: { track: TrackDTO }) {
  const playStation = usePlayer((s) => s.playStation);
  const currentId = usePlayer((s) => s.queue[s.index]?.id);
  const playing = usePlayer((s) => s.playing);
  const isCurrent = track.id === currentId;

  return (
    <button
      onClick={() => (isCurrent ? usePlayer.getState().toggle() : playStation(track))}
      aria-label={isCurrent && playing ? `Pause ${track.title}` : `Play ${track.title}`}
      className="group relative w-full text-left"
    >
      <Cover
        title={track.title}
        artworkUrl={track.artworkUrl}
        color={track.color}
        className="transition group-hover:brightness-110"
      />
      <span
        className={`absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 transition ${
          isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        aria-hidden
      >
        {isCurrent && playing ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden>
            <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
          </svg>
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden>
            <path d="M7 4l13 8-13 8z" />
          </svg>
        )}
      </span>
    </button>
  );
}
