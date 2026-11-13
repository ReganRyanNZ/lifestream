"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePlayer } from "@/components/player-store";
import { Cover } from "@/components/Cover";
import type { TrackDTO } from "@/lib/types";

export type AlbumTile = {
  id: string;
  title: string;
  artworkUrl: string | null;
  color: string | null;
  artist: string;
  handle: string;
};

/**
 * Scrollable row of album covers — clicking an album plays it straight
 * through (queue context "album", so Up Next shows it in order).
 */
export function AlbumTileRow({ albums }: { albums: AlbumTile[] }) {
  const playQueue = usePlayer((s) => s.playQueue);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const cache = useRef(new Map<string, TrackDTO[]>());

  async function play(albumId: string) {
    if (loadingId) return;
    const cached = cache.current.get(albumId);
    if (cached) {
      playQueue(cached, 0, "album");
      return;
    }
    setLoadingId(albumId);
    try {
      const r = await fetch(`/api/albums/${albumId}/tracks`);
      const j = (await r.json()) as { tracks?: TrackDTO[] };
      if (j.tracks?.length) {
        cache.current.set(albumId, j.tracks);
        playQueue(j.tracks, 0, "album");
      }
    } catch {
      /* offline — ignore */
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="cover-row">
      {albums.map((a) => (
        <div key={a.id} className="flex min-w-0 flex-col gap-2">
          <button
            onClick={() => play(a.id)}
            aria-label={loadingId === a.id ? `Loading ${a.title}` : `Play album ${a.title}`}
            className="group relative"
          >
            <Cover
              title={a.title}
              artworkUrl={a.artworkUrl}
              color={a.color}
              className={loadingId === a.id ? "opacity-50" : "transition group-hover:brightness-110"}
            />
            <span
              className={`absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 transition ${
                loadingId === a.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
              aria-hidden
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden>
                <path d="M7 4l13 8-13 8z" />
              </svg>
            </span>
          </button>
          <Link href={`/album/${a.id}`} className="truncate text-sm font-medium hover:text-accent">
            {a.title}
          </Link>
          <Link
            href={`/u/${a.handle}`}
            className="-mt-2 truncate text-xs text-muted hover:text-foreground"
          >
            {a.artist}
          </Link>
        </div>
      ))}
    </div>
  );
}
