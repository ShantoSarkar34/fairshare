import type { ActivityAction, ActivityItem } from "@/lib/activities/types";
import {
  formatExpenseDate,
  SPLIT_TYPE_LABELS,
} from "@/lib/expenses/display";
import type { ExpenseSplitType } from "@/lib/expenses/types";
import { formatPoisha, parseMoneyToPoisha } from "@/lib/money";
import { SETTLEMENT_METHOD_LABELS } from "@/lib/settlements/display";
import type { SettlementMethod } from "@/lib/settlements/types";

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Pre-formatted on the server so client rendering never shifts time zones. */
export function formatActivityDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateTimeFormat.format(date);
}

export type ActivityDetail = {
  label: string;
  value: string;
};

export type ActivityChange = {
  label: string;
  before: string;
  after: string;
};

export type ActivityPresentation = {
  actionText: string;
  entityLabel: string | null;
  details: ActivityDetail[];
  changes: ActivityChange[];
};

type ParticipantSnapshot = {
  userId: string | null;
  name: string | null;
  shareAmount: string | null;
  splitValue: number | null;
};

type ExpenseSnapshot = {
  description: string | null;
  amount: string | null;
  expenseDate: string | null;
  paidById: string | null;
  paidByName: string | null;
  splitType: string | null;
  participants: ParticipantSnapshot[];
};

const ACTION_TEXT: Record<ActivityAction, string> = {
  GROUP_CREATED: "created the group",
  MEMBER_JOINED: "joined the group",
  MEMBER_REMOVED: "removed a member",
  MEMBER_LEFT: "left the group",
  INVITE_CREATED: "created an invitation link",
  INVITE_REGENERATED: "regenerated the invitation link",
  INVITE_ACCEPTED: "accepted an invitation and joined the group",
  EXPENSE_CREATED: "created an expense",
  EXPENSE_UPDATED: "updated an expense",
  EXPENSE_DELETED: "deleted an expense",
  SETTLEMENT_RECORDED: "recorded a settlement",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readSnapshot(value: unknown): ExpenseSnapshot | null {
  const snapshot = asRecord(value);
  if (!snapshot) return null;

  const rawParticipants = Array.isArray(snapshot.participants)
    ? snapshot.participants
    : [];

  return {
    description: asString(snapshot.description),
    amount: asString(snapshot.amount),
    expenseDate: asString(snapshot.expenseDate),
    paidById: asString(snapshot.paidById),
    paidByName: asString(snapshot.paidByName),
    splitType: asString(snapshot.splitType),
    participants: rawParticipants.map((entry) => {
      const participant = asRecord(entry);

      return {
        userId: participant ? asString(participant.userId) : null,
        name: participant ? asString(participant.name) : null,
        shareAmount: participant ? asString(participant.shareAmount) : null,
        splitValue: participant ? asNumber(participant.splitValue) : null,
      };
    }),
  };
}

function formatMoney(value: string | null): string | null {
  if (!value) return null;

  try {
    return formatPoisha(parseMoneyToPoisha(value));
  } catch {
    return value;
  }
}

function formatDate(value: string | null): string | null {
  return value ? formatExpenseDate(value) : null;
}

function formatSplitType(value: string | null): string | null {
  if (!value) return null;
  return (
    SPLIT_TYPE_LABELS[value as ExpenseSplitType] ??
    value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
  );
}

function participantKey(snapshot: ExpenseSnapshot): string {
  return JSON.stringify(
    snapshot.participants
      .map((participant) => ({
        userId: participant.userId,
        shareAmount: participant.shareAmount,
        splitValue: participant.splitValue,
      }))
      .sort((a, b) => (a.userId ?? "").localeCompare(b.userId ?? "")),
  );
}

function formatParticipants(snapshot: ExpenseSnapshot): string | null {
  if (snapshot.participants.length === 0) return null;

  return snapshot.participants
    .map((participant) => {
      const name =
        participant.name ?? participant.userId ?? "Unknown participant";
      const amount = formatMoney(participant.shareAmount);
      return amount ? `${name} ${amount}` : name;
    })
    .join(", ");
}

function addChange(
  changes: ActivityChange[],
  label: string,
  before: string | null,
  after: string | null,
) {
  if (before === null && after === null) return;

  const beforeValue = before ?? "—";
  const afterValue = after ?? "—";

  if (beforeValue !== afterValue) {
    changes.push({ label, before: beforeValue, after: afterValue });
  }
}

function expenseChanges(
  before: ExpenseSnapshot,
  after: ExpenseSnapshot,
): ActivityChange[] {
  const changes: ActivityChange[] = [];

  addChange(changes, "Description", before.description, after.description);
  addChange(
    changes,
    "Amount",
    formatMoney(before.amount),
    formatMoney(after.amount),
  );
  addChange(
    changes,
    "Date",
    formatDate(before.expenseDate),
    formatDate(after.expenseDate),
  );
  addChange(
    changes,
    "Paid by",
    before.paidByName ?? before.paidById,
    after.paidByName ?? after.paidById,
  );
  addChange(
    changes,
    "Split",
    formatSplitType(before.splitType),
    formatSplitType(after.splitType),
  );

  if (participantKey(before) !== participantKey(after)) {
    addChange(
      changes,
      "Allocations",
      formatParticipants(before),
      formatParticipants(after),
    );
  }

  return changes;
}

function expenseDetails(snapshot: ExpenseSnapshot | null): ActivityDetail[] {
  if (!snapshot) return [];

  const details: ActivityDetail[] = [];
  const amount = formatMoney(snapshot.amount);
  const paidBy = snapshot.paidByName ?? snapshot.paidById;
  const splitType = formatSplitType(snapshot.splitType);

  if (amount) details.push({ label: "Amount", value: amount });
  if (paidBy) details.push({ label: "Paid by", value: paidBy });
  if (splitType) details.push({ label: "Split", value: splitType });

  return details;
}

/**
 * Converts one stored activity into safe display text. Unknown or malformed
 * metadata falls back to a generic sentence instead of throwing.
 */
export function presentActivity(item: ActivityItem): ActivityPresentation {
  const metadata = asRecord(item.metadata);
  const actionText = ACTION_TEXT[item.action] ?? "updated the group";
  const details: ActivityDetail[] = [];
  let entityLabel: string | null = null;
  let changes: ActivityChange[] = [];

  switch (item.action) {
    case "GROUP_CREATED":
      entityLabel = metadata ? asString(metadata.name) : null;
      break;

    // For joins and departures the actor is the member, so repeating their
    // name as an entity label would read like "Nusrat joined: Nusrat".
    case "MEMBER_JOINED":
    case "MEMBER_LEFT":
    case "INVITE_ACCEPTED":
      break;

    case "MEMBER_REMOVED":
      entityLabel = metadata ? asString(metadata.name) : null;
      break;

    case "INVITE_CREATED":
    case "INVITE_REGENERATED": {
      const expiresAt = metadata ? asString(metadata.expiresAt) : null;

      if (expiresAt) {
        const date = new Date(expiresAt);
        if (!Number.isNaN(date.getTime())) {
          details.push({
            label: "Expires",
            value: new Intl.DateTimeFormat("en-GB", {
              dateStyle: "medium",
              timeZone: "UTC",
            }).format(date),
          });
        }
      }
      break;
    }

    case "EXPENSE_CREATED":
    case "EXPENSE_DELETED": {
      const snapshot = readSnapshot(metadata?.expense);
      entityLabel = snapshot?.description ?? null;
      details.push(...expenseDetails(snapshot));
      break;
    }

    case "EXPENSE_UPDATED": {
      const before = readSnapshot(metadata?.before);
      const after = readSnapshot(metadata?.after);
      entityLabel = after?.description ?? before?.description ?? null;

      if (before && after) {
        changes = expenseChanges(before, after);
      }
      break;
    }

    case "SETTLEMENT_RECORDED": {
      const fromName = metadata ? asString(metadata.fromName) : null;
      const toName = metadata ? asString(metadata.toName) : null;
      const amount = formatMoney(metadata ? asString(metadata.amount) : null);
      const method = metadata ? asString(metadata.method) : null;
      const reference = metadata
        ? asString(metadata.transactionReference)
        : null;
      const note = metadata ? asString(metadata.note) : null;

      entityLabel =
        fromName && toName ? `${fromName} → ${toName}` : null;

      if (amount) details.push({ label: "Amount", value: amount });
      if (method) {
        details.push({
          label: "Method",
          value:
            SETTLEMENT_METHOD_LABELS[method as SettlementMethod] ?? method,
        });
      }
      if (reference) {
        details.push({ label: "Reference", value: reference });
      }
      if (note) details.push({ label: "Note", value: note });
      break;
    }
  }

  return { actionText, entityLabel, details, changes };
}
