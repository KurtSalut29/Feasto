import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE } from "./roles";

/**
 * Where to send a visitor whose cookie the API refused (401): /logout clears it, and the
 * reason lets the login page explain an admin disabling the account or a password change elsewhere.
 */
export async function logoutPath(response: Response) {
  const { error } = (await response.json().catch(() => ({}))) as { error?: string };
  if (error?.includes("disabled")) return "/logout?reason=disabled";
  if (error?.includes("password was changed")) return "/logout?reason=password";
  return "/logout";
}

/**
 * Calls the Feasto API from a Server Component, passing along the visitor's login cookie.
 * Call it inside a <Suspense> boundary, since it reads the request's cookies.
 */
export async function serverApi<T>(path: string): Promise<T> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  const response = await fetch(`${process.env.API_URL}/api${path}`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    cache: "no-store",
  });
  if (response.status === 401) redirect(await logoutPath(response));
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`Feasto API ${path} failed with status ${response.status}.`);
  return (await response.json()) as T;
}
