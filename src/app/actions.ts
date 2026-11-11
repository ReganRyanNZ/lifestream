"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { likes, playlistTracks, playlists, tracks, users } from "@/db/schema";
import {
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  slugifyHandle,
  verifyPassword,
} from "@/lib/auth";

// ---------- likes ----------

export async function toggleLike(trackId: string): Promise<{ liked: boolean }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");

  const existing = await db
    .select({ trackId: likes.trackId })
    .from(likes)
    .where(and(eq(likes.userId, user.id), eq(likes.trackId, trackId)))
    .limit(1);

  if (existing[0]) {
    await db.delete(likes).where(and(eq(likes.userId, user.id), eq(likes.trackId, trackId)));
    await db
      .update(tracks)
      .set({ likeCount: sql`greatest(${tracks.likeCount} - 1, 0)` })
      .where(eq(tracks.id, trackId));
    revalidatePath(`/track/${trackId}`);
    return { liked: false };
  }

  await db.insert(likes).values({ userId: user.id, trackId }).onConflictDoNothing();
  await db
    .update(tracks)
    .set({ likeCount: sql`${tracks.likeCount} + 1` })
    .where(eq(tracks.id, trackId));
  revalidatePath(`/track/${trackId}`);
  return { liked: true };
}

// ---------- playlists ----------

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function createPlaylistAction(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim() || "New playlist";
  const rows = await db
    .insert(playlists)
    .values({ userId: user.id, title })
    .returning({ id: playlists.id });
  revalidatePath("/library");
  redirect(`/playlist/${rows[0].id}`);
}

export async function createPlaylistWithTrack(title: string, trackId: string) {
  const user = await requireUser();
  const t = title.trim() || "New playlist";
  const rows = await db
    .insert(playlists)
    .values({ userId: user.id, title: t })
    .returning({ id: playlists.id });
  await db
    .insert(playlistTracks)
    .values({ playlistId: rows[0].id, trackId, position: 0 })
    .onConflictDoNothing();
  revalidatePath("/library");
  return { id: rows[0].id };
}

async function assertPlaylistOwner(playlistId: string, userId: string) {
  const rows = await db
    .select({ userId: playlists.userId })
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .limit(1);
  if (!rows[0] || rows[0].userId !== userId) throw new Error("Not your playlist");
}

export async function addToPlaylist(playlistId: string, trackId: string) {
  const user = await requireUser();
  await assertPlaylistOwner(playlistId, user.id);
  const max = await db
    .select({ m: sql<number>`coalesce(max(${playlistTracks.position}), -1)::int` })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlistId));
  await db
    .insert(playlistTracks)
    .values({ playlistId, trackId, position: (max[0]?.m ?? -1) + 1 })
    .onConflictDoNothing();
  revalidatePath(`/playlist/${playlistId}`);
  return { ok: true };
}

export async function removeFromPlaylist(playlistId: string, trackId: string) {
  const user = await requireUser();
  await assertPlaylistOwner(playlistId, user.id);
  await db
    .delete(playlistTracks)
    .where(
      and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)),
    );
  revalidatePath(`/playlist/${playlistId}`);
  return { ok: true };
}

export async function deletePlaylist(playlistId: string) {
  const user = await requireUser();
  await assertPlaylistOwner(playlistId, user.id);
  await db.delete(playlists).where(eq(playlists.id, playlistId));
  revalidatePath("/library");
  redirect("/library");
}

// ---------- auth ----------

export type AuthState = { error?: string } | null;

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    return { error: "Wrong email or password." };
  }
  await createSession(user.id);
  redirect("/");
}

export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (displayName.length < 1) return { error: "Please enter a name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Please enter a valid email." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) return { error: "That email is already registered. Try logging in." };

  // unique handle from display name
  const base = slugifyHandle(displayName);
  let handle = base;
  for (let i = 2; ; i++) {
    const taken = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, handle))
      .limit(1);
    if (!taken[0]) break;
    handle = `${base}-${i}`;
  }

  const passwordHash = await hashPassword(password);
  const rows = await db
    .insert(users)
    .values({ email, passwordHash, handle, displayName })
    .returning({ id: users.id });

  await createSession(rows[0].id);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

// ---------- profile ----------

export async function updateArtistName(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("artistName") ?? "").trim().slice(0, 80);
  await db
    .update(users)
    .set({ artistName: name || null }) // empty = fall back to their own name
    .where(eq(users.id, user.id));
  revalidatePath("/settings");
  revalidatePath(`/u/${user.handle}`);
}
