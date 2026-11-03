import type { Metadata } from "next";
import { CreateGroupForm } from "@/components/groups/create-group-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New group" };

export default async function NewGroupPage() {
  await requireUser();

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Create a group</CardTitle>
          <CardDescription>
            You will be the group admin. You can invite others after it is
            created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateGroupForm />
        </CardContent>
      </Card>
    </div>
  );
}
