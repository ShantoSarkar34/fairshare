import { FlaskConical } from "lucide-react";
import { notFound } from "next/navigation";
import { BkashSandboxPanel } from "@/components/bkash/bkash-sandbox-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { getBkashSandboxOverview } from "@/lib/services/bkash-payment.service";

export async function BkashSandboxSection({ groupId }: { groupId: string }) {
  const user = await requireUser();
  const result = await getBkashSandboxOverview(groupId, user.id).catch(
    (error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    },
  );

  return (
    <Card aria-labelledby="bkash-sandbox-heading" className="border-dashed">
      <CardHeader>
        <CardTitle
          id="bkash-sandbox-heading"
          className="flex items-center gap-2"
        >
          <FlaskConical className="size-5" />
          bKash Sandbox Checkout — Demo Only
        </CardTitle>
        <CardDescription>
          This is a simulated merchant checkout. No real money is involved, it
          is not a direct transfer to another group member, and a successful
          checkout does not settle group debt or change balances.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result.ok ? (
          <BkashSandboxPanel groupId={groupId} data={result.data} />
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {result.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function BkashSandboxSectionSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading bKash sandbox checkout">
      <CardHeader>
        <div className="h-5 w-64 max-w-full rounded bg-muted" />
        <div className="h-4 w-96 max-w-full rounded bg-muted" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-24 rounded-lg bg-muted" />
        <div className="h-32 rounded-lg bg-muted" />
      </CardContent>
    </Card>
  );
}
