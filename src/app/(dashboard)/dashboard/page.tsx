import type { Metadata } from "next";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // Runs on the server. Redirects to /login if there is no valid session.
  const user = await requireUser();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Brand />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <section>
        <h1 className="text-2xl font-bold">Welcome, {user.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {user.email}. The real dashboard comes in a later phase.
        </p>
      </section>
    </div>
  );
}