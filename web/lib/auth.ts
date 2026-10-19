import "server-only";
import { cacheLife } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_HOME, SESSION_COOKIE } from "./roles";
import type { Role, User } from "./types";

/**
 * Loads the signed-in user from the API. Call it inside a <Suspense> boundary.
 * Redirects to /login when there is no session.
 */
export async function getCurrentUser(): Promise<User> {
  "use cache: private";
  cacheLife("minutes");

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  const response = await fetch(`${process.env.API_URL}/api/auth/me`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
  // The cookie is no longer valid (expired, or the account was removed): clear it.
  if (response.status === 401) redirect("/logout");
  if (!response.ok) throw new Error(`Could not load your account (status ${response.status}).`);

  const { user } = (await response.json()) as { user: User };
  return user;
}

/** Like getCurrentUser, but sends users of other roles to their own dashboard. */
export async function requireRole(role: Role): Promise<User> {
  const user = await getCurrentUser();
  if (user.role !== role) redirect(ROLE_HOME[user.role]);
  return user;
}
