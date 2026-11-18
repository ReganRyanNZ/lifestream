"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  audio,
  bindAudio,
  drainAccumulator,
  getClientUuid,
  observeTime,
  probeAuthed,
  startAccumulating,
  usePlayer,
} from "@/components/player-store";
import { Cover } from "@/components/Cover";
import { LikeButton } from "@/components/LikeButton";
import { SeekSlider, TimeOnly } from "@/components/SeekSlider";
import { TrackMenu } from "@/components/TrackMenu";
import { PauseIcon, PlayIcon } from "@/components/icons";

function sendBeacon(trackId: string | null, seconds: number) {
  if (!trackId || seconds < 5) return;
  const payload = JSON.stringify({
    trackId,
    secondsPlayed: seconds,
    clientUuid: getClientUuid(),
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/plays", new Blob([payload], { type: "application/json" }));
  } else {
    fetch("/api/plays", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
}

export function Player() {
  const track = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing);
  const queueLength = usePlayer((s) => s.queue.length);
  const nowPlayingOpen = usePlayer((s) => s.nowPlayingOpen);
  const setNowPlaying = usePlayer((s) => s.setNowPlaying);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);

  // auth probe for the like button (cached — one /api/me per page load)
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    probeAuthed().then(setAuthed);
  }, []);

  // spacebar toggles playback when nothing interactive is focused (inputs,
  // buttons, links and rows keep their native space behavior)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, button, a, [contenteditable], [role='button'], [role='slider'], [role='menuitem']")) return;
      e.preventDefault(); // keep the page from scrolling
      usePlayer.getState().toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // bind audio events + accumulated-seconds observer, once
  useEffect(() => {
    bindAudio();
    const a = audio;
    if (!a) return;
    const onTime = () => observeTime(a.currentTime);
    const onPause = () => {
      const { trackId, seconds } = drainAccumulator();
      sendBeacon(trackId, seconds);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        const { trackId, seconds } = drainAccumulator();
        sendBeacon(trackId, seconds);
      }
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onPause);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // reset the per-track accumulator when the track changes
  const prevTrackId = useRef<string | null>(null);
  useEffect(() => {
    if (prevTrackId.current && prevTrackId.current !== track?.id) {
      // draining on switch counts what was listened before the switch
      const { trackId, seconds } = drainAccumulator();
      sendBeacon(trackId, seconds);
    }
    prevTrackId.current = track?.id ?? null;
    startAccumulating(track?.id ?? null);
  }, [track?.id]);

  // Media Session: register action handlers as early as possible — this is
  // what lets iOS Safari keep playing / advance tracks with the screen locked.
  // All actions are registered plainly; which lock-screen buttons iOS draws
  // (track skip vs seek) is the OS's call per context.
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const set = (action: MediaSessionAction, fn: (d?: MediaSessionActionDetails) => void) => {
      try {
        ms.setActionHandler(action, fn as never);
      } catch {
        /* action unsupported */
      }
    };
    set("play", () => audio?.play().catch(() => {}));
    set("pause", () => audio?.pause());
    set("previoustrack", () => usePlayer.getState().prev());
    set("nexttrack", () => usePlayer.getState().next());
    set("seekto", (d) => {
      if (typeof d?.seekTime === "number") usePlayer.getState().seek(d.seekTime);
    });
    set("seekbackward", (d) =>
      usePlayer
        .getState()
        .seek(Math.max(0, usePlayer.getState().position - (d?.seekOffset ?? 10))),
    );
    set("seekforward", (d) =>
      usePlayer.getState().seek(usePlayer.getState().position + (d?.seekOffset ?? 10)),
    );
  }, []);

  // metadata + lock-screen artwork per track
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms || !track) return;
    ms.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: "Life Stream",
      artwork: track.artworkUrl
        ? [{ src: track.artworkUrl, sizes: "500x500", type: "image/jpeg" }]
        : [],
    });
  }, [track]);

  // keep lock-screen scrubber in sync — polled every 5s rather than per
  // timeupdate (positionState is advisory; per-tick updates just churn)
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const update = () => {
      const { position, duration } = usePlayer.getState();
      if (!duration || !Number.isFinite(duration)) return;
      try {
        ms.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(position, duration),
        });
      } catch {
        /* ignore */
      }
    };
    update();
    const id = setInterval(update, 5000);
    return () => clearInterval(id);
  }, []);

  // preload the next track into the service-worker playback cache (also what
  // lets background "next track" work on iOS). Re-run when the queue extends
  // (e.g. a station queue arriving right after the seed starts).
  const trackId = track?.id;
  useEffect(() => {
    if (!trackId) return;
    const nxt = usePlayer.getState().queue[usePlayer.getState().index + 1];
    if (nxt) fetch(nxt.audioUrl).catch(() => {});
  }, [trackId, queueLength]);

  // drag up anywhere on the bar to open the full player — the sheet rises
  // under the thumb while dragging (via sheetDrag in the store)
  const drag = useRef<{ x: number; y: number; vertical: boolean } | null>(null);

  // hidden while the full-screen Now Playing view is open (it covers the app)
  if (!track || nowPlayingOpen) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 touch-none border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      onPointerDown={(e) => {
        if (!e.isPrimary) return;
        drag.current = { x: e.clientX, y: e.clientY, vertical: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dy = d.y - e.clientY; // upward = positive
        const dx = Math.abs(e.clientX - d.x);
        if (!d.vertical) {
          // lock in once the gesture is clearly upward (seek slider stays usable)
          if (dy > 12 && dy > dx * 1.5) d.vertical = true;
          else if (dy < -20) drag.current = null;
        }
        if (d.vertical) {
          e.preventDefault?.();
          usePlayer.getState().setSheetDrag(dy);
        }
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        const risen = usePlayer.getState().sheetDrag;
        usePlayer.getState().setSheetDrag(0);
        if (d?.vertical && risen > 120) setNowPlaying(true);
      }}
      onPointerCancel={() => {
        drag.current = null;
        usePlayer.getState().setSheetDrag(0);
      }}
    >
      {/* expand handle — the YouTube Music-style toggle into the full player */}
      <button
        onClick={() => setNowPlaying(true)}
        aria-label="Now playing"
        aria-expanded={false}
        className="absolute -top-4 left-1/2 flex h-8 w-24 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface/95 text-muted shadow-md backdrop-blur transition hover:text-foreground"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
        </svg>
      </button>

      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-3.5">
        <button
          onClick={() => setNowPlaying(true)}
          aria-label={`Now playing: ${track.title}`}
          className="h-14 w-14 shrink-0 cursor-pointer sm:h-16 sm:w-16"
        >
          <Cover title={track.title} artworkUrl={track.artworkUrl} color={track.color} rounded="rounded-md" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <button
              onClick={() => setNowPlaying(true)}
              className="truncate text-[15px] font-semibold hover:underline sm:text-base"
            >
              {track.title}
            </button>
            <Link
              href={`/u/${track.handle}`}
              className="hidden shrink-0 truncate text-[13px] text-muted hover:text-foreground hover:underline sm:inline sm:text-sm"
            >
              {track.artist}
            </Link>
          </div>
          <div className="mt-1.5">
            {/* small screens: ticking time only; sm and up: the seek slider */}
            <div className="sm:hidden">
              <TimeOnly fallbackDurationSec={track.durationSec} />
            </div>
            <div className="hidden sm:block">
              <SeekSlider fallbackDurationSec={track.durationSec} />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <TrackMenu key={track.id} track={track} />

          <button
            onClick={prev}
            aria-label="Previous track"
            className="btn-icon !h-11 !w-11"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M6 5h2v14H6zM20 5v14l-11-7z" />
            </svg>
          </button>
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-[#06121c] transition hover:brightness-110"
          >
            {playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
          </button>
          <button
            onClick={next}
            aria-label="Next track"
            className="btn-icon !h-11 !w-11"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
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
      </div>
    </div>
  );
}
