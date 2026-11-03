"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  createExpenseAction,
  updateExpenseAction,
} from "@/app/(dashboard)/groups/[groupId]/expenses/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldErrors } from "@/lib/actions/result";
import { SPLIT_TYPE_LABELS } from "@/lib/expenses/display";
import {
  EXPENSE_DESCRIPTION_MAX,
  type ExpenseFormInitialValues,
  type ExpenseMember,
  type ExpenseSplitType,
} from "@/lib/expenses/types";
import { formatPoisha, parseMoneyToPoisha } from "@/lib/money";
import {
  formatBasisPointsAsPercent,
  parsePercentageToBasisPoints,
} from "@/lib/percentage";
import {
  splitEqual,
  splitExact,
  splitPercentage,
  splitShares,
} from "@/lib/split";

type ExpenseFormProps = {
  groupId: string;
  members: ExpenseMember[];
  currentUserId: string;
  defaultExpenseDate: string;
  mode: "create" | "edit";
  expenseId?: string;
  initialValues?: ExpenseFormInitialValues;
};

type ExpensePayloadBase = {
  description: string;
  amount: string;
  expenseDate: string;
  paidById: string;
};

type ExpensePayload = ExpensePayloadBase &
  (
    | { splitType: "EQUAL"; participants: Array<{ userId: string }> }
    | {
        splitType: "EXACT";
        participants: Array<{ userId: string; amount: string }>;
      }
    | {
        splitType: "PERCENTAGE";
        participants: Array<{ userId: string; percentage: string }>;
      }
    | {
        splitType: "SHARES";
        participants: Array<{ userId: string; shares: number }>;
      }
  );

const SPLIT_TYPES: ExpenseSplitType[] = [
  "EQUAL",
  "EXACT",
  "PERCENTAGE",
  "SHARES",
];

const SPLIT_TYPE_HINTS: Record<ExpenseSplitType, string> = {
  EQUAL: "The total is divided equally, with leftover poisha assigned deterministically.",
  EXACT: "Enter each participant's exact amount. They must add up to the total.",
  PERCENTAGE: "Enter percentages. They must add up to exactly 100%.",
  SHARES: "Enter positive whole-number shares, for example 2:1:1.",
};

function initialSelectedIds(
  members: ExpenseMember[],
  initialValues?: ExpenseFormInitialValues,
): string[] {
  const activeIds = new Set(members.map((member) => member.userId));

  if (!initialValues) {
    return members.map((member) => member.userId);
  }

  return initialValues.participants
    .map((participant) => participant.userId)
    .filter((userId) => activeIds.has(userId));
}

function initialPercentageValues(
  initialValues?: ExpenseFormInitialValues,
): Record<string, string> {
  const values: Record<string, string> = {};

  if (!initialValues || initialValues.splitType !== "PERCENTAGE") {
    return values;
  }

  for (const participant of initialValues.participants) {
    if (participant.splitValue !== null) {
      values[participant.userId] = formatBasisPointsAsPercent(
        participant.splitValue,
      );
    }
  }

  return values;
}

function initialShareValues(
  initialValues?: ExpenseFormInitialValues,
): Record<string, string> {
  const values: Record<string, string> = {};

  if (!initialValues || initialValues.splitType !== "SHARES") {
    return values;
  }

  for (const participant of initialValues.participants) {
    if (participant.splitValue !== null) {
      values[participant.userId] = String(participant.splitValue);
    }
  }

  return values;
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;

  return <p className="text-xs text-destructive">{messages[0]}</p>;
}

function formatPercentageTotal(basisPoints: number): string {
  if (basisPoints <= 10_000) {
    return formatBasisPointsAsPercent(basisPoints);
  }

  // Only display can exceed 100%; validation itself uses integer basis points.
  return (basisPoints / 100).toFixed(2).replace(/\.?0+$/, "");
}

export function ExpenseForm({
  groupId,
  members,
  currentUserId,
  defaultExpenseDate,
  mode,
  expenseId,
  initialValues,
}: ExpenseFormProps) {
  const router = useRouter();

  const [description, setDescription] = useState(
    initialValues?.description ?? "",
  );
  const [amount, setAmount] = useState(initialValues?.amount ?? "");
  const [expenseDate, setExpenseDate] = useState(
    initialValues?.expenseDate ?? defaultExpenseDate,
  );
  const [paidById, setPaidById] = useState(() => {
    if (
      initialValues &&
      members.some((member) => member.userId === initialValues.paidById)
    ) {
      return initialValues.paidById;
    }

    if (members.some((member) => member.userId === currentUserId)) {
      return currentUserId;
    }

    return members[0]?.userId ?? "";
  });
  const [splitType, setSplitType] = useState<ExpenseSplitType>(
    initialValues?.splitType ?? "EQUAL",
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    initialSelectedIds(members, initialValues),
  );

  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>(
    () => {
      const values: Record<string, string> = {};

      if (initialValues?.splitType === "EXACT") {
        for (const participant of initialValues.participants) {
          values[participant.userId] = participant.shareAmount;
        }
      }

      return values;
    },
  );
  const [percentages, setPercentages] = useState<Record<string, string>>(() =>
    initialPercentageValues(initialValues),
  );
  const [shares, setShares] = useState<Record<string, string>>(() =>
    initialShareValues(initialValues),
  );

  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  const selectedMembers = useMemo(
    () => members.filter((member) => selectedIds.includes(member.userId)),
    [members, selectedIds],
  );

  const totalPoisha = useMemo(() => {
    try {
      const parsed = parseMoneyToPoisha(amount);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [amount]);

  const preview = useMemo<{
    error: string | null;
    allocations: Map<string, bigint>;
  }>(() => {
    const empty = new Map<string, bigint>();

    try {
      if (selectedMembers.length === 0) {
        throw new Error("Select at least one participant.");
      }

      if (totalPoisha === null) {
        throw new Error("Enter a total amount greater than zero.");
      }

      let allocations;

      switch (splitType) {
        case "EQUAL":
          allocations = splitEqual(
            totalPoisha,
            selectedMembers.map((member) => member.userId),
          );
          break;
        case "EXACT": {
          const entries = selectedMembers.map((member) => {
            const raw = exactAmounts[member.userId]?.trim() ?? "";

            if (!raw) {
              throw new Error(`Enter ${member.name}'s exact amount.`);
            }

            const value = parseMoneyToPoisha(raw);
            if (value <= 0n) {
              throw new Error(
                `${member.name}'s amount must be greater than zero.`,
              );
            }

            return { userId: member.userId, amount: value };
          });

          const allocated = entries.reduce(
            (sum, entry) => sum + entry.amount,
            0n,
          );

          if (allocated !== totalPoisha) {
            throw new Error("Exact amounts must add up to the total amount.");
          }

          allocations = splitExact(totalPoisha, entries);
          break;
        }
        case "PERCENTAGE": {
          const entries = selectedMembers.map((member) => {
            const raw = percentages[member.userId]?.trim() ?? "";

            if (!raw) {
              throw new Error(`Enter ${member.name}'s percentage.`);
            }

            return {
              userId: member.userId,
              basisPoints: parsePercentageToBasisPoints(raw),
            };
          });

          const basisPoints = entries.reduce(
            (sum, entry) => sum + entry.basisPoints,
            0,
          );

          if (basisPoints !== 10_000) {
            throw new Error("Percentages must add up to exactly 100%.");
          }

          allocations = splitPercentage(totalPoisha, entries);
          break;
        }
        case "SHARES": {
          const entries = selectedMembers.map((member) => {
            const raw = shares[member.userId]?.trim() ?? "";

            if (!/^\d+$/.test(raw)) {
              throw new Error(
                `Enter a positive whole-number share count for ${member.name}.`,
              );
            }

            const value = Number(raw);

            if (
              !Number.isSafeInteger(value) ||
              value <= 0 ||
              value > 2_147_483_647
            ) {
              throw new Error(
                `Enter a valid positive share count for ${member.name}.`,
              );
            }

            return { userId: member.userId, shares: value };
          });

          allocations = splitShares(totalPoisha, entries);
          break;
        }
      }

      return {
        error: null,
        allocations: new Map(
          allocations.map((allocation) => [
            allocation.userId,
            allocation.amount,
          ]),
        ),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Invalid split.",
        allocations: empty,
      };
    }
  }, [
    exactAmounts,
    percentages,
    selectedMembers,
    shares,
    splitType,
    totalPoisha,
  ]);

  const percentageTotal = useMemo(() => {
    let total = 0;

    for (const member of selectedMembers) {
      const raw = percentages[member.userId]?.trim() ?? "";
      if (!raw) return null;

      try {
        total += parsePercentageToBasisPoints(raw);
      } catch {
        return null;
      }
    }

    return total;
  }, [percentages, selectedMembers]);

  const exactAllocated = useMemo(() => {
    let total = 0n;

    for (const member of selectedMembers) {
      const raw = exactAmounts[member.userId]?.trim() ?? "";
      if (!raw) return null;

      try {
        total += parseMoneyToPoisha(raw);
      } catch {
        return null;
      }
    }

    return total;
  }, [exactAmounts, selectedMembers]);

  const missingInitialParticipants = useMemo(() => {
    if (!initialValues) return 0;

    const activeIds = new Set(members.map((member) => member.userId));
    return initialValues.participants.filter(
      (participant) => !activeIds.has(participant.userId),
    ).length;
  }, [initialValues, members]);

  const missingInitialPayer =
    initialValues !== undefined &&
    !members.some((member) => member.userId === initialValues.paidById);

  function toggleParticipant(userId: string) {
    setSelectedIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );

    if (splitType === "SHARES") {
      setShares((current) => ({
        ...current,
        [userId]: current[userId] ?? "1",
      }));
    }
  }

  function handleSplitTypeChange(nextType: ExpenseSplitType) {
    setSplitType(nextType);

    if (nextType === "SHARES") {
      setShares((current) => {
        const next = { ...current };

        for (const userId of selectedIds) {
          next[userId] = next[userId] ?? "1";
        }

        return next;
      });
    }
  }

  function buildPayload(): ExpensePayload {
    const base: ExpensePayloadBase = {
      description: description.trim(),
      amount,
      expenseDate,
      paidById,
    };

    switch (splitType) {
      case "EQUAL":
        return {
          ...base,
          splitType,
          participants: selectedMembers.map((member) => ({
            userId: member.userId,
          })),
        };
      case "EXACT":
        return {
          ...base,
          splitType,
          participants: selectedMembers.map((member) => ({
            userId: member.userId,
            amount: exactAmounts[member.userId] ?? "",
          })),
        };
      case "PERCENTAGE":
        return {
          ...base,
          splitType,
          participants: selectedMembers.map((member) => ({
            userId: member.userId,
            percentage: percentages[member.userId] ?? "",
          })),
        };
      case "SHARES":
        return {
          ...base,
          splitType,
          participants: selectedMembers.map((member) => ({
            userId: member.userId,
            shares: Number(shares[member.userId] ?? ""),
          })),
        };
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: FieldErrors = {};
    const trimmedDescription = description.trim();

    if (!trimmedDescription) {
      nextErrors.description = ["Description is required"];
    } else if (trimmedDescription.length > EXPENSE_DESCRIPTION_MAX) {
      nextErrors.description = [
        `Description must be ${EXPENSE_DESCRIPTION_MAX} characters or fewer`,
      ];
    }

    if (totalPoisha === null) {
      nextErrors.amount = ["Enter an amount greater than zero"];
    }

    if (!expenseDate) {
      nextErrors.expenseDate = ["Expense date is required"];
    }

    if (!members.some((member) => member.userId === paidById)) {
      nextErrors.paidById = ["Select a payer who is a group member"];
    }

    if (selectedIds.length === 0) {
      nextErrors.participants = ["Select at least one participant"];
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setServerError("Please fix the highlighted fields.");
      return;
    }

    if (preview.error) {
      setServerError(preview.error);
      return;
    }

    setServerError(null);
    setPending(true);

    try {
      const payload = buildPayload();
      const result =
        mode === "edit" && expenseId
          ? await updateExpenseAction(groupId, expenseId, payload)
          : await createExpenseAction(groupId, payload);

      if (!result.ok) {
        setServerError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      toast.success(
        mode === "edit" ? "Expense updated" : "Expense created",
      );

      router.push(`/groups/${groupId}/expenses/${result.data.expenseId}`);
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
      setServerError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const cancelHref =
    mode === "edit" && expenseId
      ? `/groups/${groupId}/expenses/${expenseId}`
      : `/groups/${groupId}/expenses`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {(missingInitialParticipants > 0 || missingInitialPayer) && (
        <div
          role="status"
          className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground"
        >
          {missingInitialPayer
            ? "The original payer is no longer an active group member. Choose a new payer before saving. "
            : ""}
          {missingInitialParticipants > 0
            ? `${missingInitialParticipants} participant${
                missingInitialParticipants === 1 ? " was" : "s were"
              } removed because they are no longer active group members.`
            : ""}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Expense details</CardTitle>
          <CardDescription>
            Who paid, how much, and when it happened.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="expense-description">Description</Label>
            <Input
              id="expense-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={EXPENSE_DESCRIPTION_MAX}
              placeholder="Dinner at Dhanmondi"
              aria-invalid={Boolean(fieldErrors.description)}
              disabled={pending}
            />
            <FieldError messages={fieldErrors.description} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expense-amount">Total amount (৳)</Label>
              <Input
                id="expense-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="1200.00"
                aria-invalid={Boolean(fieldErrors.amount)}
                disabled={pending}
              />
              <FieldError messages={fieldErrors.amount} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-date">Expense date</Label>
              <Input
                id="expense-date"
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
                aria-invalid={Boolean(fieldErrors.expenseDate)}
                disabled={pending}
              />
              <FieldError messages={fieldErrors.expenseDate} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-payer">Payer</Label>
              <select
                id="expense-payer"
                value={paidById}
                onChange={(event) => setPaidById(event.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
                aria-invalid={Boolean(fieldErrors.paidById)}
                disabled={pending}
              >
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                    {member.userId === currentUserId ? " (you)" : ""}
                  </option>
                ))}
              </select>
              <FieldError messages={fieldErrors.paidById} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-split-type">Split type</Label>
              <select
                id="expense-split-type"
                value={splitType}
                onChange={(event) =>
                  handleSplitTypeChange(
                    event.target.value as ExpenseSplitType,
                  )
                }
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
                disabled={pending}
              >
                {SPLIT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {SPLIT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {SPLIT_TYPE_HINTS[splitType]}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Participants</CardTitle>
          <CardDescription>
            {selectedIds.length} of {members.length} active members included.
            The payer does not have to be included.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fieldErrors.participants && (
            <p className="mb-3 text-xs text-destructive">
              {fieldErrors.participants[0]}
            </p>
          )}

          <ul className="divide-y">
            {members.map((member) => {
              const selected = selectedIds.includes(member.userId);

              return (
                <li
                  key={member.userId}
                  className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <label className="flex min-w-0 cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleParticipant(member.userId)}
                      className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                      disabled={pending}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {member.name}
                        {member.userId === currentUserId ? " (you)" : ""}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {member.email}
                      </span>
                    </span>
                  </label>

                  {selected && splitType !== "EQUAL" && (
                    <div className="flex items-center gap-2 sm:w-48">
                      {splitType === "EXACT" && (
                        <>
                          <span className="text-sm text-muted-foreground">
                            ৳
                          </span>
                          <Input
                            value={exactAmounts[member.userId] ?? ""}
                            onChange={(event) =>
                              setExactAmounts((current) => ({
                                ...current,
                                [member.userId]: event.target.value,
                              }))
                            }
                            inputMode="decimal"
                            placeholder="0.00"
                            aria-label={`${member.name} exact amount`}
                            disabled={pending}
                          />
                        </>
                      )}

                      {splitType === "PERCENTAGE" && (
                        <>
                          <Input
                            value={percentages[member.userId] ?? ""}
                            onChange={(event) =>
                              setPercentages((current) => ({
                                ...current,
                                [member.userId]: event.target.value,
                              }))
                            }
                            inputMode="decimal"
                            placeholder="0"
                            aria-label={`${member.name} percentage`}
                            disabled={pending}
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </>
                      )}

                      {splitType === "SHARES" && (
                        <>
                          <Input
                            value={shares[member.userId] ?? ""}
                            onChange={(event) =>
                              setShares((current) => ({
                                ...current,
                                [member.userId]: event.target.value,
                              }))
                            }
                            inputMode="numeric"
                            placeholder="1"
                            aria-label={`${member.name} shares`}
                            disabled={pending}
                          />
                          <span className="text-sm text-muted-foreground">
                            shares
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Split preview</CardTitle>
          <CardDescription>
            Calculated with the same exact poisha algorithms the server uses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {splitType === "PERCENTAGE" && (
            <p
              className={
                percentageTotal === 10_000
                  ? "text-sm font-medium text-success"
                  : "text-sm font-medium text-destructive"
              }
            >
              Total percentage:{" "}
              {percentageTotal === null
                ? "—"
                : `${formatPercentageTotal(percentageTotal)}%`}
            </p>
          )}

          {splitType === "EXACT" && (
            <p
              className={
                exactAllocated !== null && exactAllocated === totalPoisha
                  ? "text-sm font-medium text-success"
                  : "text-sm font-medium text-destructive"
              }
            >
              Allocated:{" "}
              {exactAllocated === null ? "—" : formatPoisha(exactAllocated)}
              {totalPoisha !== null && ` of ${formatPoisha(totalPoisha)}`}
            </p>
          )}

          {preview.error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {preview.error}
            </p>
          ) : (
            <ul className="divide-y">
              {selectedMembers.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <span className="truncate text-sm">{member.name}</span>
                  <span className="shrink-0 font-mono text-sm">
                    {formatPoisha(preview.allocations.get(member.userId) ?? 0n)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {serverError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {serverError}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link
          href={cancelHref}
          className={buttonVariants({ variant: "outline" })}
          aria-disabled={pending}
          tabIndex={pending ? -1 : undefined}
        >
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {mode === "edit" ? "Save changes" : "Create expense"}
        </Button>
      </div>
    </form>
  );
}
