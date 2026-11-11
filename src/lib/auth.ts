import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { and, eq, gt } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import type { SessionUser } from "@/lib/types";

const SESSION_COOKIE = "ls_session";
const SESSION_DAYS = 365;

export function hashPassword(password: string): Promise<string> {
  // argon2id defaults
  return hash(password);
}

export function verifyPassword(hash_: string, password: string): Promise<boolean> {
  return verify(hash_, password);
}

function tokenHashFor(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a DB session and sets the permanent cookie. Call from server actions / route handlers only. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ tokenHash: tokenHashFor(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHashFor(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * Current user or null. Sessions are permanent: the cookie lives 365 days and
 * the DB row's expiry slides forward whenever the user is seen. Cookie refresh
 * only happens on writes (actions/routes) since RSCs can't set cookies.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      handle: users.handle,
      displayName: users.displayName,
      artistName: users.artistName,
      isAdmin: users.isAdmin,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHashFor(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Slide expiry forward if we haven't seen this session in a day.
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  if (row.lastSeenAt.getTime() < dayAgo) {
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), expiresAt })
      .where(eq(sessions.tokenHash, tokenHashFor(token)))
      .catch(() => {});
  }

  return {
    id: row.id,
    email: row.email,
    handle: row.handle,
    displayName: row.displayName,
    artistName: row.artistName,
    isAdmin: row.isAdmin,
  };
});

export function slugifyHandle(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || "user";
}
