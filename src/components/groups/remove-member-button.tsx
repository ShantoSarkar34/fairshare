"use client";

import { UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { removeMemberAction } from "@/app/(dashboard)/groups/[groupId]/actions";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

export function RemoveMemberButton({
  groupId,
  userId,
  name,
}: {
  groupId: string;
  userId: string;
  name: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      const result = await removeMemberAction({ groupId, userId });
      if (result.ok) {
        toast.success(`${name} was removed from the group`);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPending(false);
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${name}`}
        onClick={() => setOpen(true)}
      >
        <UserMinus className="size-4" />
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Remove ${name}?`}
        description={
          <>
            {name} will lose access to this group. Their past expenses and
            activity stay in the history. You can invite them again later.
          </>
        }
        confirmLabel="Remove member"
        pending={pending}
        onConfirm={handleConfirm}
      />
    </>
  );
}
