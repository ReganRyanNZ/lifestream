import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRecentlyPlayed } from "@/lib/queries";

/** Recently-played for this listener — device clientUuid and/or signed-in account. */
export async function GET(req: NextRequest) {
  const clientUuid = req.nextUrl.searchParams.get("client") ?? "";
  if (!/^[0-9a-zA-Z-]{10,64}$/.test(clientUuid)) {
    return NextResponse.json({ tracks: [] });
  }
  const user = await getCurrentUser().catch(() => null);
  const tracks = await getRecentlyPlayed(user?.id ?? null, clientUuid, 12);
  return NextResponse.json({ tracks });
}
