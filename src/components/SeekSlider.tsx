"use client";

import { useCallback } from "react";
import { usePlayer } from "@/components/player-store";
import { fmtDuration } from "@/lib/format";

/** Position slider + time labels, driven straight from the player store. */
export function SeekSlider({ fallbackDurationSec = 0 }: { fallbackDurationSec?: number }) {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration) || fallbackDurationSec;
  const seek = usePlayer((s) => s.seek);

  const onInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      seek(parseFloat(e.target.value));
    },
    [seek],
  );

  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted">
        {fmtDuration(position)}
      </span>
      <input
        type="range"
        min={0}
        max={duration}
        step={0.5}
        value={Math.min(position, duration)}
        onChange={onInput}
        aria-label="Seek"
        className="min-w-0 flex-1"
        style={{ accentColor: "var(--accent)" }}
      />
      <span className="w-9 shrink-0 text-[11px] tabular-nums text-muted">
        {fmtDuration(duration)}
      </span>
    </div>
  );
}
