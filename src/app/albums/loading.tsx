export default function AlbumsLoading() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <div className="h-8 w-44 animate-pulse rounded bg-surface-2" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded bg-surface-2" />
      </div>
      {[0, 1, 2].map((s) => (
        <section key={s} className="flex flex-col gap-4">
          <div className="h-6 w-36 animate-pulse rounded bg-surface-2" />
          <div className="cover-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div
                  className="w-full animate-pulse rounded-lg bg-surface-2"
                  style={{ aspectRatio: "1 / 1" }}
                />
                <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-surface-2" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
