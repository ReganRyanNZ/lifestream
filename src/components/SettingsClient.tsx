"use client";

import { useEffect, useState } from "react";
import { fmtBytes } from "@/lib/format";

const AUDIO_CACHE = "ls-audio-v1";
const PINNED_CACHE = "ls-pinned-v1";

export function SettingsClient() {
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    if (!navigator.storage?.estimate) return;
    const est = await navigator.storage.estimate();
    setUsage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
    if (navigator.storage?.persisted) setPersisted(await navigator.storage.persisted());
  }

  // storage estimate arrives async (setState in a callback, not synchronously
  // in the effect, to avoid cascading renders)
  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((est) => {
        if (est) setUsage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
      })
      .catch(() => {});
    navigator.storage
      ?.persisted?.()
      .then((p) => setPersisted(p))
      .catch(() => {});
  }, []);

  async function requestPersist() {
    if (!navigator.storage?.persist) return;
    const ok = await navigator.storage.persist();
    setPersisted(ok);
    setStatus(
      ok
        ? "Storage is now persistent — the browser won't evict your cached music under disk pressure."
        : "The browser declined persistent storage. Installing the app (Add to Home Screen / Install) usually helps.",
    );
  }

  async function clearCache(name: string, label: string) {
    if (!("caches" in window)) return;
    const ok = await caches.delete(name);
    setStatus(ok ? `${label} cleared.` : `No ${label.toLowerCase()} found.`);
    refresh();
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Offline storage</h2>
        {usage ? (
          <p className="text-sm text-muted">
            {fmtBytes(usage.usage)} used of roughly {fmtBytes(usage.quota)} available on this
            device. Recently played tracks are cached automatically so replays are instant
            and work offline.
          </p>
        ) : (
          <p className="text-sm text-muted">Storage estimate unavailable in this browser.</p>
        )}
        <p className="mt-2 text-sm">
          Persistent storage:{" "}
          {persisted === null ? (
            <span className="text-muted">unknown</span>
          ) : persisted ? (
            <span className="text-emerald-400">enabled</span>
          ) : (
            <span className="text-amber-400">not enabled</span>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={requestPersist} className="btn btn-primary">
            Request persistent storage
          </button>
          <button onClick={() => clearCache(AUDIO_CACHE, "Playback cache")} className="btn btn-ghost">
            Clear playback cache
          </button>
          <button onClick={() => clearCache(PINNED_CACHE, "Pinned downloads")} className="btn btn-ghost">
            Clear pinned downloads
          </button>
        </div>
        {status && <p className="mt-3 text-sm text-accent">{status}</p>}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Install for offline listening</h2>
        <p className="text-sm text-muted">
          <strong>Android/desktop:</strong> use your browser’s “Install app” / “Add to Home
          screen” option. <strong>iPhone/iPad:</strong> Safari → Share → “Add to Home
          Screen”. Installing also protects your cached music from the browser’s periodic
          storage cleanup (especially important on iOS).
        </p>
      </section>
    </div>
  );
}
