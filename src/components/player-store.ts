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
  /** Full-screen "now playing + queue" view is open (YouTube Music style). */
  nowPlayingOpen: boolean;
  setNowPlaying: (open: boolean) => void;
  playQueue: (tracks: TrackDTO[], startIndex?: number, kind?: PlayContextKind) => void;
  /** Play one track immediately, then continue with a popularity-weighted "radio" queue drawn from all songs. */
  playStation: (seed: TrackDTO) => void;
  /** Swap the queue behind the currently playing song (it keeps playing, uninterrupted). */
  switchToQueue: (tracks: TrackDTO[], kind: PlayContextKind) => void;
  /** Rebuild the queue behind the current song as a fresh radio mix. */
  regenerateStation: () => void;
  /** Move a queued track to a new position (drag-to-reorder in Up next). */
  moveQueueItem: (from: number, to: number) => void;
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

/**
 * Start playback, with a retry: Safari/WebView sometimes refuses a play()
 * that races an in-flight src change (e.g. clicking a new song while paused).
 * The audio element is already unlocked by earlier playback, so the retry
 * once the track has loaded is allowed without a fresh gesture. If it still
 * fails, the store reflects the truth (paused) instead of showing a silent
 * "playing" state.
 */
function startAudio() {
  if (!audio) return;
  audio.play().catch(() => {
    const retry = () => {
      if (!usePlayer.getState().playing) return; // user changed their mind
      audio.play().catch(() => usePlayer.setState({ playing: false }));
    };
    if (audio.readyState >= 1) retry();
    else audio.addEventListener("loadeddata", retry, { once: true });
  });
}

/** Fetch a popularity-weighted sample; null on any failure. */
function fetchShuffleSample(): Promise<TrackDTO[] | null> {
  return fetch(`/api/shuffle?client=${encodeURIComponent(getClientUuid())}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { tracks?: TrackDTO[] } | null) => j?.tracks?.length ? j.tracks : null)
    .catch(() => null);
}

/**
 * Replace the queue with a fresh mix after the station's last song ends —
 * unless the listener intervened while the sample was loading (played
 * something else, replayed the ended song). audio.ended stays true only
 * until a seek or a new load, so it is the precise "nothing happened" signal.
 */
function continueStationAfter() {
  fetchShuffleSample().then((tracks) => {
    if (!tracks) return;
    const s = usePlayer.getState();
    if (s.contextKind !== "station") return;
    if (!audio || !audio.ended) return; // user replayed/switched — leave it
    const endedId = s.queue[s.index]?.id;
    s.playQueue(tracks.filter((t) => t.id !== endedId), 0, "station");
  });
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  playing: false,
  position: 0,
  duration: 0,
  contextKind: null,
  nowPlayingOpen: false,
  setNowPlaying: (open) => set({ nowPlayingOpen: open }),

  playQueue: (tracks, startIndex = 0, kind = "list") => {
    if (tracks.length === 0) return;
    const index = Math.min(Math.max(startIndex, 0), tracks.length - 1);
    set({ queue: tracks, index, position: 0, contextKind: kind });
    const t = tracks[index];
    if (audio) {
      if (!audio.src || new URL(audio.src).href !== new URL(t.audioUrl, location.href).href) {
        audio.src = t.audioUrl;
      }
      startAudio();
    }
    set({ playing: true });
  },

  playStation: (seed) => {
    // start the seed immediately with a one-track queue…
    set({ queue: [seed], index: 0, position: 0, contextKind: "station" });
    if (audio) {
      audio.src = seed.audioUrl;
      startAudio();
    }
    set({ playing: true });

    // …then extend with a popularity-weighted sample of everything, so the
    // queue (and next-track preload) is ready long before the seed ends.
    fetchShuffleSample().then((tracks) => {
      if (!tracks) return;
      const s = usePlayer.getState();
      // only extend if the seed is still what's on
      if (!s.playing || s.queue[s.index]?.id !== seed.id) return;
      const seen = new Set(s.queue.map((t) => t.id));
      const rest = tracks.filter((t) => !seen.has(t.id));
      if (rest.length > 0) usePlayer.setState({ queue: [...s.queue, ...rest] });
    });
  },

  switchToQueue: (tracks, kind) => {
    const s = usePlayer.getState();
    const cur = s.queue[s.index];
    const pos = cur ? tracks.findIndex((t) => t.id === cur.id) : -1;
    if (pos >= 0) {
      // keep the current song playing (same audio, same position); the queue
      // becomes the album rotated to start from it, wrapping past the end
      const rotated = [...tracks.slice(pos), ...tracks.slice(0, pos)];
      usePlayer.setState({ queue: rotated, index: 0, contextKind: kind });
    } else {
      usePlayer.getState().playQueue(tracks, 0, kind);
    }
  },

  regenerateStation: () => {
    const cur = usePlayer.getState().queue[usePlayer.getState().index];
    if (!cur) return;
    fetchShuffleSample().then((tracks) => {
      if (!tracks) return;
      const s = usePlayer.getState();
      if (s.queue[s.index]?.id !== cur.id) return;
      const rest = tracks.filter((t) => t.id !== cur.id);
      usePlayer.setState({ queue: [cur, ...rest], index: 0, contextKind: "station" });
    });
  },

  moveQueueItem: (from, to) => {
    const { queue, index } = get();
    if (from === to || from <= index || to <= index) return; // current song stays put
    if (from >= queue.length || to >= queue.length) return;
    const q = queue.slice();
    const [item] = q.splice(from, 1);
    q.splice(to, 0, item);
    set({ queue: q }); // index unchanged: from/to are both after it
  },

  toggle: () => {
    if (!audio) return;
    const t = get().queue[get().index];
    if (!t) return;
    if (audio.paused) startAudio();
    else audio.pause();
    // playing state is synced by the play/pause events in bindAudio()
  },

  next: () => {
    const { index, queue, position, duration, playing } = get();
    const cur = queue[index];

    // skipping a song early (well before its end) tells the radio to play it
    // less for this listener — natural track-end never triggers this
    if (cur && playing) {
      const dur = duration || cur.durationSec || 0;
      const threshold = Math.min(20, Math.max(2, dur * 0.35));
      if (position < threshold) recordPreference(cur.id, "skip");
    }

    if (index + 1 < queue.length) {
      get().playQueue(queue, index + 1, get().contextKind ?? "list");
    } else if (get().contextKind === "station") {
      // the radio mix never ends: draw a fresh weighted sample and continue
      continueStationAfter();
    } else {
      // lists (albums, playlists, artist songs) wrap back to the top
      get().playQueue(queue, 0, get().contextKind ?? "list");
    }
  },

  prev: () => {
    const { index, position, queue } = get();
    if (position > 3 || index === 0) {
      get().seek(0);
    } else {
      get().playQueue(queue, index - 1, get().contextKind ?? "list");
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

// ---------- auth probe (shared, cached for the page lifetime) ----------

let authedProbe: Promise<boolean> | null = null;

/**
 * One /api/me probe per page load, shared by the mini bar and the Now Playing
 * overlay (login/logout always triggers a navigation, so no live refresh).
 */
export function probeAuthed(): Promise<boolean> {
  if (!authedProbe) {
    authedProbe = fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { authed?: boolean } | null) => !!j?.authed)
      .catch(() => false);
  }
  return authedProbe;
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

/** Fire-and-forget taste signal (skip / like / unlike) for radio weighting. */
export function recordPreference(trackId: string, kind: "skip" | "like" | "unlike") {
  try {
    const body = JSON.stringify({ trackId, kind, clientUuid: getClientUuid() });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/preferences", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* best effort */
  }
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
