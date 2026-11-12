"use client";

import { useEffect } from "react";

const isDev = process.env.NODE_ENV !== "production";

/**
 * The service worker only runs in production builds. In dev, Next's chunk URLs
 * are not content-hashed, so a cache-first service worker would serve stale
 * JavaScript forever (mismatched hydration, "missing" new features). When we do
 * find a registration in dev (e.g. this browser ran a production build before),
 * unregister it and clear the non-audio caches — audio objects are
 * content-keyed (immutable UUIDs) and stay valid across builds.
 */
export function SWRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (isDev) {
      navigator.serviceWorker
        .getRegistrations()
        .then((rs) => rs.forEach((r) => r.unregister()))
        .catch(() => {});
      caches
        .keys()
        .then((names) =>
          Promise.all(
            names
              .filter((n) => !n.startsWith("ls-audio") && !n.startsWith("ls-pinned"))
              .map((n) => caches.delete(n)),
          ),
        )
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
