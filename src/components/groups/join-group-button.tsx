"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { joinGroupAction } from "@/app/join/actions";
import { Button } from "@/components/ui/button";

export function JoinGroupButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleJoin() {
    setPending(true);
    try {
      const result = await joinGroupAction(token);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("You joined the group");
      router.push(`/groups/${result.data.groupId}`);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      className="w-full"
      onClick={handleJoin}
      disabled={pending}
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending ? "Joining..." : "Join group"}
    </Button>
  );
}
