import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { ROLE_HOME, SESSION_COOKIE } from "@/lib/roles";
import type { Role } from "@/lib/types";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

/** Reads the role from the session cookie, or null if there is no valid session. */
async function sessionRole(request: NextRequest): Promise<Role | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return payload.role as Role;
  } catch {
    return null;
  }
}

/**
 * Sends each visitor to the right place before the page renders:
 * logged-out users to /login, and logged-in users to their own role's area.
 * The API still checks every request itself; this only keeps navigation tidy.
 */
export async function proxy(request: NextRequest) {
  const role = await sessionRole(request);
  const { pathname } = request.nextUrl;
  const goTo = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (pathname === "/") return goTo(role ? ROLE_HOME[role] : "/login");

  if (pathname === "/login" || pathname === "/register") {
    return role ? goTo(ROLE_HOME[role]) : NextResponse.next();
  }

  if (!role) return goTo("/login");

  const area = (Object.keys(ROLE_HOME) as Role[]).find(
    (r) => pathname === ROLE_HOME[r] || pathname.startsWith(`${ROLE_HOME[r]}/`),
  );
  if (area && area !== role) return goTo(ROLE_HOME[role]);

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/register", "/resident/:path*", "/rider/:path*", "/vendor/:path*", "/admin/:path*"],
};
