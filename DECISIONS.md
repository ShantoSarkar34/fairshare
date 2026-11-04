# FairShare: Engineering Decisions

**Split expenses. Settle fairly.**

- **Live application:** https://get-fairshare.vercel.app/
- **GitHub repository:** https://github.com/ShantoSarkar34/fairshare

This document records the main engineering decisions behind FairShare: what was chosen, why, which alternatives were considered, and what the trade-offs and limitations are. It is written to support a technical assessment and code walkthrough.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, PostgreSQL (Neon), Prisma ORM 7, Better Auth, Zod, Tailwind CSS 4, Vitest, Vercel.

**How to read this document.** Where the intended design and the implemented behavior may differ, the text says so explicitly. Anything marked **Intended** or **Future** is not claimed as finished functionality. Exact file locations are not cited here, so verify specifics against the repository during a walkthrough.

## Contents

1. [Money representation and precision](#1-money-representation-and-precision)
2. [Equal split remainder allocation](#2-equal-split-remainder-allocation)
3. [Expense splitting strategies](#3-expense-splitting-strategies)
4. [Member leaving or being removed with an outstanding balance](#4-member-leaving-or-being-removed-with-an-outstanding-balance)
5. [Editing an expense after settlement](#5-editing-an-expense-after-settlement)
6. [Stored balances versus calculated balances](#6-stored-balances-versus-calculated-balances)
7. [Settlement suggestion algorithm](#7-settlement-suggestion-algorithm)
8. [Database constraints and migration decisions](#8-database-constraints-and-migration-decisions)
9. [Authorization and security](#9-authorization-and-security)
10. [bKash sandbox versus manual settlements](#10-bkash-sandbox-versus-manual-settlements)
11. [Activity history and auditability](#11-activity-history-and-auditability)
12. [Known limitations and future improvements](#12-known-limitations-and-future-improvements)

## 1. Money representation and precision

### Decision

All monetary values are stored and calculated as **integer poisha** (1 BDT = 100 poisha). Storage uses PostgreSQL `BIGINT`, and application code uses JavaScript `BigInt`.

### Why not floating point

JavaScript numbers are IEEE 754 doubles, which cannot represent most decimal fractions exactly:

```text
0.1 + 0.2  ->  0.30000000000000004
```

In an expense-splitting app, small errors compound. A group could end up with balances that do not sum to zero, or a settlement that leaves a one-poisha residue nobody can clear. Integer arithmetic removes this class of bug. Every operation is exact, and totals can be checked with strict equality.

### Why `BIGINT` and `BigInt`

| Option                                        | Problem                                                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `FLOAT` / `DOUBLE` / JS `number` for decimals | Inexact decimal representation                                                                                                |
| `NUMERIC(p, s)`                               | Exact, but maps to a decimal type that needs extra handling in JS, and it keeps fractional precision the domain does not need |
| `INTEGER` (32-bit)                            | Maximum is about 2.1 billion poisha (about ৳21 million), which is a needlessly tight ceiling for aggregate sums               |
| `BIGINT` + JS `BigInt`                        | Exact, 64-bit range, and the types match end to end                                                                           |

A JS `number` is only safe for integers up to `Number.MAX_SAFE_INTEGER` (2^53 - 1). Using `BigInt` in application code means sums over many expenses and settlements can never silently lose precision, and the database and application agree on the type.

### Serialization of `BigInt` in JSON

`JSON.stringify` throws a `TypeError` when it meets a `BigInt`. Money values therefore cannot be returned from API routes or passed from Server Components to Client Components without explicit conversion. The decision is to **convert at the boundary**: monetary values are converted to a JSON-safe representation when responses are built, and converted back to `BigInt` when input is parsed. Keeping the conversion at the edges means the internal logic always works with exact integers.

**Trade-off:** every boundary needs a conversion, and forgetting one produces a runtime error rather than a silent rounding bug. A runtime error is the safer failure mode for money. To confirm the exact wire representation (decimal string versus number), check the serialization helper in the code.

### Display

Poisha are converted to a human-readable taka amount only for presentation (for example, `10000` poisha is displayed as ৳100.00). Display formatting never feeds back into calculations.

## 2. Equal split remainder allocation

### The problem

An equal split of an amount that does not divide evenly cannot give everyone the same integer. Rounding each share independently can make the shares add up to more or less than the original expense.

### Worked example

৳100.00 split equally among three members is 10000 poisha:

```text
10000 / 3 = 3333 remainder 1
```

| Member (by stable user ID order) | Share                      |
| -------------------------------- | -------------------------- |
| First                            | 3334 poisha (৳33.34)       |
| Second                           | 3333 poisha (৳33.33)       |
| Third                            | 3333 poisha (৳33.33)       |
| **Total**                        | **10000 poisha (৳100.00)** |

Each member receives the base share (`floor(total / n)`), and the leftover poisha are handed out **one each, in order**, starting with the first member. With a remainder of `r`, the first `r` members get one extra poisha.

### Why a stable user ID ordering

Participants are sorted by **user ID** before allocation. The reasons:

- **Determinism.** The same expense always produces the same shares. Reordering the participant list in the UI, in the request payload, or in a database result cannot change who absorbs the extra poisha.
- **Reproducibility.** Recalculating an expense later, for example when it is edited or displayed, gives identical results. Otherwise, balances could drift between renders.
- **Testability.** Unit tests can assert exact expected values.
- **No hidden bias.** Using insertion order or a database default ordering would be unspecified and could vary between queries.

**Trade-off:** user ID order is arbitrary, so over time the same members may tend to absorb the extra poisha. The cost is at most `n - 1` poisha per expense, which is negligible. Rotating the remainder fairly across expenses would require extra state and was judged not worth the complexity.

## 3. Expense splitting strategies

FairShare supports four split types. In every case, **the resulting allocations must sum exactly to the expense total**, and this is enforced by validation rather than assumed.

| Strategy       | Input                                              | How shares are computed                                                           |
| -------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Equal**      | Participants                                       | `floor(total / n)` each, with the remainder distributed as described in section 2 |
| **Exact**      | An amount per participant                          | The entered amounts are used directly                                             |
| **Percentage** | A percentage per participant, held as basis points | Shares are derived with largest-remainder allocation                              |
| **Shares**     | A positive number of shares per participant        | Total is distributed in proportion to share counts                                |

### Exact amounts

The user enters each participant's amount. Validation requires that the amounts add up to the expense total in poisha. If they do not, the request is rejected. There is nothing to round, so this is the simplest case.

### Percentages as basis points

Percentages are stored as **basis points** (1% = 100 bps, 100% = 10,000 bps), which keeps percentages as integers as well. For example, 33.33% is 3333 bps. Validation requires that all participants' basis points sum to exactly 10,000.

Each participant's raw share is `total * bps / 10000`, which is usually not a whole number of poisha. **Largest-remainder allocation** handles this:

1. Compute each participant's integer part: `floor(total * bps / 10000)`.
2. Compute the fractional remainder of each.
3. The poisha still unallocated (total minus the sum of integer parts) is given out one at a time to the participants with the **largest fractional remainders**.
4. Ties are broken deterministically (by a stable ordering such as user ID), for the same reasons as in section 2.

**Why largest-remainder instead of rounding each share:** independent rounding can leave the total off by one or more poisha. Largest-remainder is guaranteed to sum exactly to the total and keeps each share within one poisha of its ideal value. All of this is done with integer arithmetic on `BigInt`.

### Shares-based

Each participant has a positive share count (for example, 2 shares versus 1 share). A participant's ideal portion is `total * theirShares / totalShares`. Because that division is also inexact in general, the same largest-remainder logic applies so the allocations sum exactly to the total.

### Validation rules

Validation is performed with Zod at the input boundary and re-checked in the server-side calculation logic:

- The expense amount must be a positive integer number of poisha.
- At least one participant is required, and participants must be valid members of the group.
- Exact splits must sum to the expense total.
- Percentage splits must sum to 10,000 basis points.
- Share counts must be positive integers.
- No allocation may be negative.

**Why validate on the server:** client-side checks improve usability, but only server-side checks can be trusted. A hand-crafted request must be rejected just like a mistaken form entry.

## 4. Member leaving or being removed with an outstanding balance

### The risk

If a member could leave or be removed while carrying a non-zero balance:

- **They owe money:** the creditors lose any practical way to collect. The group's remaining balances would no longer sum to zero in any useful sense, because the departed member's debt has no owner to settle it.
- **They are owed money:** the departed member's claim is stranded. Others could still appear to owe them, with no member able to complete the payment.
- Either way, the group's books no longer reconcile.

### Intended design

A member with a **non-zero balance must settle their outstanding balance before leaving or being removed**. Concretely, the membership change is blocked until the member's calculated balance is zero.

### Historical records stay intact

Membership changes must **never delete historical expenses or settlements**, for these reasons:

- Past expenses record who paid and who shared the cost. Removing a member's rows would change everyone else's calculated balances retroactively.
- Settlements are evidence that money moved. Deleting them would make the history inconsistent with real-world events.
- Activity history and audit trails reference these records.
- A person leaving a group does not change what happened while they were in it.

Membership is therefore treated as _current state_, whereas expenses and settlements are _history_. History is preserved regardless of the current member list.

### Intended versus implemented

This document describes the **intended rule** and the reasoning behind it. Before presenting the behavior as complete, verify during the walkthrough that leave/remove actions enforce the zero-balance check on the server (not just hiding a button in the UI). Any gap between the rule and the implementation should be reported as a known limitation rather than described as finished.

## 5. Editing an expense after settlement

### Why edits change balances

Balances are derived from expenses and settlements (see section 6). If an expense is edited after related settlements were recorded, for example the amount is corrected from ৳900 to ৳600, then the expense's contribution to each member's balance changes, while the earlier settlements remain unchanged. The calculated balance may now reflect an overpayment or a different remaining debt. This is correct behavior: the balance reflects the corrected expense and the payments that actually occurred.

### Example

1. Alice pays ৳900 for a group dinner, split equally among Alice, Bob, and Carol. Bob and Carol each owe Alice ৳300.
2. Bob records a settlement of ৳300 to Alice. Bob's balance is zero.
3. Alice edits the dinner to ৳600. Each share becomes ৳200, and Bob's debt becomes ৳200.
4. Bob's recorded ৳300 payment now exceeds what he owed, so Bob's balance becomes **+৳100**. Alice owes Bob ৳100.

The system did not delete anything, and the result is consistent with real events: Bob really did pay ৳300.

### Why settlements are not deleted or rewritten

- A settlement records that a payment happened. It is not a derived value that should follow the expense.
- Automatically deleting or adjusting settlements would erase evidence of real payments and hide the effect of the edit.
- Keeping settlements and recalculating balances from source records means the history stays complete, and the corrected balance is the visible consequence of the edit.

### Audit and reconciliation concerns

- **Visibility.** After an edit, members may be surprised that their balance changed. The activity history (section 11) records before/after snapshots so the change can be explained.
- **Reconciliation.** Where settlements were already paid out in cash, bKash, or bank transfer, an edit can create a new reverse obligation, as in the example above. Members must reconcile this among themselves.
- **No locking.** The design does not freeze expenses once settlements exist. That keeps the app simple and lets users correct genuine mistakes, but it also means history-affecting edits are possible. Mitigating this relies on the activity record rather than on prevention. Restricting edits or requiring confirmation in settled groups is a possible future improvement.

## 6. Stored balances versus calculated balances

### Decision

There is **no manually maintained balance column**. Balances are **calculated on demand** from the source records:

```text
balance(member) = (total paid by member)
                - (member's share of all expenses)
                + (settlements paid by member)
                - (settlements received by member)
```

Positive means the member is owed money. Negative means the member owes money. Since every expense's shares sum to its total, and every settlement moves the same amount from one member to another, the balances of all members in a group always sum to zero.

### Why expenses and settlements are the source of truth

| Concern               | Calculated balances                                           | Stored balance totals                                                              |
| --------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Consistency**       | Cannot drift, because there is only one place the truth lives | Must be updated in step with every expense create/edit/delete and every settlement |
| **Edits and deletes** | Automatically correct after any change                        | Each change must be reversed and re-applied correctly                              |
| **Bugs**              | A calculation bug is fixed once, and the next read is correct | A bug can silently corrupt stored totals, and fixing it needs a data repair        |
| **Auditability**      | Balances can always be explained from the records             | A stored number cannot explain itself                                              |
| **Performance**       | Cost grows with history size                                  | O(1) reads                                                                         |

### Performance trade-off

Recalculating means reading a group's expenses, splits, and settlements on each balance view. For the expected size of a friends-and-family group this is cheap, and it avoids a whole category of consistency bugs. The cost grows with group history.

### Future options

If performance becomes a problem, there are non-destructive ways to optimize while keeping the records authoritative:

- **Caching** the calculated result, invalidated when an expense or settlement changes.
- **Materialized balance summaries** that are rebuilt or incrementally updated from the source records, and can be verified against a full recalculation.
- **Periodic snapshots** that fold old history into an opening balance.

In each case the source records remain the truth, and the cache or summary is disposable. These are **not implemented**.

## 7. Settlement suggestion algorithm

### Goal

Given each member's net balance, suggest a set of payments that brings every balance to zero, using as few transfers as practical.

### Creditor/debtor matching

1. Split members into **creditors** (positive balance, owed money) and **debtors** (negative balance, owe money). Members with a zero balance are ignored.
2. Repeatedly match a debtor to a creditor.
3. Each match transfers `min(debtor's remaining debt, creditor's remaining credit)`.
4. At least one of the two parties is fully settled by each transfer and drops out.
5. Continue until all balances are zero.

The algorithm is **deterministic and greedy**: members are ordered in a fixed way (with stable tie-breaking), and each step makes the locally best choice without looking ahead. The same balances always produce the same suggestions, so suggestions do not change between page loads.

### Example: several debtors, one creditor

Balances: Alice **+৳300**, Bob **-৳100**, Carol **-৳200**.

```text
Suggested payments:
  Bob   -> Alice  ৳100
  Carol -> Alice  ৳200
```

Two transfers settle three people. Without suggestions, members might each try to pay back every expense individually, producing many more payments.

### Why it reduces the number of transfers

Each transfer eliminates at least one participant from further consideration. With `n` members who have non-zero balances, the algorithm therefore produces at most **`n - 1` transfers**. That is far fewer than settling each expense pair by pair.

### Why it is not globally minimum

Minimizing the number of transfers is equivalent to partitioning members into the **maximum number of groups whose balances sum to zero**. Each such group can be settled with (group size - 1) transfers. Finding that partition is a hard combinatorial problem (related to subset-sum and NP-hard).

A greedy pass can miss it. Illustrative example, assuming largest-first matching: creditors **+6** and **+5**, debtors **-5**, **-3**, **-3**.

- Optimal: {+6, -3, -3} settled with 2 transfers, and {+5, -5} settled with 1 transfer, for **3 transfers** in total.
- A largest-first greedy pass pairs +6 with -5 first, leaving a +1 remainder and breaking up the clean subgroups, and ends with **4 transfers**.

The exact output for real data depends on the ordering and tie-breaking rules in the settlement module, but the class of limitation is real: **a greedy approach reduces transfers without guaranteeing the global minimum.**

### Why the trade-off is acceptable here

- Groups are small, so the practical difference is usually zero or one transfer.
- The `n - 1` upper bound is already a large improvement over naive settlement.
- Deterministic, predictable output is easier to explain, test, and trust than an optimal-but-opaque solver.
- An exact solver would add complexity and potential performance risk for little user benefit.
- Suggestions are **advisory**. Members can record whatever settlements they actually make.

## 8. Database constraints and migration decisions

### Why database-level CHECK constraints

Application validation can be bypassed by a bug, a new code path, a script, or a manual query. Database constraints are the last line of defense, and they apply regardless of which code writes the data. For a money-handling system, invariants such as these belong in the database:

- Settlement amounts must be strictly positive.
- A settlement cannot be paid from a member to themselves.
- Expense and split amounts must not be negative.
- Relational integrity (foreign keys) ties splits, expenses, settlements, and groups together.

The principle is **defense in depth**: Zod and the calculation logic reject bad input early with useful errors, and the database refuses to store invalid data if something slips through.

### Constraints written directly in SQL migrations

Prisma's schema language does not express `CHECK` constraints. They are therefore written **by hand in SQL migration files** and are **not represented in `prisma/schema.prisma`**. Consequences:

- The Prisma schema alone is not a complete description of the database. The migration SQL is part of the source of truth.
- Prisma does not know these constraints exist, so it cannot warn about them, generate types from them, or validate against them.
- Anyone changing the schema needs to read the migration history, not just the schema file.
- Drift is possible if someone alters constraints outside the migration workflow.

### The duplicate `settlements_amount_positive` problem

During **fresh-database migration testing**, a problem was found: the constraint **`settlements_amount_positive`** was defined more than once across the migration history. On a database built from scratch by applying every migration in order, the second definition failed because a constraint with that name already existed.

This is the kind of defect that only appears when migrations are replayed on an empty database. Databases that evolved incrementally never hit it.

### Correction

The migration that introduced the duplicate definition was **corrected** so a fresh installation applies cleanly end to end.

### Checksum implications

Prisma records a **checksum of each applied migration file** in its migrations table, and `prisma migrate deploy` and `migrate dev` compare it against the file on disk. Editing a migration that has already been applied elsewhere therefore has consequences:

- **Fresh databases** apply the corrected version and work.
- **Databases that already applied the previous version** have the old checksum recorded. The edited file no longer matches, so Prisma can report that the applied migration was modified. These databases are **not automatically reconciled**.
- Reconciling an existing database requires a deliberate step, such as verifying that its actual state matches the corrected migration and then resolving or updating the migration record using Prisma's migration-resolution tooling, or recreating the database where data is disposable. The right choice depends on the environment, and it should be done with care and a backup.

**What is and is not claimed:** the migration history is **not** presented as universally clean. A fresh install works. An existing database that applied the earlier version of the migration may need manual attention. The trade-off was accepted for the sake of reliable fresh installs, which is what reviewers and new developers will run.

**Lesson:** editing an applied migration is normally discouraged. The better practice is to add a new corrective migration. Here the edit made fresh installs work, and the checksum cost is documented rather than hidden.

## 9. Authorization and security

### Server-side authorization

Every sensitive operation is authorized **on the server**. Hiding buttons or routes in the UI is a usability feature, not a security control. Authentication is provided by Better Auth, and server code resolves the current session before acting.

### Group membership validation

Operations scoped to a group (viewing expenses, adding an expense, recording a settlement, inviting someone) verify that the requesting user is a **member of that group** before proceeding. Being signed in is not sufficient.

### IDOR prevention

Insecure Direct Object Reference happens when a user can access a resource just by guessing or changing its ID, for example `/groups/123/expenses/456`. To prevent it:

- An ID in a request is never trusted on its own. The server checks that the referenced object **belongs to a group the user is a member of**.
- Nested resources are verified against their parent. An expense ID must belong to the group ID in the same request.
- Participant IDs in splits must be members of the same group, which stops a request from pulling outsiders into an expense.

### Validation of user-controlled input

All input from the client is validated with **Zod** on the server: types, ranges, formats, and the business rules in section 3. Monetary values are parsed into integer poisha, and amounts that are non-positive or inconsistent are rejected. Database constraints (section 8) back this up.

### Protection of payment credentials

bKash credentials (`BKASH_USERNAME`, `BKASH_PASSWORD`, `BKASH_APP_KEY`, `BKASH_APP_SECRET`) are read from **server-side environment variables** and used only in server code. They are not exposed to the browser, not prefixed for client exposure, and not committed to the repository.

### Server-side verification of bKash sandbox payment status

The status of a sandbox checkout is **verified by the server with the bKash API**, not accepted from the client. A browser redirect or query string is user-controlled and can be forged, so the server queries or executes the payment with bKash and trusts that response. Even in a sandbox, the design follows the correct pattern for production payment integrations.

## 10. bKash sandbox versus manual settlements

FairShare has two payment-related workflows, and they are intentionally kept **separate**.

|                        | Manual settlement                                                                                | bKash sandbox checkout                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **What it represents** | A real payment between two members that happened outside the app (cash, bKash, or bank transfer) | A simulated merchant checkout against the bKash sandbox |
| **Who is paid**        | Another group member                                                                             | A merchant account (sandbox)                            |
| **Verification**       | None. It is a record based on the members' word                                                  | Payment status checked on the server with bKash         |
| **Effect on balances** | Creates a settlement record, which changes balances                                              | **Does not** create a member-to-member settlement       |
| **Money moved**        | Real, outside the app                                                                            | None (sandbox)                                          |

### Manual member-to-member transfers

When a member pays another member by cash, bKash, or bank transfer, the money moves **outside** FairShare. Afterwards, a member records a settlement in the app. The app records and reconciles. It does not move or verify money. Choosing "bKash" as the method on a manual settlement only labels how the members paid. It does not involve the bKash API.

### bKash sandbox checkout

The sandbox checkout demonstrates a **merchant checkout** flow with the bKash tokenized checkout API: create a payment, redirect the customer, then execute and verify it. It runs in the sandbox only, so **no real money moves**.

### Why they stay separate

- **Different payee.** A merchant checkout pays a merchant account. A member-to-member debt is owed to a person. bKash merchant checkout does not pay one personal account from another.
- **Sandbox money is not real.** If a sandbox success automatically wrote a settlement, the group's balances would change on the strength of a simulated payment. That would corrupt real accounting.
- **Honest claims.** Merging them would imply FairShare verifies real peer-to-peer payments, which it does not.
- **Failure isolation.** The settlement ledger stays correct even if the sandbox is unavailable or the checkout flow changes.

A sandbox checkout therefore never automatically creates a member-to-member settlement.

## 11. Activity history and auditability

### Why record activity

Shared money needs accountability. When a balance changes, members need to be able to see **what happened, who did it, and when**. Important operations are recorded in an activity history, such as expense creation, edits, and deletions, and settlement actions. This reduces disputes and makes behavior explainable, which matters particularly given section 5, where an edit changes balances.

### Before/after snapshots for edits

When an expense is edited, the activity record keeps a snapshot of the expense **before and after** the change (amount, payer, split type, participants, and so on). A reader can see precisely what changed, not just that something did.

### Deleted expense snapshots

When an expense is deleted, a **snapshot of the deleted expense** is kept in the activity history. Without it, a deletion would leave only a gap, and the balance change it caused could not be explained or reviewed.

### No ordinary edit/delete for activity records

Activity records are designed as an **append-only log**. The application exposes no normal operation to edit or delete them. An audit trail that its subjects can rewrite is not an audit trail. Being able to rewrite history would also undermine the trust that the snapshots exist to provide.

### Known limitations

- **Immutability is enforced at the application level.** Not exposing edit/delete operations prevents ordinary misuse. Database-level enforcement (for example, restricted privileges or triggers that reject updates and deletes) is **not** claimed as implemented here, so someone with direct database access could still alter records. It is a possible future hardening step.
- **No tamper-evidence.** There is no hash chaining or signing of records, so alteration with direct database access would not be detectable.
- **Concurrency.** Two members editing the same expense at nearly the same time can interleave. Unless optimistic locking or versioning is in place, the later write may overwrite the earlier one, and the activity entries would show both snapshots but the app would not have blocked the conflict. Treat this as a known limitation to verify and, if confirmed, address in the future.
- **Snapshot size.** Storing full snapshots trades storage for clarity. For this project's scale, that is acceptable.

## 12. Known limitations and future improvements

| Area                       | Limitation                                                                                                                                                                                                  | Possible improvement                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Settlement suggestions** | The greedy algorithm does not guarantee a globally minimum number of transfers (section 7)                                                                                                                  | Subgroup detection or an exact solver for small groups, if worthwhile                                       |
| **Performance**            | Balances are recalculated from the full history on demand (section 6), so cost grows with group size and history                                                                                            | Caching, materialized balance summaries, pagination of history, periodic snapshots                          |
| **Migrations**             | Databases that applied the earlier version of the migration containing the duplicate `settlements_amount_positive` constraint may have a checksum mismatch and are not automatically reconciled (section 8) | Document and run a reconciliation step per environment, or add forward-only corrective migrations in future |
| **Constraints and schema** | Some CHECK constraints live only in SQL migrations and are invisible to the Prisma schema (section 8)                                                                                                       | Document them centrally, and add checks that compare the live database against the expected constraints     |
| **Edits after settlement** | Expenses can be edited after related settlements exist, changing balances (section 5)                                                                                                                       | Confirmation steps, warnings, or restrictions for settled groups                                            |
| **Membership changes**     | The zero-balance rule for leaving or removal is the intended design. Server-side enforcement should be confirmed (section 4)                                                                                | Verify enforcement and add tests for it                                                                     |
| **Audit log**              | Immutability is application-level only, and there is no tamper-evidence or confirmed concurrency control (section 11)                                                                                       | Database-level protections, versioning or optimistic locking                                                |
| **bKash**                  | Sandbox only. Production bKash processing is not implemented, and manual settlements are unverified (section 10)                                                                                            | A production merchant integration would be a separate, deliberate piece of work                             |
| **Seed data**              | No seed script or public demo accounts are documented. Users register their own accounts                                                                                                                    | Add a seed script and demo data if a reviewer-friendly demo is needed                                       |
| **Testing**                | Test counts and coverage have not been verified for this document                                                                                                                                           | Report verified coverage, and add integration tests for authorization and migrations                        |

None of the items above should be read as claims that the corresponding improvements already exist.
