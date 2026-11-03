import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

/**
 * Returns the current session or null. Wrapped in React's cache() so one
 * request only hits the database once, even if several components call it.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * For pages and server actions that need a logged-in user.
 * Redirects to /login when there is no valid session.
 */
export async function requireUser() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session.user;
}
