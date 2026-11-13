"use client";

import { useEffect, useState } from "react";
import { addToPlaylist, createPlaylistWithTrack } from "@/app/actions";
import { getClientUuid, usePlayer } from "@/components/player-store";
import type { TrackDTO } from "@/lib/types";

/**
 * Kabob (⋯) menu for the currently playing track: add to playlist, don't
 * autoplay this song/album. Used by the mini player bar and the Now Playing
 * overlay. Self-contained — fetches playlists + mute state when opened.
 */
export function TrackMenu({
  track,
  direction = "up",
}: {
  track: TrackDTO;
  /** Which way the dropdown opens — up from the bar, down inside the overlay. */
  direction?: "up" | "down";
}) {
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

  // mute state for this track (the component is keyed by track.id at its
  // usage sites, so state resets naturally when the song changes)
  useEffect(() => {
    fetch(`/api/preferences?client=${encodeURIComponent(getClientUuid())}&trackId=${track.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { songMuted?: boolean; albumMuted?: boolean } | null) => {
        if (j) setMuteState({ songMuted: !!j.songMuted, albumMuted: !!j.albumMuted });
      })
      .catch(() => {});
  }, [track.id]);

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

  return (
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
            className={`card absolute z-50 flex w-64 flex-col gap-0.5 p-1.5 text-sm ${
              direction === "up" ? "bottom-full right-0 mb-2" : "left-0 top-full mt-2"
            }`}
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
                    <span className="px-2.5 py-1 text-xs text-muted">No playlists yet</span>
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
              role="menuitemcheckbox"
              aria-checked={muteState.songMuted}
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
                role="menuitemcheckbox"
                aria-checked={muteState.albumMuted}
                onClick={() => toggleMute(muteState.albumMuted ? "unmute-album" : "mute-album")}
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

      {notice && (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[70] -translate-x-1/2">
          <div className="card px-3 py-1.5 text-xs">{notice}</div>
        </div>
      )}
    </div>
  );
}
