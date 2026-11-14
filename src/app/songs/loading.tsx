export default function SongsLoading() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-10 w-24 animate-pulse rounded-lg bg-surface-2" />
      </div>
      <div className="flex flex-col gap-8">
        {[0, 1, 2].map((s) => (
          <section key={s} className="flex flex-col gap-3">
            <div className="h-6 w-32 animate-pulse rounded bg-surface-2" />
            {[0, 1, 2, 3, 4, 5].map((r) => (
              <div key={r} className="h-9 w-full animate-pulse rounded-lg bg-surface-2" />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
