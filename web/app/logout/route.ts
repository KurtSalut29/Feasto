import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/roles";

/** Clears a stale session cookie and returns to the login page. */
export function GET(request: NextRequest) {
  // ?reason=disabled is passed on so the login page can explain why
  const reason = request.nextUrl.searchParams.get("reason") === "disabled" ? "?reason=disabled" : "";
  const response = NextResponse.redirect(new URL(`/login${reason}`, request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
