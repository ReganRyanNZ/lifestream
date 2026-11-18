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
  /** Which way the dropdown opens when there's room — the menu flips itself
   *  up automatically if the viewport doesn't fit it below. */
  direction?: "up" | "down";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openUp, setOpenUp] = useState(direction === "up");
  // anchor left (menu grows rightward) when the button sits near the left
  // edge, so the w-64 menu stays on screen either way
  const [anchorLeft, setAnchorLeft] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [playlists, setPlaylists] = useState<{ id: string; title: string }[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [muteState, setMuteState] = useState({ songMuted: false, albumMuted: false });
  const [notice, setNotice] = useState<string | null>(null);
  const contextKind = usePlayer((s) => s.contextKind);
  const repeatOne = usePlayer((s) => s.repeatOne);
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

  function openMenu(e: React.MouseEvent) {
    // measure both axes: flip up when there isn't ~340px below, and anchor
    // left (grow rightward) when there isn't room for the 256px menu to the
    // left of the button
    const btn = e.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    setOpenUp(window.innerHeight - r.bottom < 340);
    setAnchorLeft(r.left < 284);
    setShowPlaylists(false); // always reopen on the main toolbar
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

  async function share() {
    setMenuOpen(false);
    const url = `${location.origin}/track/${track.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: track.title, url });
      } catch {
        /* user dismissed the share sheet */
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        notify("Link copied to clipboard");
      } catch {
        notify("Couldn't copy the link");
      }
    }
  }

  /** thumbs-down cycle: none → song → song+album → none */
  async function cycleThumb() {
    const { songMuted, albumMuted } = muteState;
    // stays open — the state change is visible in the icon itself
    if (!songMuted && !albumMuted) {
      await postPref("mute");
      setMuteState({ songMuted: true, albumMuted: false });
      notify("Won't autoplay this song");
    } else if (songMuted && !albumMuted) {
      await postPref("mute-album");
      setMuteState({ songMuted: true, albumMuted: true });
      notify("Won't autoplay this album");
    } else {
      await Promise.all([postPref("unmute"), postPref("unmute-album")]);
      setMuteState({ songMuted: false, albumMuted: false });
      notify("Autoplay restored");
    }
    // honor it immediately if we're in a radio mix
    if (usePlayer.getState().contextKind === "station") {
      usePlayer.getState().regenerateStation();
    }
  }

  const thumbLabel = muteState.albumMuted
    ? "Not autoplaying this album — tap to restore"
    : muteState.songMuted
      ? "Not autoplaying this song — tap to also block the album"
      : "Don't autoplay this song";

  // plays-next mode shown by the first button
  const modeLabel = repeatOne
    ? "repeat this song"
    : contextKind === "album"
      ? "this album"
      : contextKind === "playlist"
        ? "playlist"
        : contextKind === "station"
          ? "radio mix"
          : "queue";
  const modeIconSize = 26;
  // one repeat icon for all modes: grey = radio/queue, accent = album,
  // accent + "1" = repeating this song
  const modeIcon = (
    <svg width={modeIconSize} height={modeIconSize} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {repeatOne ? (
        <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z" />
      ) : (
        <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
      )}
    </svg>
  );

  return (
    <div className="relative">
      <button
        onClick={(e) => (menuOpen ? setMenuOpen(false) : openMenu(e))}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="btn-icon"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
        </svg>
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
          <div
            role="menu"
            className={`card absolute z-50 flex w-fit flex-col gap-0.5 p-2 text-sm ${
              `${openUp ? "bottom-full mb-2" : "top-full mt-2"} ${anchorLeft ? "left-0" : "right-0"}`
            }`}
          >
            {!showPlaylists ? (
              <div className="flex items-center gap-1" role="toolbar" aria-label="Track actions">
                {/* plays-next mode: cycles contextual queue → album → repeat */}
                <button
                  role="menuitem"
                  aria-label={`Plays next: ${modeLabel}. Tap to change`}
                  title={`Plays next: ${modeLabel} — tap to change`}
                  onClick={() => {
                    const s = usePlayer.getState();
                    if (s.repeatOne) {
                      s.setRepeatOne(false);
                      if (s.contextKind === "album") {
                        // full cycle: queue → album → repeat → back to the mix
                        s.regenerateStation();
                        notify("Back to the radio mix");
                      } else {
                        notify("Resuming the queue");
                      }
                    } else if (s.contextKind === "album" || !track.albumId) {
                      s.setRepeatOne(true);
                      notify("Repeating this song");
                    } else {
                      s.setRepeatOne(false);
                      void s.switchToAlbum();
                      notify("Playing this album");
                    }
                  }}
                  className={`flex h-11 w-11 items-center justify-center rounded-lg transition hover:bg-surface-2 ${
                    repeatOne || contextKind === "album"
                      ? "text-accent"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {modeIcon}
                </button>

                {/* thumbs down: none → song → song+album → none */}
                <button
                  role="menuitem"
                  aria-label={thumbLabel}
                  title={thumbLabel}
                  onClick={cycleThumb}
                  className={`flex h-11 w-11 items-center justify-center rounded-lg transition hover:bg-surface-2 ${
                    muteState.albumMuted || muteState.songMuted
                      ? "text-accent"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {/* always an outline thumb; a second, offset outline
                      appears when the album is blocked too */}
                  <svg
                    width={muteState.albumMuted ? 32 : 26}
                    height={muteState.albumMuted ? 32 : 26}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path
                      d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"
                      transform={muteState.albumMuted ? "translate(-0.5 3) scale(0.75)" : undefined}
                      opacity={muteState.albumMuted ? 0.55 : 1}
                    />
                    {muteState.albumMuted && (
                      <path
                        d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"
                        transform="translate(6 0.5) scale(0.8)"
                      />
                    )}
                  </svg>
                </button>
                {/* share */}
                <button
                  role="menuitem"
                  aria-label="Share"
                  title="Share"
                  onClick={share}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2.6 16.5 7l-1.4 1.4L13 6.3V15h-2V6.3L8.9 8.4 7.5 7 12 2.6z" />
                    <path d="M6 11h2v8h8v-8h2v8c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2v-8z" />
                  </svg>
                </button>

                {/* add to playlist */}
                <button
                  role="menuitem"
                  aria-label="Add to playlist"
                  title="Add to playlist"
                  onClick={() => setShowPlaylists(true)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M3 4h12v2H3V4zm0 5h12v2H3V9zm0 5h7v2H3v-2zm13-7h2v14h-2V7zm-4 6h10v2H12z" />
                  </svg>
                </button>

              </div>
            ) : (
              <div className="flex w-60 flex-col">
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
          </div>
        </>
      )}

      {notice && (
        <div className="pointer-events-none fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[70] -translate-x-1/2">
          <div className="card px-3 py-1.5 text-xs">{notice}</div>
        </div>
      )}
    </div>
  );
}
