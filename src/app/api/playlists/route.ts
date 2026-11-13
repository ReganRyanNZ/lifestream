import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPlaylistsFor } from "@/lib/queries";

/** The signed-in listener's playlists (for the player-bar menu). */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ playlists: [] });
  const playlists = await getPlaylistsFor(user.id);
  return NextResponse.json({ playlists });
}
