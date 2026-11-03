import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <section>
      <h1 className="text-2xl font-bold">Welcome, {user.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Balances and recent activity will appear here in a later phase.
      </p>
    </section>
  );
}
