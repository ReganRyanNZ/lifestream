import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/Cover";
import { TrackList } from "@/components/TrackList";
import { PlayAllButton } from "@/components/PlayButtons";
import { getCurrentUser } from "@/lib/auth";
import { getUserAlbums, getUserByHandle, getUserTracks } from "@/lib/queries";
import { colorFor } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  return { title: `@${handle}` };
}

export default async function UserPage({ params }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  const user = await getUserByHandle(handle);
  if (!user) notFound();

  const [viewer, albums, tracks] = await Promise.all([
    getCurrentUser().catch(() => null),
    getUserAlbums(user.id),
    getUserTracks(user.id),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center gap-4">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold"
          style={{ background: colorFor(user.handle) }}
          aria-hidden
        >
          {user.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold sm:text-3xl">
            {user.artistName ?? user.displayName}
          </h1>
          <p className="text-sm text-muted">
            @{user.handle} · {tracks.length} {tracks.length === 1 ? "song" : "songs"}
            {user.artistName && user.artistName !== user.displayName && (
              <> · shared by {user.displayName}</>
            )}
          </p>
        </div>
      </header>

      {albums.length > 0 && (
        <section>
          <h2 className="section-title">Albums</h2>
          <div className="cover-grid">
            {albums
              .filter((a) => a.trackCount > 0)
              .map((a) => (
                <Link key={a.id} href={`/album/${a.id}`} className="group flex flex-col gap-2">
                  <Cover
                    title={a.title}
                    artworkUrl={a.artworkUrl}
                    color={a.color}
                    className="transition group-hover:brightness-110"
                  />
                  <span className="truncate text-sm font-medium group-hover:text-accent">
                    {a.title}
                  </span>
                  <span className="-mt-2 text-xs text-muted">
                    {a.trackCount} {a.trackCount === 1 ? "song" : "songs"}
                  </span>
                </Link>
              ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title !mb-0">All songs</h2>
          {tracks.length > 0 && <PlayAllButton tracks={tracks} />}
        </div>
        <TrackList tracks={tracks} showArtist={false} authed={!!viewer} />
      </section>
    </div>
  );
}
