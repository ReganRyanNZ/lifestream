"use client";

import { Cover } from "@/components/Cover";
import { usePlayer } from "@/components/player-store";
import { PauseIcon, PlayIcon } from "@/components/icons";
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
        className={`absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 text-white transition ${
          isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        aria-hidden
      >
        {isCurrent && playing ? <PauseIcon size={28} /> : <PlayIcon size={28} />}
      </span>
    </button>
  );
}
