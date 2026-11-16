"use client";

import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePlayer, type PlayContextKind } from "@/components/player-store";
import { PauseIcon, PlayIcon } from "@/components/icons";
import { fmtDuration } from "@/lib/format";
import type { TrackDTO } from "@/lib/types";

/** What the current queue represents — shown as a chip and switchable. */
export const CONTEXT_LABEL: Record<PlayContextKind, string> = {
  station: "Radio mix · all songs",
  album: "Album · in order",
  playlist: "Playlist",
  list: "Queue",
};

/** Rows shown for the live queue (current song + up next) before "+N more". */
const MAX_ROWS = 50;

/** One queue row: the whole row plays (the current song toggles pause). */
export function QueueRow({
  track,
  onPlay,
  current = false,
  numbered,
  trailing,
  style,
}: {
  track: TrackDTO;
  onPlay: () => void;
  /** this row is the currently-playing song (click toggles pause, accent style) */
  current?: boolean;
  /** 1-based position shown to the user (hidden on hover for the play icon) */
  numbered?: number;
  /** rendered at the row's end — the drag handle in the live queue */
  trailing?: ReactNode;
  style?: CSSProperties;
}) {
  const playing = usePlayer((s) => s.playing);
  const isPlaying = current && playing;

  return (
    // the trailing handle renders as a SIBLING of the play button — never
    // inside it (interactive content nested in a button is invalid HTML)
    // when the list has drag handles, the current row keeps the same
    // right-hand slot so durations line up across rows
    <li
      className={trailing || current ? "flex items-center gap-1" : undefined}
      style={style}
    >
      <button
        onClick={onPlay}
        aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        className={`group flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2 ${
          current ? "bg-surface-2" : ""
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/80 transition group-hover:bg-accent group-hover:text-[#06121c]">
          {isPlaying ? (
            <PauseIcon size={14} />
          ) : (
            <>
              {numbered != null && (
                <span className="text-xs tabular-nums text-muted group-hover:hidden">
                  {numbered}
                </span>
              )}
              <PlayIcon size={14} className={numbered != null ? "hidden group-hover:block" : ""} />
            </>
          )}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            current ? "font-semibold text-accent" : ""
          }`}
        >
          {track.title}
        </span>
        <span className="hidden max-w-40 shrink-0 truncate text-xs text-muted sm:inline">
          {track.artist}
        </span>
        <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted">
          {fmtDuration(track.durationSec)}
        </span>
      </button>
      {trailing ?? (current ? <span className="ml-1 w-6 shrink-0" aria-hidden /> : null)}
    </li>
  );
}

/**
 * The live queue: current song + up next. Used by the full-screen Now Playing
 * view and the track page's "Up next". Upcoming rows can be reordered by
 * dragging the handle at their end (or arrow keys on the handle).
 */
type DragState = { k: number; id: string; startY: number; y: number; h: number; pos: number };

// memoized — no props, so parent re-renders (e.g. per-frame sheet-drag
// updates) never re-render the queue list
export const QueuePanel = memo(function QueuePanel() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const contextKind = usePlayer((s) => s.contextKind);
  const [albumBusy, setAlbumBusy] = useState(false);
  const listRef = useRef<HTMLOListElement | null>(null);
  // drag state: k = upcoming index; pos = insert position among the others
  const [drag, setDrag] = useState<DragState | null>(null);
  const rects = useRef<{ top: number; h: number }[]>([]);
  const dragRef = useRef<DragState | null>(null);

  /** insert position among the non-dragged rows, from the pointer's y */
  const insertPosAt = (y: number, dragK: number) => {
    let pos = 0;
    rects.current.forEach((r, i) => {
      if (i !== dragK && y > r.top + r.h / 2) pos++;
    });
    return pos;
  };

  // while a drag is live, track the pointer on the window (no capture needed)
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = { ...d, y: e.clientY, pos: insertPosAt(e.clientY, d.k) };
      dragRef.current = next;
      setDrag(next);
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d || d.pos === d.k) return;
      const s = usePlayer.getState();
      // commit by track id: the queue may have shifted while dragging
      // (track ended, station extended), which would move the wrong row
      const from = s.queue.findIndex((t, i) => i > s.index && t.id === d.id);
      if (from < 0) return;
      s.moveQueueItem(from, s.index + 1 + d.pos);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging]);

  const current = queue[index];
  if (!current) return null;

  /** Swap what comes after the current song: album ↔ radio mix. Playback
   *  of the current song is never interrupted — only the queue behind it. */
  async function switchContext() {
    const s = usePlayer.getState();
    if (s.contextKind === "album") {
      s.regenerateStation();
      return;
    }
    const cur = s.queue[s.index];
    if (!cur?.albumId || albumBusy) return;
    setAlbumBusy(true);
    try {
      const j = (await fetch(`/api/albums/${cur.albumId}/tracks`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { tracks?: TrackDTO[] } | null;
      // switchToQueue keeps the current song playing; only what follows changes
      if (j?.tracks?.length) s.switchToQueue(j.tracks, "album");
    } finally {
      setAlbumBusy(false);
    }
  }

  const upcoming = queue.slice(index + 1, index + 1 + MAX_ROWS);
  const more = queue.length - (index + 1 + upcoming.length);

  function onDragStart(e: React.PointerEvent, k: number) {
    e.preventDefault();
    e.stopPropagation();
    // children[0] is the current song's row; upcoming k is children[k + 1]
    rects.current = upcoming.map((_, i) => {
      const el = listRef.current?.children[i + 1] as HTMLElement | undefined;
      if (!el) return { top: 0, h: 0 };
      const r = el.getBoundingClientRect();
      return { top: r.top, h: r.height };
    });
    const start = {
      k,
      id: upcoming[k]?.id,
      startY: e.clientY,
      y: e.clientY,
      h: rects.current[k]?.h || 44,
      pos: k,
    };
    dragRef.current = start;
    setDrag(start);
  }

  function moveRel(k: number, dir: -1 | 1) {
    const s = usePlayer.getState();
    const from = s.index + 1 + k;
    const to = from + dir;
    if (to > s.index && to < s.queue.length) s.moveQueueItem(from, to);
  }

  // current drag-derived layout
  const pos = drag?.pos ?? -1;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="section-title !mb-0">Up next</h2>
        {contextKind && contextKind !== "list" && (
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
            {CONTEXT_LABEL[contextKind]}
          </span>
        )}
        {/* discreet context swap: what follows the current song, without
            interrupting it */}
        {contextKind === "album" ? (
          <button
            onClick={() => usePlayer.getState().regenerateStation()}
            title="Switch to a radio mix of all songs"
            aria-label="Switch to a radio mix of all songs"
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM17.6 3.3l1.4 1.4-3.5 3.5-1.4-1.4 3.5-3.5zm1.1 16-1.4 1.4-3.5-3.5 1.4-1.4 3.5 3.5z" />
            </svg>
          </button>
        ) : (
          current.albumId && (
            <button
              onClick={switchContext}
              disabled={albumBusy}
              title="Switch to this song's album, in order"
              aria-label="Switch to this song's album, in order"
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
              </svg>
            </button>
          )
        )}
      </div>
      <ol className="flex select-none flex-col gap-0.5" ref={listRef}>
        <QueueRow
          track={current}
          current
          onPlay={() => usePlayer.getState().toggle()}
        />
        {upcoming.map((t, k) => {
          let style: CSSProperties | undefined;
          if (drag) {
            if (k === drag.k) {
              style = {
                transform: `translateY(${drag.y - drag.startY}px)`,
                zIndex: 10,
                position: "relative",
                boxShadow: "0 6px 20px rgb(0 0 0 / 0.35)",
                borderRadius: "0.5rem",
                transition: "box-shadow 0.15s",
              };
            } else {
              const remaining = k > drag.k ? k - 1 : k;
              const final = remaining >= pos ? remaining + 1 : remaining;
              const shift = (final - k) * drag.h;
              style = shift
                ? { transform: `translateY(${shift}px)`, transition: "transform 0.15s" }
                : { transition: "transform 0.15s" };
            }
          }
          return (
            <QueueRow
              key={`${t.id}-${k}`}
              track={t}
              numbered={k + 1}
              style={style}
              onPlay={() => {
                const s = usePlayer.getState();
                s.playQueue(s.queue, index + 1 + k, s.contextKind ?? "list");
              }}
              trailing={
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Reorder ${t.title}`}
                  onPointerDown={(e) => onDragStart(e, k)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      moveRel(k, -1);
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      moveRel(k, 1);
                    }
                  }}
                  className="ml-1 flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted transition hover:text-foreground active:cursor-grabbing"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M4 7h16v2H4V7zm0 8h16v2H4v-2z" />
                  </svg>
                </span>
              }
            />
          );
        })}
      </ol>
      {upcoming.length === 0 && (
        <p className="px-2 py-4 text-sm text-muted">
          End of queue — switch to the radio mix to keep the music going.
        </p>
      )}
      {more > 0 && <p className="px-2 pt-2 text-xs text-muted">+{more} more in the queue</p>}
    </section>
  );
});
