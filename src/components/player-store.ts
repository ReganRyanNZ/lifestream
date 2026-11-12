"use client";

import { create } from "zustand";
import type { TrackDTO } from "@/lib/types";

/** What the current queue represents — shown as "Up next: …" and switchable. */
export type PlayContextKind = "station" | "album" | "playlist" | "list";

type PlayerState = {
  queue: TrackDTO[];
  index: number;
  playing: boolean;
  position: number;
  duration: number;
  contextKind: PlayContextKind | null;
  playQueue: (tracks: TrackDTO[], startIndex?: number, kind?: PlayContextKind) => void;
  /** Play one track immediately, then continue with a popularity-weighted "radio" queue drawn from all songs. */
  playStation: (seed: TrackDTO) => void;
  /** Swap the queue behind the currently playing song (it keeps playing, uninterrupted). */
  switchToQueue: (tracks: TrackDTO[], kind: PlayContextKind) => void;
  /** Rebuild the queue behind the current song as a fresh radio mix. */
  regenerateStation: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (sec: number) => void;
};

/**
 * Exactly one <audio> element for the whole app. It lives at module level so it
 * is never remounted by React — required for Media Session background playback.
 * crossOrigin="anonymous" lets the service worker read/slice audio responses
 * (needs CORS enabled on the storage origin in r2 mode; same-origin in local).
 */
export const audio: HTMLAudioElement | null =
  typeof window === "undefined"
    ? null
    : (() => {
        const a = new Audio();
        a.preload = "auto";
        a.crossOrigin = "anonymous";
        return a;
      })();

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  playing: false,
  position: 0,
  duration: 0,
  contextKind: null,

  playQueue: (tracks, startIndex = 0, kind = "list") => {
    if (tracks.length === 0) return;
    const index = Math.min(Math.max(startIndex, 0), tracks.length - 1);
    set({ queue: tracks, index, position: 0, contextKind: kind });
    const t = tracks[index];
    if (audio) {
      if (!audio.src || new URL(audio.src).href !== new URL(t.audioUrl, location.href).href) {
        audio.src = t.audioUrl;
      }
      audio.play().catch(() => {});
    }
    set({ playing: true });
  },

  playStation: (seed) => {
    // start the seed immediately with a one-track queue…
    set({ queue: [seed], index: 0, position: 0, contextKind: "station" });
    if (audio) {
      audio.src = seed.audioUrl;
      audio.play().catch(() => {});
    }
    set({ playing: true });

    // …then extend with a popularity-weighted sample of everything, so the
    // queue (and next-track preload) is ready long before the seed ends.
    fetch("/api/shuffle")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { tracks?: TrackDTO[] } | null) => {
        if (!j?.tracks?.length) return;
        const s = usePlayer.getState();
        // only extend if the seed is still what's on
        if (!s.playing || s.queue[s.index]?.id !== seed.id) return;
        const seen = new Set(s.queue.map((t) => t.id));
        const rest = j.tracks.filter((t) => !seen.has(t.id));
        if (rest.length > 0) usePlayer.setState({ queue: [...s.queue, ...rest] });
      })
      .catch(() => {});
  },

  switchToQueue: (tracks, kind) => {
    const cur = usePlayer.getState().queue[usePlayer.getState().index];
    const pos = cur ? tracks.findIndex((t) => t.id === cur.id) : -1;
    if (pos >= 0) {
      // keep the current song playing; only what comes after it changes
      usePlayer.setState({ queue: tracks.slice(pos), index: 0, contextKind: kind });
    } else {
      usePlayer.getState().playQueue(tracks, 0, kind);
    }
  },

  regenerateStation: () => {
    const cur = usePlayer.getState().queue[usePlayer.getState().index];
    if (!cur) return;
    fetch("/api/shuffle")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { tracks?: TrackDTO[] } | null) => {
        if (!j?.tracks?.length) return;
        const s = usePlayer.getState();
        if (s.queue[s.index]?.id !== cur.id) return;
        const rest = j.tracks.filter((t) => t.id !== cur.id);
        usePlayer.setState({ queue: [cur, ...rest], index: 0, contextKind: "station" });
      })
      .catch(() => {});
  },

  toggle: () => {
    if (!audio) return;
    const t = get().queue[get().index];
    if (!t) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
    // playing state is synced by the play/pause events in bindAudio()
  },

  next: () => {
    const { index, queue } = get();
    if (index + 1 < queue.length) {
      get().playQueue(queue, index + 1);
    } else {
      set({ playing: false });
      audio?.pause();
    }
  },

  prev: () => {
    const { index, position, queue } = get();
    if (position > 3 || index === 0) {
      get().seek(0);
    } else {
      get().playQueue(queue, index - 1);
    }
  },

  seek: (sec) => {
    if (audio && Number.isFinite(sec)) {
      audio.currentTime = sec;
      set({ position: sec });
    }
  },
}));

let bound = false;
/** Wire audio element events to the store. Call once from a client effect. */
export function bindAudio() {
  if (!audio || bound) return;
  bound = true;

  let consecutiveErrors = 0;

  audio.addEventListener("play", () => usePlayer.setState({ playing: true }));
  audio.addEventListener("pause", () => usePlayer.setState({ playing: false }));
  audio.addEventListener("ended", () => usePlayer.getState().next());
  audio.addEventListener("playing", () => {
    consecutiveErrors = 0;
  });

  // a track that fails to load (bad file, offline, codec) must not silently
  // stop the queue — skip to the next one, give up after 5 in a row
  audio.addEventListener("error", () => {
    const s = usePlayer.getState();
    if (s.index + 1 < s.queue.length && consecutiveErrors < 5) {
      consecutiveErrors++;
      s.next();
    } else {
      usePlayer.setState({ playing: false });
    }
  });

  audio.addEventListener("timeupdate", () =>
    usePlayer.setState({ position: audio.currentTime }),
  );
  audio.addEventListener("loadedmetadata", () =>
    usePlayer.setState({ duration: audio.duration || 0 }),
  );
}

// ---------- play-count beacon accounting ----------

export function getClientUuid(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("ls-client-uuid");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("ls-client-uuid", id);
  }
  return id;
}

/** Approximate listened-seconds accumulator for the current track. */
const acc = { last: -1, seconds: 0, trackId: null as string | null };

export function observeTime(currentTime: number) {
  const { last } = acc;
  if (last >= 0 && Math.abs(currentTime - last) < 1.5) {
    acc.seconds += currentTime - last;
  }
  acc.last = currentTime;
}

export function startAccumulating(trackId: string | null) {
  acc.last = -1;
  acc.seconds = 0;
  acc.trackId = trackId;
}

/** Returns and resets the accumulated seconds for the current track. */
export function drainAccumulator(): { trackId: string | null; seconds: number } {
  const out = { trackId: acc.trackId, seconds: Math.floor(acc.seconds) };
  acc.last = -1;
  acc.seconds = 0;
  return out;
}
