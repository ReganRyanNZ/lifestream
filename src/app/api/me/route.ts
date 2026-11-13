import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

/** Minimal auth probe for client components (e.g. the player bar's like button). */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  return NextResponse.json({
    authed: !!user,
    displayName: user?.displayName ?? null,
    handle: user?.handle ?? null,
  });
}
