"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteExpenseAction } from "@/app/(dashboard)/groups/[groupId]/expenses/actions";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

export function DeleteExpenseButton({
  groupId,
  expenseId,
  description,
}: {
  groupId: string;
  expenseId: string;
  description: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);

    try {
      const result = await deleteExpenseAction(groupId, expenseId);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Expense deleted");
      setOpen(false);
      router.push(`/groups/${groupId}/expenses`);
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Trash2 />
        Delete
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this expense?"
        description={
          <>
            <strong className="font-medium text-foreground">
              {description}
            </strong>{" "}
            and all of its allocations will be deleted. This cannot be undone.
          </>
        }
        confirmLabel="Delete expense"
        pending={pending}
        onConfirm={handleConfirm}
      />
    </>
  );
}
