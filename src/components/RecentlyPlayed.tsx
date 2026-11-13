"use client";

import { useEffect, useState } from "react";
import { TrackTileGrid } from "@/components/TrackTileGrid";
import { getClientUuid } from "@/components/player-store";
import type { TrackDTO } from "@/lib/types";

/**
 * "Recently played" home section. Works for signed-in and anonymous listeners
 * alike (history keyed on the device's client UUID, plus the account when
 * signed in). Renders nothing until history is found — the section is simply
 * absent for brand-new listeners.
 */
export function RecentlyPlayed() {
  const [tracks, setTracks] = useState<TrackDTO[] | null>(null);

  useEffect(() => {
    const uuid = getClientUuid();
    fetch(`/api/recent?client=${encodeURIComponent(uuid)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { tracks?: TrackDTO[] } | null) => setTracks(j?.tracks ?? []))
      .catch(() => setTracks([]));
  }, []);

  if (!tracks || tracks.length === 0) return null;

  return (
    <section>
      <h2 className="section-title">Recently played</h2>
      <TrackTileGrid tracks={tracks} layout="row" />
    </section>
  );
}
