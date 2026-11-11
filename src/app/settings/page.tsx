import Link from "next/link";
import { SettingsClient } from "@/components/SettingsClient";
import { updateArtistName } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser().catch(() => null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted">Artist name, offline storage, installation.</p>
      </div>

      {user ? (
        <section className="card max-w-xl p-4">
          <h2 className="mb-2 font-semibold">Artist name</h2>
          <p className="mb-3 text-sm text-muted">
            The name shown on your songs, albums, and lock screen. Leave it empty to just use
            your own name ({user.displayName}).
          </p>
          <form action={updateArtistName} className="flex gap-2">
            <input
              className="input"
              name="artistName"
              placeholder={user.displayName}
              defaultValue={user.artistName ?? ""}
              maxLength={80}
            />
            <button type="submit" className="btn btn-primary shrink-0">
              Save
            </button>
          </form>
        </section>
      ) : (
        <section className="card max-w-xl p-4 text-sm text-muted">
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>{" "}
          to set an artist name and build playlists.
        </section>
      )}

      <SettingsClient />
    </div>
  );
}
