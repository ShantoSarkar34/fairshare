import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinGroupButton } from "@/components/groups/join-group-button";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { previewInvite } from "@/lib/services/invite.service";
import { inviteTokenSchema } from "@/lib/validations/invite";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Join group",
  robots: { index: false },
};

function InvalidInvite() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Invite not valid</CardTitle>
        <CardDescription>
          This invite link is invalid or has expired. Ask a group admin for a
          new one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href="/groups"
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          Go to my groups
        </Link>
      </CardContent>
    </Card>
  );
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Reject malformed tokens before touching the database.
  if (!inviteTokenSchema.safeParse(token).success) {
    return <InvalidInvite />;
  }

  const session = await getSession();
  if (!session) {
    // The token is URL-safe (validated above), so this is a safe path.
    redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
  }

  const preview = await previewInvite(token, session.user.id).catch(
    (error: unknown) => {
      if (error instanceof NotFoundError) return null;
      throw error;
    },
  );

  if (!preview) {
    return <InvalidInvite />;
  }

  if (preview.alreadyMember) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            You are already in this group
          </CardTitle>
          <CardDescription>
            You are a member of {preview.groupName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={`/groups/${preview.groupId}`}
            className={cn(buttonVariants(), "w-full")}
          >
            Open group
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
          <Users className="size-6" />
        </div>
        <CardTitle className="mt-2 text-xl">
          Join {preview.groupName}?
        </CardTitle>
        <CardDescription>
          You have been invited to this group. It currently has{" "}
          {preview.memberCount}{" "}
          {preview.memberCount === 1 ? "member" : "members"}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <JoinGroupButton token={token} />
      </CardContent>
    </Card>
  );
}
