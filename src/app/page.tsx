import { ArrowDownLeft, ArrowUpRight, Receipt } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Receipt className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-none">FairShare</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Split expenses. Settle fairly.
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <ArrowUpRight className="size-4 text-destructive" />
              You owe
            </CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums text-destructive">
              ৳3,250.00
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <ArrowDownLeft className="size-4 text-success" />
              You are owed
            </CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums text-success">
              ৳5,800.00
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Buttons</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Status badges</h2>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className="border-success/30 bg-success/10 text-success"
          >
            Settled
          </Badge>
          <Badge
            variant="outline"
            className="border-destructive/30 bg-destructive/10 text-destructive"
          >
            Owes
          </Badge>
          <Badge
            variant="outline"
            className="border-warning/30 bg-warning/10 text-warning"
          >
            Pending
          </Badge>
          <Badge
            variant="outline"
            className="border-info/30 bg-info/10 text-info"
          >
            Info
          </Badge>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Loading state</h2>
        <Card>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
