"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePlayer } from "@/components/player-store";
import { Cover } from "@/components/Cover";
import { LikeButton } from "@/components/LikeButton";
import { SeekSlider } from "@/components/SeekSlider";
import { TrackMenu } from "@/components/TrackMenu";
import { CONTEXT_LABEL } from "@/components/UpNext";
import { fmtDuration } from "@/lib/format";
import type { TrackDTO } from "@/lib/types";

const MAX_ROWS = 50;

/** One queue row: number → play on hover; the current song toggles pause. */
function Row({
  track,
  queueIndex,
  displayNo,
  current = false,
}: {
  track: TrackDTO;
  /** absolute index in the player queue (what clicking plays) */
  queueIndex: number;
  /** 1-based position shown to the user */
  displayNo?: number;
  current?: boolean;
}) {
  const playing = usePlayer((s) => s.playing);
  const isPlaying = current && playing;

  return (
    <li
      className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2 ${
        current ? "bg-surface-2" : ""
      }`}
    >
      <button
        onClick={() => {
          const s = usePlayer.getState();
          if (current) s.toggle();
          else s.playQueue(s.queue, queueIndex, s.contextKind ?? "list");
        }}
        aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/80 transition hover:bg-accent hover:text-[#06121c]"
      >
        {isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
          </svg>
        ) : (
          <>
            {current || displayNo == null ? null : (
              <span className="text-xs tabular-nums text-muted group-hover:hidden">{displayNo}</span>
            )}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
              className={current ? "" : "hidden group-hover:block"}
            >
              <path d="M7 4l13 8-13 8z" />
            </svg>
          </>
        )}
      </button>
      <Link
        href={`/track/${track.id}`}
        className={`min-w-0 flex-1 truncate text-sm hover:underline ${
          current ? "font-semibold text-accent" : ""
        }`}
      >
        {track.title}
      </Link>
      <span className="hidden max-w-40 shrink-0 truncate text-xs text-muted sm:inline">
        {track.artist}
      </span>
      <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted">
        {fmtDuration(track.durationSec)}
      </span>
    </li>
  );
}

/** The live queue: current song + up next, with radio-mix / album switching. */
function QueuePanel() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const contextKind = usePlayer((s) => s.contextKind);
  const [albumBusy, setAlbumBusy] = useState(false);

  const current = queue[index];
  if (!current) return null;

  const upcoming = queue.slice(index + 1, index + 1 + MAX_ROWS);
  const more = queue.length - (index + 1 + upcoming.length);

  async function playAlbumInOrder() {
    if (!current.albumId || albumBusy) return;
    setAlbumBusy(true);
    try {
      const r = await fetch(`/api/albums/${current.albumId}/tracks`);
      if (r.ok) {
        const j = (await r.json()) as { tracks?: TrackDTO[] };
        // switchToQueue keeps the current song playing if it's in the album
        if (j.tracks?.length) usePlayer.getState().switchToQueue(j.tracks, "album");
      }
    } catch {
      /* offline — ignore */
    } finally {
      setAlbumBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="section-title !mb-0">Up next</h2>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
          {CONTEXT_LABEL[contextKind ?? "list"]}
        </span>
        <span className="ml-auto flex gap-2">
          {contextKind !== "station" && (
            <button
              className="btn btn-ghost !px-3 !py-1.5"
              onClick={() => usePlayer.getState().regenerateStation()}
            >
              Radio mix
            </button>
          )}
          {current.albumId && contextKind !== "album" && (
            <button
              className="btn btn-ghost !px-3 !py-1.5"
              onClick={playAlbumInOrder}
              disabled={albumBusy}
            >
              {albumBusy ? "Loading…" : "Album in order"}
            </button>
          )}
        </span>
      </div>
      <ol className="flex flex-col gap-0.5">
        <Row track={current} queueIndex={index} current />
        {upcoming.map((t, k) => (
          <Row key={`${t.id}-${k}`} track={t} queueIndex={index + 1 + k} displayNo={k + 1} />
        ))}
      </ol>
      {upcoming.length === 0 && (
        <p className="px-2 py-4 text-sm text-muted">
          End of queue — switch to the radio mix to keep the music going.
        </p>
      )}
      {more > 0 && <p className="px-2 pt-2 text-xs text-muted">+{more} more in the queue</p>}
    </section>
  );
}

function TransportControls({ authed }: { authed: boolean }) {
  const playing = usePlayer((s) => s.playing);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const track = usePlayer((s) => s.queue[s.index]);
  if (!track) return null;

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-5">
      <TrackMenu track={track} direction="down" />

      <button onClick={prev} aria-label="Previous track" className="btn-icon !h-10 !w-10">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M6 5h2v14H6zM20 5v14l-11-7z" />
        </svg>
      </button>
      <button
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-[#06121c] transition hover:brightness-110"
      >
        {playing ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M7 4l13 8-13 8z" />
          </svg>
        )}
      </button>
      <button onClick={next} aria-label="Next track" className="btn-icon !h-10 !w-10">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M16 5h2v14h-2zM4 5l11 7-11 7z" />
        </svg>
      </button>

      <LikeButton
        key={`${track.id}-${track.liked ?? false}`}
        trackId={track.id}
        initialLiked={!!track.liked}
        authed={authed}
        compact
      />
    </div>
  );
}

/**
 * Full-screen "now playing" view (YouTube Music style): slides up over the
 * app, shows the current track large plus the live queue — the current
 * playlist / radio mix — with radio-mix ↔ album switching. Closes via the
 * chevron, Escape, a swipe down on mobile, or any navigation.
 */
export function NowPlaying() {
  const track = usePlayer((s) => s.queue[s.index]);
  const open = usePlayer((s) => s.nowPlayingOpen);
  const setNowPlaying = usePlayer((s) => s.setNowPlaying);
  const pathname = usePathname();

  const [authed, setAuthed] = useState(false);
  const [dragY, setDragY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);

  // navigating (search, a track page, …) always returns to the browse view
  useEffect(() => {
    setNowPlaying(false);
  }, [pathname, setNowPlaying]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNowPlaying(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setNowPlaying]);

  // lock background scroll while open + focus the sheet for keyboard users
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // auth probe for the like button, refreshed each time the view opens
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { authed?: boolean } | null) => {
        if (alive) setAuthed(!!j?.authed);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  if (!track) return null;

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      tabIndex={-1}
      inert={!open}
      className={`fixed inset-0 z-[60] flex flex-col bg-background outline-none transition-[transform,visibility] duration-300 ease-out ${
        open ? "visible translate-y-0" : "invisible translate-y-full"
      }`}
      style={dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
    >
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-y-auto px-3 sm:px-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] lg:grid-rows-[minmax(0,1fr)] lg:gap-8 lg:overflow-hidden lg:px-4">
        {/* left: the current track (swipe down on it to close, on touch) */}
        <div
          className="flex flex-col gap-4 pb-6 pt-2 touch-none lg:justify-center lg:overflow-y-auto lg:py-6"
          onTouchStart={(e) => {
            touchStartY.current = e.touches[0].clientY;
          }}
          onTouchMove={(e) => {
            if (touchStartY.current == null) return;
            const dy = e.touches[0].clientY - touchStartY.current;
            if (dy > 0) setDragY(dy);
          }}
          onTouchEnd={() => {
            const shouldClose = dragY > 120;
            touchStartY.current = null;
            setDragY(0);
            if (shouldClose) setNowPlaying(false);
          }}
        >
          <button
            onClick={() => setNowPlaying(false)}
            aria-label="Close now playing"
            className="mx-auto flex h-8 w-20 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
            </svg>
          </button>

          <div className="mx-auto w-full max-w-[min(20rem,55dvh)] sm:max-w-[min(24rem,55dvh)] lg:max-w-[min(28rem,60dvh)]">
            <Cover
              title={track.title}
              artworkUrl={track.artworkUrl}
              color={track.color}
              rounded="rounded-xl"
              className="shadow-2xl"
            />
          </div>

          <div className="mx-auto w-full max-w-[24rem] sm:max-w-md lg:max-w-md">
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={`/track/${track.id}`}
                className="min-w-0 truncate text-xl font-bold hover:underline"
              >
                {track.title}
              </Link>
              <Link
                href={`/u/${track.handle}`}
                className="shrink-0 truncate text-sm text-muted hover:text-foreground hover:underline"
              >
                {track.artist}
              </Link>
            </div>
            <div className="mt-3">
              <SeekSlider fallbackDurationSec={track.durationSec} />
            </div>
            <div className="mt-5">
              <TransportControls authed={authed} />
            </div>
          </div>
        </div>

        {/* right: the queue (scrolls on its own on wide screens) */}
        <div className="min-h-0 flex-1 border-t border-border pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 lg:overflow-y-auto lg:overscroll-contain lg:border-l lg:border-t-0 lg:py-6 lg:pr-1">
          <QueuePanel />
        </div>
      </div>
    </div>
  );
}
