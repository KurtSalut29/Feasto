import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/roles";

/** Clears a stale session cookie and returns to the login page. */
export function GET(request: NextRequest) {
  // ?reason=disabled or ?reason=password is passed on so the login page can explain why
  const given = request.nextUrl.searchParams.get("reason");
  const reason = given === "disabled" || given === "password" ? `?reason=${given}` : "";
  // A relative address: behind Caddy or a tunnel, request.url is the server's own 0.0.0.0:3000
  const response = new NextResponse(null, { status: 307, headers: { Location: `/login${reason}` } });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
