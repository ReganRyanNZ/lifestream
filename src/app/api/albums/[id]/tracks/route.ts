import { NextRequest, NextResponse } from "next/server";
import { getAlbumTracks } from "@/lib/queries";

/** An album's tracks in play order (for the home Albums row). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ tracks: [] });
  }
  const tracks = await getAlbumTracks(id);
  return NextResponse.json({ tracks });
}
