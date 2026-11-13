import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTracksByIdsOrdered, shuffledTrackIds, type ShuffleScope } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("scope") ?? "all";
  const id = sp.get("id") ?? "";
  const client = sp.get("client") ?? "";

  let scope: ShuffleScope = { kind: "all" };
  if (
    (kind === "user" || kind === "album" || kind === "playlist" || kind === "liked") &&
    /^[0-9a-f-]{36}$/.test(id)
  ) {
    scope = { kind, id } as ShuffleScope;
  }

  // radio mixes (scope=all) bend toward this listener's taste
  const clientUuid = /^[0-9a-zA-Z-]{10,64}$/.test(client) ? client : undefined;
  const user = await getCurrentUser().catch(() => null);

  const ids = await shuffledTrackIds(scope, 80, clientUuid);
  const tracks = await getTracksByIdsOrdered(ids, user?.id ?? null);
  return NextResponse.json({ tracks });
}
