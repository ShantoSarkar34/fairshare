import { HandCoins } from "lucide-react";
import { notFound } from "next/navigation";
import { SettlementPanel } from "@/components/settlements/settlement-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { getSettlementOverview } from "@/lib/services/settlement.service";

export async function SettlementSection({ groupId }: { groupId: string }) {
  const result = await getSettlementOverview(groupId).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  return (
    <Card aria-labelledby="settlements-heading">
      <CardHeader>
        <CardTitle id="settlements-heading" className="flex items-center gap-2">
          <HandCoins className="size-5" />
          Settlements
        </CardTitle>
        <CardDescription>
          Suggested payments based on current balances, plus a record of
          payments members have already made.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result.ok ? (
          <SettlementPanel groupId={groupId} data={result.data} />
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {result.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function SettlementSectionSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading settlements">
      <CardHeader>
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="h-4 w-80 max-w-full rounded bg-muted" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-48 rounded-lg bg-muted" />
      </CardContent>
    </Card>
  );
}
