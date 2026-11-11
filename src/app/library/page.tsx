import Link from "next/link";
import { redirect } from "next/navigation";
import { TrackList } from "@/components/TrackList";
import { ShuffleButton } from "@/components/PlayButtons";
import { createPlaylistAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { getLikedTracks, getPlaylistsFor } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your library" };

export default async function LibraryPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login");

  const [liked, playlists] = await Promise.all([
    getLikedTracks(user.id),
    getPlaylistsFor(user.id),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Your library</h1>
        <p className="mt-1 text-sm text-muted">
          Signed in as {user.displayName} (@{user.handle}). You stay signed in on this device
          until you log out.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="section-title !mb-0">
            Liked songs {liked.length > 0 && <span className="text-muted">({liked.length})</span>}
          </h2>
          {liked.length > 1 && (
            <ShuffleButton scope={{ kind: "liked", id: user.id }} label="Shuffle liked" />
          )}
        </div>
        <TrackList tracks={liked} authed />
      </section>

      <section>
        <h2 className="section-title">Playlists</h2>
        <div className="flex flex-wrap gap-3">
          {playlists.map((p) => (
            <Link
              key={p.id}
              href={`/playlist/${p.id}`}
              className="card flex items-center gap-3 px-4 py-3 transition hover:border-accent"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-muted" aria-hidden>
                <path d="M3 6h13v2H3V6zm0 5h13v2H3v-2zm0 5h9v2H3v-2zm15-9v8.17a3 3 0 1 0 2 2.83V7h3V5h-5z" />
              </svg>
              <span>
                <span className="block text-sm font-semibold">{p.title}</span>
                <span className="block text-xs text-muted">
                  {p.count} {p.count === 1 ? "song" : "songs"}
                </span>
              </span>
            </Link>
          ))}
        </div>
        <form action={createPlaylistAction} className="mt-4 flex max-w-sm gap-2">
          <input className="input" name="title" placeholder="New playlist name…" required />
          <button type="submit" className="btn btn-primary shrink-0">
            Create
          </button>
        </form>
      </section>
    </div>
  );
}
