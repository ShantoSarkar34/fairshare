export const EXPENSE_DESCRIPTION_MAX = 120;

export type ExpenseSplitType = "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES";

export type ExpenseMember = {
  userId: string;
  name: string;
  email: string;
};

export type ExpenseListItemParticipant = {
  userId: string;
  name: string;
};

export type ExpenseListItem = {
  id: string;
  description: string;
  /** Safe JSON representation of poisha, e.g. "1200.00". */
  amount: string;
  /** YYYY-MM-DD. */
  expenseDate: string;
  splitType: ExpenseSplitType;
  paidBy: { id: string; name: string };
  createdBy: { id: string; name: string };
  participants: ExpenseListItemParticipant[];
  canManage: boolean;
};

export type ExpenseDetailParticipant = {
  userId: string;
  name: string;
  email: string;
  /** Safe JSON representation of poisha, e.g. "400.00". */
  shareAmount: string;
  splitValue: number | null;
};

export type ExpenseDetail = {
  id: string;
  groupId: string;
  groupName: string;
  description: string;
  amount: string;
  expenseDate: string;
  splitType: ExpenseSplitType;
  paidBy: { id: string; name: string; email: string };
  createdBy: { id: string; name: string; email: string };
  participants: ExpenseDetailParticipant[];
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseFormInitialValues = {
  description: string;
  amount: string;
  expenseDate: string;
  paidById: string;
  splitType: ExpenseSplitType;
  participants: Array<{
    userId: string;
    shareAmount: string;
    splitValue: number | null;
  }>;
};
