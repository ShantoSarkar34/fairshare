"use client";

import { Ban, Check, Copy, Link2, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  createInviteAction,
  revokeInvitesAction,
} from "@/app/(dashboard)/groups/[groupId]/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const labelFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export function InvitePanel({
  groupId,
  activeExpiryLabel,
}: {
  groupId: string;
  /** Pre-formatted on the server to avoid timezone hydration mismatches. */
  activeExpiryLabel: string | null;
}) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [expiryLabel, setExpiryLabel] = useState(activeExpiryLabel);
  const [pending, setPending] = useState<"create" | "revoke" | null>(null);
  const [copied, setCopied] = useState(false);

  const hasActive = expiryLabel !== null;

  async function handleCreate() {
    setPending("create");
    try {
      const result = await createInviteAction(groupId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLink(`${window.location.origin}/join/${result.data.token}`);
      setExpiryLabel(labelFormat.format(new Date(result.data.expiresAt)));
      setCopied(false);
      toast.success("Invite link created");
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPending(null);
    }
  }

  async function handleRevoke() {
    setPending("revoke");
    try {
      const result = await revokeInvitesAction(groupId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLink(null);
      setExpiryLabel(null);
      toast.success("Invite link revoked");
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPending(null);
    }
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the link and copy it manually.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4" />
          Invite members
        </CardTitle>
        <CardDescription>
          Anyone with the link can join this group until it expires.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {link && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                readOnly
                value={link}
                aria-label="Invite link"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCopy}
                aria-label="Copy invite link"
              >
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This link is shown only once. Copy it now.
            </p>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          {hasActive
            ? `An invite link is active until ${expiryLabel}. For security it is only displayed when created. Generate a new one to get a fresh link; the old one stops working.`
            : "No active invite link. Create one to invite people. Links expire after 7 days."}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={hasActive ? "outline" : "default"}
            onClick={handleCreate}
            disabled={pending !== null}
          >
            {pending === "create" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : hasActive ? (
              <RefreshCw className="size-4" />
            ) : (
              <Link2 className="size-4" />
            )}
            {hasActive ? "Generate new link" : "Create invite link"}
          </Button>

          {hasActive && (
            <Button
              type="button"
              variant="outline"
              onClick={handleRevoke}
              disabled={pending !== null}
            >
              {pending === "revoke" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Ban className="size-4" />
              )}
              Revoke link
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
