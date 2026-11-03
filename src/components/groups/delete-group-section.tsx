"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteGroupAction } from "@/app/(dashboard)/groups/[groupId]/actions";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteGroupSection({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setTyped("");
  }

  async function handleConfirm() {
    setPending(true);
    try {
      const result = await deleteGroupAction({
        groupId,
        confirmName: typed,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Group deleted");
      router.push("/groups");
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>
          Deleting a group permanently removes its members, expenses,
          settlements and activity history. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="size-4" />
          Delete group
        </Button>
      </CardContent>

      <ConfirmDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Delete this group?"
        description={
          <>
            This permanently deletes <strong>{groupName}</strong> and everything
            in it for all members. This cannot be undone.
          </>
        }
        confirmLabel="Delete group"
        confirmDisabled={typed.trim() !== groupName}
        pending={pending}
        onConfirm={handleConfirm}
      >
        <div className="space-y-1.5">
          <Label htmlFor="confirm-group-name">
            Type <strong>{groupName}</strong> to confirm
          </Label>
          <Input
            id="confirm-group-name"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
          />
        </div>
      </ConfirmDialog>
    </Card>
  );
}
