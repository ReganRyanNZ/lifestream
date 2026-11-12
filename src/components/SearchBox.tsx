"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Search that navigates client-side (router.push) so it never triggers a full
 * page load — playback must keep running while searching.
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

  return (
    <form
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const t = q.trim();
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
