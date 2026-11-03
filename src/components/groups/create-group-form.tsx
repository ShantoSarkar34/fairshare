"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createGroupAction } from "@/app/(dashboard)/groups/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createGroupSchema,
  type CreateGroupInput,
} from "@/lib/validations/group";

export function CreateGroupForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateGroupInput>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: { name: "", description: "" },
  });

  async function onSubmit(values: CreateGroupInput) {
    setServerError(null);

    try {
      const result = await createGroupAction(values);

      if (!result.ok) {
        setServerError(result.error);
        const nameError = result.fieldErrors?.name?.[0];
        const descriptionError = result.fieldErrors?.description?.[0];
        if (nameError) setError("name", { message: nameError });
        if (descriptionError) {
          setError("description", { message: descriptionError });
        }
        return;
      }

      toast.success("Group created");
      router.push(`/groups/${result.data.groupId}`);
    } catch {
      setServerError("Network error. Check your connection and try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="name">Group name</Label>
        <Input
          id="name"
          placeholder="e.g. Flat 4B, Cox's Bazar Trip"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "name-error" : undefined}
          {...register("name")}
        />
        {errors.name && (
          <p id="name-error" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Input
          id="description"
          placeholder="What is this group for?"
          aria-invalid={!!errors.description}
          aria-describedby={
            errors.description ? "description-error" : undefined
          }
          {...register("description")}
        />
        {errors.description && (
          <p id="description-error" className="text-sm text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        {isSubmitting ? "Creating..." : "Create group"}
      </Button>
    </form>
  );
}
