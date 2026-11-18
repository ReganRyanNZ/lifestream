"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleLike } from "@/app/actions";
import { probeAuthed, recordPreference } from "@/components/player-store";

export function LikeButton({
  trackId,
  initialLiked,
  authed,
  compact = false,
}: {
  trackId: string;
  initialLiked: boolean;
  authed: boolean;
  compact?: boolean;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // synchronous double-click guard — `pending` can't cover the async probe
  const busy = useRef(false);

  async function onClick() {
    if (busy.current || pending) return;
    busy.current = true;
    try {
      if (!authed) {
        // the page render may be stale (SW-cached or back-forward) — check the
        // real session before bouncing a signed-in user to the login screen
        const reallyAuthed = await probeAuthed();
        if (!reallyAuthed) {
          router.push("/login");
          return;
        }
      }
      setLiked(!liked); // optimistic
      startTransition(async () => {
        try {
          const r = await toggleLike(trackId);
          setLiked(r.liked);
          // likes also boost the song in this listener's radio mixes
          recordPreference(trackId, r.liked ? "like" : "unlike");
        } catch {
          setLiked(liked); // revert
        }
      });
    } finally {
      busy.current = false;
    }
  }

  return (
    <button
      onClick={onClick}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      title={authed ? undefined : "Sign in to like"}
      className={`shrink-0 transition hover:scale-110 ${
        liked ? "text-rose-400" : "text-muted hover:text-foreground"
      } ${compact ? "p-1.5" : "btn btn-ghost"}`}
    >
      <svg
        width={compact ? 24 : 16}
        height={compact ? 24 : 16}
        viewBox="0 0 24 24"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M12 21C7 16.5 3.5 13.2 3.5 9.3 3.5 6.4 5.7 4.2 8.5 4.2c1.4 0 2.7.6 3.5 1.6.8-1 2.1-1.6 3.5-1.6 2.8 0 5 2.2 5 5.1 0 3.9-3.5 7.2-8.5 11.7z" />
      </svg>
      {!compact && <span>{liked ? "Liked" : "Like"}</span>}
    </button>
  );
}
