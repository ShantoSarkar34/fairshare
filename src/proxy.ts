import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// This is only a convenience redirect. It checks that a session cookie
// EXISTS, not that it is valid. Real authorization always happens on the
// server (requireUser + group membership checks), never here.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/groups/:path*", "/settings/:path*"],
};