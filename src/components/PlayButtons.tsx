"use client";

import { useState } from "react";
import { getClientUuid, usePlayer } from "@/components/player-store";
import type { TrackDTO } from "@/lib/types";

/**
 * Play a single track: starts it immediately, then continues with a
 * popularity-weighted radio queue drawn from all songs.
 */
export function PlayTrackButton({
  track,
  label = "Play",
  className = "btn btn-primary",
}: {
  track: TrackDTO;
  label?: string;
  className?: string;
}) {
  const playStation = usePlayer((s) => s.playStation);
  return (
    <button onClick={() => playStation(track)} className={className} aria-label={label}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M7 4l13 8-13 8z" />
      </svg>
      {label}
    </button>
  );
}

export function PlayAllButton({
  tracks,
  label = "Play all",
  className = "btn btn-primary",
}: {
  tracks: TrackDTO[];
  label?: string;
  className?: string;
}) {
  const playQueue = usePlayer((s) => s.playQueue);
  return (
    <button
      onClick={() => tracks.length > 0 && playQueue(tracks, 0)}
      className={className}
      aria-label={label}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M7 4l13 8-13 8z" />
      </svg>
      {label}
    </button>
  );
}

export function ShuffleButton({
  scope,
  label = "Shuffle",
  icon = "shuffle",
  className = "btn btn-ghost",
}: {
  scope?: { kind: "user" | "album" | "playlist" | "liked"; id: string };
  label?: string;
  icon?: "shuffle" | "play";
  className?: string;
}) {
  const playQueue = usePlayer((s) => s.playQueue);
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    try {
      const qs = scope ? `?scope=${scope.kind}&id=${scope.id}` : "?scope=all";
      const r = await fetch(`/api/shuffle${qs}&client=${encodeURIComponent(getClientUuid())}`);
      const j = (await r.json()) as { tracks: TrackDTO[] };
      if (j.tracks?.length) playQueue(j.tracks, 0);
    } catch {
      /* offline — ignore */
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={go} className={className} aria-label={label} disabled={loading}>
      {icon === "play" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M7 4l13 8-13 8z" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
        </svg>
      )}
      {loading ? "Shuffling…" : label}
    </button>
  );
}
