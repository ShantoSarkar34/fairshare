import {
  ArrowRight,
  History,
  Link2,
  Receipt,
  Scale,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Scale,
    title: "Four ways to split",
    text: "Split equally, by exact amounts, by percentage or by shares. Every split is validated on the server before it is saved.",
  },
  {
    icon: ShieldCheck,
    title: "Exact to the paisa",
    text: "Money is stored as whole poisha, never floating-point numbers, so shares always add up to the total.",
  },
  {
    icon: Receipt,
    title: "Balances you can explain",
    text: "See what each person paid, what they owe and which settlements were recorded, expense by expense.",
  },
  {
    icon: Users,
    title: "Suggested settlements",
    text: "FairShare suggests payments that clear every balance. You record them as bKash, cash or bank payments.",
  },
  {
    icon: Link2,
    title: "Invite by link",
    text: "Admins create expiring invite links and can revoke them at any time.",
  },
  {
    icon: History,
    title: "Full activity history",
    text: "See who added, edited or deleted an expense, and when. Edits keep the previous values.",
  },
];

const steps = [
  {
    title: "Create a group",
    text: "Start a group for your flat, friends or trip.",
  },
  { title: "Add expenses", text: "Record who paid and who shared the cost." },
  {
    title: "Split fairly",
    text: "Pick the split type that matches the situation.",
  },
  {
    title: "Settle up",
    text: "Follow the suggested payments and record them.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b bg-card/60">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <nav aria-label="Account" className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "hidden sm:inline-flex",
              )}
            >
              Sign in
            </Link>
            <Link href="/register" className={buttonVariants()}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <Badge variant="outline">
            Shared expenses for flatmates, friends and trips
          </Badge>
          <h1 className="mx-auto mt-4 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Split expenses. Settle fairly.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            FairShare helps flatmates, friends, and travel groups track shared
            expenses, calculate individual balances, and settle debts
            transparently.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className={buttonVariants({ size: "lg" })}>
              Create an account
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/login"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Sign in
            </Link>
          </div>
        </section>

        <section
          aria-labelledby="problem-heading"
          className="border-y bg-card/40"
        >
          <div className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 py-14 sm:px-6 md:grid-cols-2">
            <div className="space-y-3">
              <h2 id="problem-heading" className="text-2xl font-bold">
                Shared costs get messy
              </h2>
              <p className="text-muted-foreground">
                One person buys the groceries, another pays the electricity
                bill, and a trip adds a dozen small payments. Keeping score in a
                chat thread leads to arguments. FairShare keeps one clear record
                that everyone in the group can check.
              </p>
            </div>

            <Card className="w-full text-left">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Dinner</CardTitle>
                  <Badge variant="outline">Example</Badge>
                </div>
                <CardDescription>
                  ৳900.00 paid by Rafi, split equally between Rafi, Nusrat and
                  Karim
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  <li className="flex items-center justify-between py-2">
                    <span>Rafi</span>
                    <span className="font-medium tabular-nums text-success">
                      is owed ৳600.00
                    </span>
                  </li>
                  <li className="flex items-center justify-between py-2">
                    <span>Nusrat</span>
                    <span className="font-medium tabular-nums text-destructive">
                      owes ৳300.00
                    </span>
                  </li>
                  <li className="flex items-center justify-between py-2">
                    <span>Karim</span>
                    <span className="font-medium tabular-nums text-destructive">
                      owes ৳300.00
                    </span>
                  </li>
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  Illustrative example, not real data.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section
          aria-labelledby="features-heading"
          className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6"
        >
          <h2 id="features-heading" className="text-center text-2xl font-bold">
            What FairShare does
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="mt-2">{title}</CardTitle>
                    <CardDescription>{text}</CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how-heading" className="border-y bg-card/40">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
            <h2 id="how-heading" className="text-center text-2xl font-bold">
              How it works
            </h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, index) => (
                <li key={step.title} className="space-y-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="font-medium">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-bold">Ready to stop keeping score?</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Create a group, invite the people you share costs with and see
            exactly who owes what.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/register" className={buttonVariants({ size: "lg" })}>
              Get started
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>FairShare. A web developer internship assessment project.</p>
          <nav aria-label="Footer" className="flex gap-4">
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link href="/register" className="hover:text-foreground">
              Create account
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
