"use client";

import { useState, useTransition } from "react";
import { addToPlaylist, createPlaylistWithTrack } from "@/app/actions";

export function AddToPlaylist({
  trackId,
  playlists,
}: {
  trackId: string;
  playlists: { id: string; title: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-ghost">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M3 6h13v2H3V6zm0 5h13v2H3v-2zm0 5h9v2H3v-2zm15-6v4h-2v-4h-4V8h4V4h2v4h4v2h-4z" />
        </svg>
        Add to playlist
      </button>
    );
  }

  return (
    <div className="card w-full max-w-xs p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">Add to playlist</span>
        <button onClick={() => setOpen(false)} aria-label="Close" className="btn-icon">
          ✕
        </button>
      </div>
      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {playlists.length === 0 && (
          <p className="px-1 py-1 text-xs text-muted">No playlists yet — create one below.</p>
        )}
        {playlists.map((p) => (
          <button
            key={p.id}
            onClick={() =>
              startTransition(async () => {
                await addToPlaylist(p.id, trackId);
                setDone(p.title);
                setOpen(false);
              })
            }
            className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
          >
            {p.title}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await createPlaylistWithTrack(newTitle, trackId);
            setDone(r ? newTitle || "New playlist" : null);
            setOpen(false);
          });
        }}
      >
        <input
          className="input"
          placeholder="New playlist…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button type="submit" className="btn btn-primary shrink-0">
          Create
        </button>
      </form>
      {done && <p className="mt-2 text-xs text-accent">Added to “{done}”.</p>}
    </div>
  );
}
