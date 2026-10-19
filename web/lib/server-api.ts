import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE } from "./roles";

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
  if (response.status === 401) redirect("/logout");
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`Feasto API ${path} failed with status ${response.status}.`);
  return (await response.json()) as T;
}
