# AI Usage Log: FairShare

**Split expenses. Settle fairly.**

- **Live application:** https://get-fairshare.vercel.app/
- **GitHub repository:** https://github.com/ShantoSarkar34/fairshare

This document is an honest record of how AI tools were used in building FairShare, what went wrong along the way, and what I did to verify and take responsibility for the result. It is written in the first person.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, PostgreSQL (Neon), Prisma ORM 7, Better Auth, Zod, Tailwind CSS 4, Vitest, Vercel.

**A note on accuracy.** I have tried to include only what I can stand behind. Where I do not have the exact original wording of a prompt, or where I cannot confirm an outcome, I say so rather than filling the gap. Exact tool outputs are quoted only where they were provided to me as known facts about the project.

## Contents

1. [AI tools and their purposes](#1-ai-tools-and-their-purposes)
2. [Three AI-introduced problems and corrections](#2-three-ai-introduced-problems-and-corrections)
3. [Two representative prompts](#3-two-representative-prompts)
4. [My own deliberate contribution](#4-my-own-deliberate-contribution)
5. [Verification and responsibility](#5-verification-and-responsibility)

## 1. AI tools and their purposes

I used two AI tools at different stages. They did different kinds of work, and I want to keep those roles clearly separate.

| Tool         | Stage                  | Kind of contribution                  |
| ------------ | ---------------------- | ------------------------------------- |
| **OpenCode** | Initial implementation | Implementation                        |
| **Claude**   | Later stages           | Review, troubleshooting, and planning |

### OpenCode: implementation

OpenCode was used during the initial implementation of the project, covering the earlier development phases and substantial parts of the application. It helped with:

- Project setup and architecture
- Database schema and Prisma implementation
- Authentication
- Groups and membership
- Expense management
- Money and splitting algorithms
- Balance calculations
- Settlement functionality
- bKash sandbox integration
- Activity history

OpenCode completed work through **Phase 13** before its usage limit was reached. Work after that point was not carried out by OpenCode.

### Claude: review, troubleshooting, and planning

Claude was used later in the project. Its role was **not** to implement the application. It was used to:

- **Review** the existing implementation.
- **Identify remaining gaps** relative to the assessment requirements.
- **Troubleshoot migration issues**, including discussing the failing migration described below.
- **Plan** the remaining assessment work.

Claude has also been used to help draft written submission documents such as the README and the decisions document. Those documents were prepared from project information I supplied, and I am responsible for checking them against the actual repository.

**What I am not claiming.** Claude did not implement features that were only reviewed or planned. Features are not described as complete here merely because they were discussed.

### Distinguishing the four kinds of work

- **Implementation:** writing application code, schema, and migrations. This was primarily OpenCode.
- **Review:** reading existing work and pointing out gaps or risks. This was primarily Claude.
- **Troubleshooting:** diagnosing failures such as the migration error below. This involved me running the commands and Claude helping interpret the results.
- **Planning:** deciding what remained and in what order. This was shared, and the final decisions were mine.

## 2. Three AI-introduced problems and corrections

These are three real incidents from the project history. For each one I describe what happened, why it mattered, how it was investigated or corrected, and what I learned. I describe the status of each honestly, including where I cannot confirm a final outcome.

### Problem 1: Duplicate database constraint in a migration

**What happened.** While testing migrations against a completely fresh database, Prisma failed with:

- **Prisma error:** `P3018`
- **PostgreSQL error:** `42710`
- **Constraint:** `settlements_amount_positive`
- **Migration:** `20261104062747_phase12_settlements_and_bkash`

The constraint `settlements_amount_positive` already existed at the point where the Phase 12 migration tried to create it, so PostgreSQL rejected the duplicate.

**Authorship.** I do not know exactly which tool or step produced the duplicate definition, so I am deliberately not attributing it to OpenCode or Claude. The migration SQL was AI-assisted work that I accepted into the repository, and the review gap is mine to own regardless of where the line originated.

**Why it mattered.**

- A fresh install of the project would fail. Anyone cloning the repository and running migrations, including an assessor, would hit the error.
- It was invisible in day-to-day development. A database that had evolved incrementally never replays every migration in order, so it never encounters the duplicate.
- Migrations affect the integrity of money-related data, so errors there are more serious than UI bugs.

**How it was investigated and corrected.**

- I created a **separate scratch database** and applied the full migration history to it from empty. That is how the failure surfaced.
- A **migration correction was subsequently made** so that the constraint is not created twice.
- A fresh scratch database was then used again to test the migrations.

**Honest caveat.** Correcting a migration file that may already have been applied elsewhere has checksum implications for databases that applied the earlier version. I treat that as a known consideration, not as something solved for every existing database. I have not claimed that all databases are automatically reconciled.

**What I learned.**

- **AI-generated migration SQL must be reviewed and tested against a completely fresh database**, not only against a database that already has the earlier schema applied.
- Reading the SQL is not enough. Replaying the whole history on an empty database is the only reliable test that it works for a new installation.
- Constraints written by hand in SQL are not visible in the Prisma schema, so they deserve extra scrutiny.

### Problem 2: Production build issue with prerendering

**What happened.** An earlier production build encountered a prerendering problem involving `/login` and `theme-provider.tsx`. The problem was related to dynamic or uncached runtime data being accessed in a way that conflicted with prerendering.

**Why it mattered.** Development mode is forgiving. Pages are rendered on demand, so code that depends on runtime data can appear to work. A production build prerenders what it can, and it fails when something that must be dynamic is treated as static. A project that runs fine under `npm run dev` can therefore still fail to build for deployment.

**Why passing checks do not settle it.** Successful **type checking** and a passing **test suite** do not guarantee a successful **production build**. Type checking verifies types, and unit tests verify logic. Neither exercises Next.js prerendering or the rules about dynamic and uncached data. Only an actual `npm run build` does.

**How it was approached.** I identified the failing route and component from the build output, which pointed at `/login` and `theme-provider.tsx`, and I treated the production build as its own verification step from then on.

**Status.** I am not claiming a confirmed final resolution here. I do not have a record that I can cite showing the final state of this issue, so I am leaving its status open instead of asserting that it was fixed. The live deployment exists, but I will not use that as proof of a specific fix. Anyone reviewing the project should confirm with `npm run build`.

**What I learned.**

- Run the production build as a routine check, not only before deployment.
- Dynamic runtime data (such as cookies, headers, or per-request values) interacts with prerendering, and AI-generated code does not always account for that.
- "It type checks and the tests pass" is a weaker statement than "it builds and runs."

### Problem 3: Resource exhaustion during tests

**What happened.** An earlier parallel test run exhausted the available memory on my machine. Running the test suite **sequentially with `--no-file-parallelism`** succeeded.

**What I do and do not know.** I know the parallel run ran out of memory and the sequential run succeeded. I have not established the underlying cause beyond that, and I am not going to guess at one.

**Why it mattered.**

- A test suite that crashes the machine is not a test suite you can rely on or run often.
- A failure caused by resources is easy to misread as a failure in the code. I needed to distinguish the two.
- The sequential success showed the tests themselves could pass, so the problem was in how they were being run on my hardware.

**How it was handled.** I re-ran the suite with file parallelism disabled:

```bash
npx vitest run --no-file-parallelism
```

**What I learned.**

- Test execution settings should be chosen to fit the development environment. The default parallelism is a reasonable starting point, but it is not guaranteed to suit every machine.
- A slower run that completes is more useful than a faster run that fails.
- When a result is surprising, I should separate "the code is wrong" from "the environment is constrained" before changing code.

I have not changed the project's `test` script to include this flag. The documented script remains `vitest run`, and the flag is something I use when my machine needs it.

## 3. Two representative prompts

**Important:** I do not have the exact original wording of the prompts I used during development. The two prompts below are **representative examples** that reflect the kind of instruction I gave and the approach that worked. They are reconstructions of the shape of those prompts, **not exact historical quotes**.

### Prompt 1: Reliable monetary calculations and expense splitting

**Representative prompt:**

> Implement the money and expense-splitting logic for a shared-expense app.
>
> Requirements:
>
> - Represent all money as integer poisha. Use BigInt in application code and BIGINT in PostgreSQL. Do not use floating-point arithmetic anywhere.
> - Support four split types: equal, exact, percentage, and shares.
> - Equal splits must allocate the remainder deterministically. Sort participants by user ID so the same input always gives the same output.
> - Percentages must be stored as basis points and allocated with the largest-remainder method.
> - Every split must sum exactly to the expense total, and invalid input must be rejected with a clear error.
> - Write unit tests for the edge cases, including a 100.00 amount split three ways, and do not change the tests to make the code pass.

**Why this kind of prompt was effective:**

- **It stated invariants, not just features.** "Every split must sum exactly to the total" is a property that can be checked. It gave the AI a target and gave me something to verify.
- **It ruled out the wrong approach up front.** Naming floating point as forbidden prevented the most common failure for money code.
- **It required determinism.** Specifying the ordering rule meant the result could be reproduced and tested.
- **It asked for tests with concrete cases.** A worked example made the behavior unambiguous.
- **It constrained how tests could be handled.** I did not want tests adjusted to fit the code.

### Prompt 2: Reviewing and testing Prisma migrations safely

**Representative prompt:**

> Review the Prisma migrations in this project for correctness on a fresh install.
>
> Constraints:
>
> - Do not run anything against my production database.
> - I will create a separate scratch database on Neon and give you its connection string through environment variables only. Never print or store the connection string.
> - Check that every migration applies in order from an empty database, then report the result.
> - Look specifically for duplicate constraint or index names, hand-written SQL that Prisma's schema does not describe, and anything that depends on pre-existing state.
> - Report what you found before changing any file. Do not edit migrations that have already been applied without explaining the checksum consequences.

**Why this kind of prompt was effective:**

- **It protected production data.** The scratch database made it safe to test destructive or failing operations.
- **It set a scope and an order of operations.** Reporting before changing prevented the AI from silently rewriting migration history.
- **It named the risks to look for.** Duplicate constraint names and hand-written SQL were exactly the area where the real failure occurred.
- **It addressed the checksum issue.** Requiring an explanation before editing applied migrations kept me aware of the consequences.
- **It kept secrets out of the conversation.** Connection strings stay in environment variables.

I am recording this prompt as the approach I took to migration testing. The scratch-database testing itself is something I carried out personally (see section 4).

## 4. My own deliberate contribution

AI tools did a large share of the code writing in this project, and I am not going to claim otherwise. I did **not** manually write all of the implementation. What I contributed was direction, judgment, verification, and ownership. Specifically:

- **I defined the product.** I decided FairShare should be a **focused shared-expense splitter**, not a generic management platform. That scoping decision shaped everything that followed and kept the project coherent.
- **I made the final decisions on requirements and assessment scope.** The AI tools proposed and implemented. I decided what was in and what was out.
- **I reviewed AI-generated implementation reports.** When a technical decision was unclear, I asked for an explanation rather than accepting it on trust.
- **I independently carried out deployment and database migration testing.** I ran these steps myself and observed the real results.
- **I created a separate Neon scratch database** to test migrations safely, without risking production data. That test is what exposed the duplicate constraint problem in section 2.
- **I identified the need to distinguish bKash merchant sandbox checkout from member-to-member settlements.** These are different workflows with different meanings, and keeping them apart avoids implying that FairShare verifies real peer-to-peer payments.
- **I decided what to include in the final assessment**, including what to describe as limitations.

### Why human review, verification, and ownership matter

- **AI output is plausible by default, not correct by default.** The duplicate constraint is a good example: it looked like reasonable migration SQL and failed only when replayed on an empty database.
- **Accountability cannot be delegated.** If the application mishandles money or exposes data, "the AI wrote it" is not an acceptable answer. I am the person submitting and deploying this project.
- **Product judgment is human work.** Deciding what the application is for, and what it should not try to be, was not something the tools could do for me.
- **Understanding is what makes the work defensible.** Being able to explain why money is stored as integer poisha, or why sandbox checkout is separate from settlements, matters more than having generated the code.
- **Honest scope protects credibility.** Saying clearly what is incomplete or unverified is more useful than overstating what exists.

## 5. Verification and responsibility

I did not accept AI-generated code blindly. The checks I rely on, and what each one is for, are:

| Check                                      | Purpose                                                                                | Command or method                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Automated tests**                        | Verify logic such as money, splitting, balances, and settlements                       | `npm test` (and `--no-file-parallelism` when memory is constrained) |
| **TypeScript checks**                      | Catch type errors across the codebase                                                  | `npx tsc --noEmit`                                                  |
| **Linting**                                | Catch code quality problems                                                            | `npm run lint`                                                      |
| **Prisma validation and migration status** | Confirm the schema is valid and migrations are in sync                                 | `npx prisma validate`, `npx prisma migrate status`                  |
| **Fresh-database migration testing**       | Confirm a new installation works end to end                                            | Apply all migrations to an empty scratch database                   |
| **Production build verification**          | Catch prerendering and build-time failures that other checks miss                      | `npm run build`                                                     |
| **Manual testing**                         | Confirm the application behaves correctly for a real user                              | Using the running application                                       |
| **Security and authorization review**      | Confirm server-side checks, group membership validation, and protection of credentials | Reviewing the code paths directly                                   |

### Which of these have evidence behind them

I want to be precise about what I can actually claim.

- **Fresh-database migration testing:** I ran this, and it found the duplicate constraint failure described in section 2. A corrected migration was then tested on a fresh scratch database.
- **Parallel test execution:** I observed a memory exhaustion failure and a successful sequential run.
- **Production build:** I encountered a prerendering failure involving `/login` and `theme-provider.tsx`. I am **not** claiming a confirmed final resolution.
- **The remaining checks** (TypeScript, linting, Prisma validation, manual testing, and the security and authorization review) are checks I consider necessary. I am **not claiming that every one of them passed**, because I do not have a complete verified record of each result to cite here. Anyone reviewing the project should run them rather than take this document's word.

### Where AI helped and where I decided

- AI helped write code, review it, and interpret errors.
- I decided what to accept, what to question, and what to verify independently.
- I ran the deployment and migration tests myself, because those are the points where real consequences begin.

### Incomplete or unverified work

I would rather state this plainly than leave it for a reviewer to find:

- Features that were only reviewed or planned are **not** claimed as implemented.
- bKash support is **sandbox only**. No real money is processed.
- The settlement suggestion algorithm is a greedy approach and does not guarantee a globally minimum number of transactions.
- No seed script or public demo accounts are documented.
- The final state of the production build issue is **not** confirmed in this document.
- Test counts and coverage figures are **not** reported because I have not verified them for this document.

AI tools were a significant part of how this project was built, but the decisions, the verification, and the responsibility for the result are mine.
