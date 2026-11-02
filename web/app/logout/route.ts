import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/roles";

/** Clears a stale session cookie and returns to the login page. */
export function GET(request: NextRequest) {
  // ?reason=disabled or ?reason=password is passed on so the login page can explain why
  const given = request.nextUrl.searchParams.get("reason");
  const reason = given === "disabled" || given === "password" ? `?reason=${given}` : "";
  const response = NextResponse.redirect(new URL(`/login${reason}`, request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
