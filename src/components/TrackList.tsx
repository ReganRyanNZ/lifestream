"use client";

import Link from "next/link";
import { usePlayer } from "@/components/player-store";
import { LikeButton } from "@/components/LikeButton";
import { PauseIcon, PlayIcon } from "@/components/icons";
import { fmtDuration, fmtPlays } from "@/lib/format";
import type { TrackDTO } from "@/lib/types";

export function TrackList({
  tracks,
  showArtist = true,
  numbered = false,
  authed = false,
  station = false,
  contextKind = "list",
  onRemove = null,
}: {
  tracks: TrackDTO[];
  showArtist?: boolean;
  numbered?: boolean;
  authed?: boolean;
  /** station=true: clicking a row seeds a popularity-weighted radio queue from all songs instead of playing this list in order */
  station?: boolean;
  /** labels the queue context in "Up next" when these rows are playing */
  contextKind?: "album" | "playlist" | "list";
  onRemove?: ((trackId: string) => void) | null;
}) {
  const currentId = usePlayer((s) => s.queue[s.index]?.id);
  const playing = usePlayer((s) => s.playing);
  const playQueue = usePlayer((s) => s.playQueue);
  const playStation = usePlayer((s) => s.playStation);
  const toggle = usePlayer((s) => s.toggle);

  if (tracks.length === 0) {
    return <p className="px-2 py-6 text-center text-sm text-muted">Nothing here yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-0.5">
      {tracks.map((t, i) => {
        const isCurrent = t.id === currentId;
        const isPlaying = isCurrent && playing;
        const rowPlay = () =>
          isCurrent ? toggle() : station ? playStation(t) : playQueue(tracks, i, contextKind);
        return (
          <li
            key={t.id}
            role="button"
            tabIndex={0}
            aria-label={isPlaying ? `Pause ${t.title}` : `Play ${t.title}`}
            onClick={rowPlay}
            onKeyDown={(e) => {
              // only when the row itself has focus — Enter/Space aimed at the
              // like button, artist link, or remove button must do their job
              if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                rowPlay();
              }
            }}
            className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2 ${
              isCurrent ? "bg-surface-2" : ""
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/80 transition group-hover:bg-accent group-hover:text-[#06121c]">
              {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
            </span>

            {numbered && (
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted">
                {t.trackNo ?? i + 1}
              </span>
            )}

            <span
              className={`min-w-0 flex-1 truncate text-sm ${
                isCurrent ? "font-semibold text-accent" : ""
              }`}
            >
              {t.title}
            </span>

            {showArtist && (
              <Link
                href={`/u/${t.handle}`}
                onClick={(e) => e.stopPropagation()}
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

            <span onClick={(e) => e.stopPropagation()}>
              <LikeButton trackId={t.id} initialLiked={!!t.liked} authed={authed} compact />
            </span>

            {onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(t.id);
                }}
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
