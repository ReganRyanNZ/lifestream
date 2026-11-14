"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { probeAuthed, usePlayer } from "@/components/player-store";
import { Cover } from "@/components/Cover";
import { LikeButton } from "@/components/LikeButton";
import { SeekSlider } from "@/components/SeekSlider";
import { TrackMenu } from "@/components/TrackMenu";
import { QueuePanel } from "@/components/Queue";
import { PauseIcon, PlayIcon } from "@/components/icons";

function TransportControls({ authed }: { authed: boolean }) {
  const playing = usePlayer((s) => s.playing);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const track = usePlayer((s) => s.queue[s.index]);
  if (!track) return null;

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-5">
      <TrackMenu key={track.id} track={track} direction="down" />

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
        {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
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
  // drag-to-close: pointer events (touch works too), tracked on the window
  const [drag, setDrag] = useState<{ startY: number; y: number } | null>(null);
  const dragRef = useRef<{ startY: number; y: number } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

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

  // auth probe for the like button (cached — one /api/me per page load)
  useEffect(() => {
    probeAuthed().then(setAuthed);
  }, []);

  // live swipe-down tracking while a sheet drag is active
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = { ...d, y: Math.max(0, e.clientY - d.startY) };
      dragRef.current = next;
      setDrag(next);
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (d && d.y > 120) setNowPlaying(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, setNowPlaying]);

  if (!track) return null;
  const dragY = drag?.y ?? 0;

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
        {/* left: the current track (drag/swipe down on it to close) */}
        <div
          className="flex flex-col gap-4 pb-6 pt-2 touch-none lg:justify-center lg:overflow-y-auto lg:py-6"
          onPointerDown={(e) => {
            if (!e.isPrimary) return;
            const start = { startY: e.clientY, y: 0 };
            dragRef.current = start;
            setDrag(start);
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
        <div className="min-h-0 flex-1 border-t border-border pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 lg:overflow-y-auto lg:overscroll-contain lg:border-l lg:border-t-0 lg:py-6 lg:pl-6 lg:pr-1">
          <QueuePanel />
        </div>
      </div>
    </div>
  );
}
