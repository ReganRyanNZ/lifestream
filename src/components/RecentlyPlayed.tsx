"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CoverPlayButton } from "@/components/CoverPlayButton";
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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {tracks.slice(0, 12).map((t) => (
          <div key={t.id} className="flex flex-col gap-2">
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
    </section>
  );
}
