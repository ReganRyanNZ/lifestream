import { NextRequest, NextResponse } from "next/server";
import { getTracksByIdsOrdered, shuffledTrackIds, type ShuffleScope } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("scope") ?? "all";
  const id = sp.get("id") ?? "";

  let scope: ShuffleScope = { kind: "all" };
  if (
    (kind === "user" || kind === "album" || kind === "playlist" || kind === "liked") &&
    /^[0-9a-f-]{36}$/.test(id)
  ) {
    scope = { kind, id } as ShuffleScope;
  }

  const ids = await shuffledTrackIds(scope, 80);
  const tracks = await getTracksByIdsOrdered(ids);
  return NextResponse.json({ tracks });
}
