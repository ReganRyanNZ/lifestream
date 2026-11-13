"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  audio,
  bindAudio,
  drainAccumulator,
  getClientUuid,
  observeTime,
  startAccumulating,
  usePlayer,
} from "@/components/player-store";
import { Cover } from "@/components/Cover";
import { LikeButton } from "@/components/LikeButton";
import { addToPlaylist, createPlaylistWithTrack } from "@/app/actions";
import { fmtDuration } from "@/lib/format";

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
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const queueLength = usePlayer((s) => s.queue.length);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const seek = usePlayer((s) => s.seek);

  // auth probe for the like button (cached promise — one fetch per page load)
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { authed?: boolean } | null) => setAuthed(!!j?.authed))
      .catch(() => {});
  }, []);

  // ---- kabob menu state ----
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [playlists, setPlaylists] = useState<{ id: string; title: string }[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [muteState, setMuteState] = useState({ songMuted: false, albumMuted: false });
  const [notice, setNotice] = useState<string | null>(null);
  const notify = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 2600);
  };

  useEffect(() => {
    if (!track) return;
    setMuteState({ songMuted: false, albumMuted: false });
    setShowPlaylists(false);
    fetch(`/api/preferences?client=${encodeURIComponent(getClientUuid())}&trackId=${track.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) setMuteState({ songMuted: !!j.songMuted, albumMuted: !!j.albumMuted });
      })
      .catch(() => {});
  }, [track?.id]);

  function openMenu() {
    setMenuOpen(true);
    fetch("/api/playlists")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { playlists?: { id: string; title: string }[] } | null) =>
        setPlaylists(j?.playlists ?? []),
      )
      .catch(() => {});
  }

  async function postPref(kind: string) {
    if (!track) return;
    await fetch("/api/preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackId: track.id, kind, clientUuid: getClientUuid() }),
    }).catch(() => {});
  }

  async function toggleMute(kind: "mute" | "unmute" | "mute-album" | "unmute-album") {
    const song = kind === "mute" || kind === "unmute";
    const muting = kind.startsWith("mute");
    setMenuOpen(false);
    await postPref(kind);
    if (song) setMuteState((s) => ({ ...s, songMuted: muting }));
    else setMuteState((s) => ({ ...s, albumMuted: muting }));
    notify(muting ? (song ? "Won't autoplay this song" : "Won't autoplay this album") : "Autoplay restored");
    // honor it immediately if we're in a radio mix
    if (usePlayer.getState().contextKind === "station") {
      usePlayer.getState().regenerateStation();
    }
  }

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

  // keep lock-screen scrubber in sync (throttled to every ~5s)
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms || !duration || !Number.isFinite(duration)) return;
    try {
      ms.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(position, duration),
      });
    } catch {
      /* ignore */
    }
  }, [Math.floor(position / 5), duration]);

  // preload the next track into the service-worker playback cache (also what
  // lets background "next track" work on iOS). Re-run when the queue extends
  // (e.g. a station queue arriving right after the seed starts).
  useEffect(() => {
    if (!track) return;
    const nxt = usePlayer.getState().queue[usePlayer.getState().index + 1];
    if (nxt) fetch(nxt.audioUrl).catch(() => {});
  }, [track?.id, queueLength]);

  const onSeekInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      seek(parseFloat(e.target.value));
    },
    [seek],
  );

  if (!track) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2 sm:gap-4 sm:px-4 sm:py-2.5">
        <Link href={`/track/${track.id}`} className="shrink-0" aria-label={track.title}>
          <div className="h-11 w-11 sm:h-12 sm:w-12">
            <Cover title={track.title} artworkUrl={track.artworkUrl} color={track.color} rounded="rounded-md" />
          </div>
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <Link
              href={`/track/${track.id}`}
              className="truncate text-sm font-semibold hover:underline"
            >
              {track.title}
            </Link>
            <Link
              href={`/u/${track.handle}`}
              className="hidden shrink-0 truncate text-xs text-muted hover:text-foreground hover:underline sm:inline"
            >
              {track.artist}
            </Link>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted">
              {fmtDuration(position)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || track.durationSec || 0}
              step={0.5}
              value={Math.min(position, duration || track.durationSec)}
              onChange={onSeekInput}
              aria-label="Seek"
              className="min-w-0 flex-1"
              style={{ accentColor: "var(--accent)" }}
            />
            <span className="w-9 shrink-0 text-[11px] tabular-nums text-muted">
              {fmtDuration(duration || track.durationSec)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {/* kabob menu */}
          <div className="relative">
            <button
              onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="btn-icon"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
                <div
                  role="menu"
                  className="card absolute bottom-full right-0 z-50 mb-2 flex w-64 flex-col gap-0.5 p-1.5 text-sm"
                >
                  {!showPlaylists ? (
                    <button
                      role="menuitem"
                      onClick={() => setShowPlaylists(true)}
                      className="rounded-md px-2.5 py-2 text-left hover:bg-surface-2"
                    >
                      <span className="inline-block w-4" aria-hidden />
                      Add to playlist
                    </button>
                  ) : (
                    <div className="flex flex-col">
                      <span className="px-2.5 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted">
                        Add to playlist
                      </span>
                      <div className="flex max-h-44 flex-col overflow-y-auto">
                        {playlists.length === 0 && (
                          <span className="px-2.5 py-1 text-xs text-muted">
                            No playlists yet
                          </span>
                        )}
                        {playlists.map((p) => (
                          <button
                            key={p.id}
                            role="menuitem"
                            onClick={async () => {
                              setMenuOpen(false);
                              try {
                                await addToPlaylist(p.id, track.id);
                                notify(`Added to “${p.title}”`);
                              } catch {
                                notify("Couldn't add — sign in first");
                              }
                            }}
                            className="truncate rounded-md px-2.5 py-1.5 text-left hover:bg-surface-2"
                          >
                            {p.title}
                          </button>
                        ))}
                      </div>
                      <form
                        className="mt-1 flex gap-1.5 px-1 pb-1"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setMenuOpen(false);
                          try {
                            await createPlaylistWithTrack(newTitle, track.id);
                            notify(`Created “${newTitle || "New playlist"}”`);
                          } catch {
                            notify("Couldn't create — sign in first");
                          }
                        }}
                      >
                        <input
                          className="input !px-2 !py-1 text-xs"
                          placeholder="New playlist…"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                        />
                        <button type="submit" className="btn btn-primary !px-2.5 !py-1 text-xs">
                          Create
                        </button>
                      </form>
                    </div>
                  )}

                  <button
                    role="menuitem"
                    aria-pressed={muteState.songMuted}
                    onClick={() => toggleMute(muteState.songMuted ? "unmute" : "mute")}
                    className="rounded-md px-2.5 py-2 text-left hover:bg-surface-2"
                  >
                    <span
                      className={`inline-block w-4 text-accent ${muteState.songMuted ? "" : "invisible"}`}
                      aria-hidden
                    >
                      ✓
                    </span>
                    Do not autoplay this song
                  </button>
                  {track.albumId && (
                    <button
                      role="menuitem"
                      aria-pressed={muteState.albumMuted}
                      onClick={() =>
                        toggleMute(muteState.albumMuted ? "unmute-album" : "mute-album")
                      }
                      className="rounded-md px-2.5 py-2 text-left hover:bg-surface-2"
                    >
                      <span
                        className={`inline-block w-4 text-accent ${muteState.albumMuted ? "" : "invisible"}`}
                        aria-hidden
                      >
                        ✓
                      </span>
                      Do not autoplay this album
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <button onClick={prev} aria-label="Previous track" className="btn-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M6 5h2v14H6zM20 5v14l-11-7z" />
            </svg>
          </button>
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-[#06121c] transition hover:brightness-110"
          >
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M7 4l13 8-13 8z" />
              </svg>
            )}
          </button>
          <button onClick={next} aria-label="Next track" className="btn-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
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

      {notice && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-full">
          <div className="card mb-2 px-3 py-1.5 text-xs">{notice}</div>
        </div>
      )}
    </div>
  );
}
