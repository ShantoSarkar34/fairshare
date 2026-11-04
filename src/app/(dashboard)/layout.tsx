import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Brand } from "@/components/layout/brand";
import { MainNav } from "@/components/layout/main-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { requireUser } from "@/lib/auth/session";

// Every dashboard route depends on the authenticated session and request data.
// Opt the whole authenticated shell out of the static prerender shell.
export const instant = false;

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Used for the shell UI only. Layouts are NOT re-run on every client-side
  // navigation, so every page and server action must call requireUser() too.
  const user = await requireUser();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Brand />
            <div className="hidden sm:block">
              <MainNav />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground md:inline">
              {user.name}
            </span>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
        <div className="border-t px-4 py-2 sm:hidden">
          <MainNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
