"use client";

import Link from "next/link";
import { usePlayer } from "@/components/player-store";
import { LikeButton } from "@/components/LikeButton";
import { fmtDuration, fmtPlays } from "@/lib/format";
import type { TrackDTO } from "@/lib/types";

export function TrackList({
  tracks,
  showArtist = true,
  numbered = false,
  authed = false,
  onRemove = null,
}: {
  tracks: TrackDTO[];
  showArtist?: boolean;
  numbered?: boolean;
  authed?: boolean;
  onRemove?: ((trackId: string) => void) | null;
}) {
  const currentId = usePlayer((s) => s.queue[s.index]?.id);
  const playing = usePlayer((s) => s.playing);
  const playQueue = usePlayer((s) => s.playQueue);
  const toggle = usePlayer((s) => s.toggle);

  if (tracks.length === 0) {
    return <p className="px-2 py-6 text-center text-sm text-muted">Nothing here yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-0.5">
      {tracks.map((t, i) => {
        const isCurrent = t.id === currentId;
        const isPlaying = isCurrent && playing;
        return (
          <li
            key={t.id}
            className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2 ${
              isCurrent ? "bg-surface-2" : ""
            }`}
          >
            <button
              onClick={() => (isCurrent ? toggle() : playQueue(tracks, i))}
              aria-label={isPlaying ? `Pause ${t.title}` : `Play ${t.title}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/80 transition hover:bg-accent hover:text-[#06121c]"
            >
              {isPlaying ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M7 4l13 8-13 8z" />
                </svg>
              )}
            </button>

            {numbered && (
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted">
                {t.trackNo ?? i + 1}
              </span>
            )}

            <Link
              href={`/track/${t.id}`}
              className={`min-w-0 flex-1 truncate text-sm hover:underline ${
                isCurrent ? "font-semibold text-accent" : ""
              }`}
            >
              {t.title}
            </Link>

            {showArtist && (
              <Link
                href={`/u/${t.handle}`}
                className="hidden max-w-40 shrink-0 truncate text-xs text-muted hover:text-foreground hover:underline sm:inline"
              >
                {t.artist}
              </Link>
            )}

            <span className="hidden w-14 shrink-0 text-right text-xs tabular-nums text-muted md:inline">
              {fmtPlays(t.playCount)} plays
            </span>
            <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted">
              {fmtDuration(t.durationSec)}
            </span>

            <LikeButton
              trackId={t.id}
              initialLiked={!!t.liked}
              authed={authed}
              compact
            />

            {onRemove && (
              <button
                onClick={() => onRemove(t.id)}
                aria-label={`Remove ${t.title} from playlist`}
                className="btn-icon opacity-0 transition group-hover:opacity-100"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M6 7h12l-1 13H7L6 7zm3-3h6l1 2H8l1-2z" />
                </svg>
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
