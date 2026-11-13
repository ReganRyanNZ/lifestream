"use client";

import Link from "next/link";
import { CoverPlayButton } from "@/components/CoverPlayButton";
import type { TrackDTO } from "@/lib/types";

/** Playable cover tiles — "grid" flows across the width, "row" scrolls horizontally. */
export function TrackTileGrid({
  tracks,
  max = 12,
  layout = "grid",
}: {
  tracks: TrackDTO[];
  max?: number;
  layout?: "grid" | "row";
}) {
  return (
    <div className={layout === "row" ? "cover-row" : "cover-grid"}>
      {tracks.slice(0, max).map((t) => (
        <div key={t.id} className="flex min-w-0 flex-col gap-2">
          <CoverPlayButton track={t} />
          <Link
            href={`/track/${t.id}`}
            className="truncate text-sm font-medium hover:text-accent"
          >
            {t.title}
          </Link>
          <Link
            href={`/u/${t.handle}`}
            className="-mt-2 truncate text-xs text-muted hover:text-foreground"
          >
            {t.artist}
          </Link>
        </div>
      ))}
    </div>
  );
}
