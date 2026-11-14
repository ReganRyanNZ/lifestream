"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const DEBOUNCE_MS = 300;
const MIN_LIVE_CHARS = 2;

/**
 * Search that navigates client-side (router) so it never triggers a full
 * page load — playback must keep running while searching. Typing searches
 * live (debounced, replacing the URL so history isn't spammed per keystroke);
 * Enter still submits normally.
 */
export function SearchBox({
  autoFocus = false,
  className = "",
  inputClassName = "input !py-1.5",
}: {
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const lastSearched = useRef("");

  // live search: debounced navigate as the user types
  useEffect(() => {
    const t = q.trim();
    if (t.length < MIN_LIVE_CHARS) return;
    const target = `/search?q=${encodeURIComponent(t)}`;
    if (target === lastSearched.current) return;
    const id = setTimeout(() => {
      lastSearched.current = target;
      router.replace(target);
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [q, router]);

  return (
    <form
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const t = q.trim();
        lastSearched.current = t ? `/search?q=${encodeURIComponent(t)}` : "";
        router.push(t ? `/search?q=${encodeURIComponent(t)}` : "/search");
      }}
    >
      <input
        className={inputClassName}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search songs, artists…"
        aria-label="Search"
        autoFocus={autoFocus}
      />
    </form>
  );
}
