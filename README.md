# FairShare

**Split expenses. Settle fairly.**

FairShare is a full-stack web application for tracking shared expenses within groups and settling balances fairly. Members record who paid, choose how each expense is divided, and see exactly who owes whom. The application suggests settlements, records manual payments, and keeps an activity history of changes.

It is intended for small groups that share costs, such as roommates, friends travelling together, families, and teams. Typical use cases are household bills, trip costs, and group meals.

## Live Demo and Repository

- **Live application:** https://get-fairshare.vercel.app/
- **GitHub repository:** https://github.com/ShantoSarkar34/fairshare

## Table of Contents

1. [Features](#features)
2. [Technology Stack](#technology-stack)
3. [Prerequisites](#prerequisites)
4. [Local Installation and Setup](#local-installation-and-setup)
5. [Environment Variables](#environment-variables)
6. [Database Setup and Prisma Migrations](#database-setup-and-prisma-migrations)
7. [Seed Data and Demo Login](#seed-data-and-demo-login)
8. [Available npm Scripts](#available-npm-scripts)
9. [Testing](#testing)
10. [Important Technical Decisions](#important-technical-decisions)
11. [bKash Sandbox Integration](#bkash-sandbox-integration)
12. [Project Structure](#project-structure)
13. [Deployment](#deployment)
14. [Security Considerations](#security-considerations)
15. [License](#license)

## Features

- **Authentication:** User registration and sign-in, handled by Better Auth.
- **Groups:** Create and manage expense groups.
- **Membership and invitations:** Invite members to a group and manage group membership.
- **Expenses:** Create, view, edit, and delete expenses.
- **Split methods:**
  - **Equal:** The amount is divided evenly among participants.
  - **Exact:** Each participant's share is entered as a specific amount.
  - **Percentage:** Each participant's share is a percentage of the total.
  - **Shares:** Each participant's portion is proportional to a number of shares.
- **Balances:** Individual member balances are calculated from expenses and recorded settlements.
- **Settlement suggestions:** The application suggests a set of payments that clears all balances.
- **Manual settlements:** Record a payment between members using **Cash**, **bKash**, or **Bank transfer** as the method.
- **bKash sandbox checkout:** Optional merchant checkout against the bKash tokenized sandbox API (see [bKash Sandbox Integration](#bkash-sandbox-integration)).
- **Activity history:** An audit trail of actions taken within a group.
- **Dashboard:** An overview of the signed-in user's groups and balances.

### Limitations

- bKash support is **sandbox only**. No real money is processed.
- The settlement suggestion algorithm is a greedy heuristic and does not guarantee the globally minimum number of transactions (see [Settlement algorithm](#settlement-algorithm)).
- No public demo credentials are provided (see [Seed Data and Demo Login](#seed-data-and-demo-login)).

## Technology Stack

| Technology | Version | Purpose |
| --- | --- | --- |
| Next.js (App Router) | 16.4.4 | Full-stack React framework: routing, server rendering, and server-side logic |
| React | 19.3.0 | User interface library |
| TypeScript | - | Static typing across the codebase |
| PostgreSQL (Neon) | - | Primary relational database, hosted on Neon serverless Postgres |
| Prisma ORM | 7.10.1 | Database schema, migrations, and type-safe queries |
| Better Auth | - | Authentication and session management |
| Zod | - | Runtime schema validation of inputs |
| Tailwind CSS | 4 | Utility-first styling |
| Vitest | - | Unit testing |
| Vercel | - | Hosting and deployment |

Versions marked "-" are not pinned in this document. Check `package.json` for the exact installed versions.

## Prerequisites

- **Node.js:** A current LTS release of version 20.19 or later. Next.js 16 and Prisma 7 both require a modern Node.js runtime. Check `package.json` for an `engines` field if one is present.
- **npm:** Installed with Node.js.
- **PostgreSQL database:** A Neon project is recommended, since the environment configuration is written for Neon's pooled and direct connection strings. Any PostgreSQL database should work if you supply equivalent connection strings.
- **Git:** To clone the repository.
- **bKash sandbox credentials (optional):** Needed only to try sandbox checkout.

## Local Installation and Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/ShantoSarkar34/fairshare.git
   cd fairshare
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

   The `postinstall` script runs `prisma generate` automatically, so the Prisma Client is generated as part of installation.

3. **Configure environment variables**

   Create a `.env` file in the project root (you can copy `.env.example` if it is present) and fill in the values described in [Environment Variables](#environment-variables).

   ```bash
   cp .env.example .env
   ```

4. **Apply database migrations**

   ```bash
   npm run db:deploy
   ```

5. **Start the development server**

   ```bash
   npm run dev
   ```

6. Open http://localhost:3000 and register an account.

## Environment Variables

Create a `.env` file in the project root with the following variables. The values below are placeholders. Replace them with your own and never commit real credentials.

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DBNAME?sslmode=verify-full"

DIRECT_URL="postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/DBNAME?sslmode=verify-full"

BETTER_AUTH_SECRET="replace-with-a-generated-secret"

BETTER_AUTH_URL="http://localhost:3000"

BKASH_ENV="sandbox"
BKASH_BASE_URL="https://tokenized.sandbox.bka.sh/v1.2.0-beta"
BKASH_USERNAME="replace-with-sandbox-username"
BKASH_PASSWORD="replace-with-sandbox-password"
BKASH_APP_KEY="replace-with-sandbox-app-key"
BKASH_APP_SECRET="replace-with-sandbox-app-secret"
```

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon **pooled** connection string (the host contains `-pooler`). Used by the **running application** for runtime queries. |
| `DIRECT_URL` | Yes | Neon **direct, non-pooled** connection string. Used by the **Prisma CLI** for commands such as migrations. |
| `BETTER_AUTH_SECRET` | Yes | Secret used by Better Auth to sign and protect sessions. Generate a long random value, for example with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | Yes | The base URL of the application. Use `http://localhost:3000` locally and the production URL when deployed. |
| `BKASH_ENV` | Optional | bKash environment. Set to `sandbox`. |
| `BKASH_BASE_URL` | Optional | bKash tokenized sandbox API base URL. |
| `BKASH_USERNAME` | Optional | bKash sandbox merchant username. |
| `BKASH_PASSWORD` | Optional | bKash sandbox merchant password. |
| `BKASH_APP_KEY` | Optional | bKash sandbox app key. |
| `BKASH_APP_SECRET` | Optional | bKash sandbox app secret. |

### `DATABASE_URL` versus `DIRECT_URL`

Neon provides two kinds of connection strings:

- The **pooled** connection goes through a connection pooler. It handles many short-lived serverless connections efficiently, which suits the application running on Vercel. This is `DATABASE_URL`.
- The **direct** connection goes straight to the database. Schema migrations need a session-level connection, which a pooler may not support reliably. This is `DIRECT_URL`, used by Prisma CLI commands.

### Better Auth

`BETTER_AUTH_SECRET` protects session data, so it must be unique per environment and kept private. `BETTER_AUTH_URL` tells Better Auth the application's base URL and must match the URL users access, otherwise authentication callbacks and cookies may not work correctly.

### bKash (optional)

The `BKASH_*` variables are only needed for the optional sandbox checkout. The rest of the application works without them. See [bKash Sandbox Integration](#bkash-sandbox-integration).

## Database Setup and Prisma Migrations

The database schema is managed with Prisma migrations, stored in `prisma/migrations/`. The schema is defined in `prisma/schema.prisma`, and Prisma CLI configuration lives in `prisma.config.ts`.

### Fresh database setup

1. Create an empty PostgreSQL database (for example, a new Neon project or branch).
2. Set `DATABASE_URL` and `DIRECT_URL` in `.env`.
3. Apply all migrations:

   ```bash
   npm run db:deploy
   ```

   This runs `prisma migrate deploy`, which applies every pending migration in order without prompting and without resetting data.

4. If you need to regenerate the Prisma Client manually:

   ```bash
   npx prisma generate
   ```

### Migration considerations

- Do not edit migration files that have already been applied. Prisma stores a checksum for each applied migration, and modifying an applied file causes a mismatch the next time migrations run.
- `prisma migrate deploy` is intended for fresh databases and production deployments. If you change `prisma/schema.prisma` during development, create a new migration with `npx prisma migrate dev` rather than editing history.

## Seed Data and Demo Login

No seed script and no public demo accounts are currently documented for this project. No demo credentials are provided.

To try the application, register your own account on the sign-up page, either locally or on the live deployment, then create a group and invite other registered users to explore the shared-expense features.

## Available npm Scripts

| Script | Command | Description |
| --- | --- | --- |
| `npm run dev` | `next dev` | Start the development server at http://localhost:3000. |
| `npm run build` | `next build` | Create a production build. |
| `npm start` | `next start` | Run the production server (requires a prior build). |
| `postinstall` | `prisma generate` | Runs automatically after `npm install` to generate the Prisma Client. |
| `npm run db:deploy` | `prisma migrate deploy` | Apply pending database migrations. |
| `npm run lint` | `eslint` | Lint the codebase. |
| `npm test` | `vitest run` | Run the test suite once. |
| `npm run test:watch` | `vitest` | Run tests in watch mode. |

## Testing

Run the test suite once:

```bash
npm test
```

Run tests in watch mode during development:

```bash
npm run test:watch
```

Run the linter:

```bash
npm run lint
```

Run a TypeScript type check. There is no dedicated script for this, so it uses the TypeScript compiler directly:

```bash
npx tsc --noEmit
```

Tests are written with Vitest. Test counts and coverage figures are not stated here because they have not been verified.

## Important Technical Decisions

### Money handling

- All monetary values are stored and calculated as **integer poisha** (1 BDT = 100 poisha), using JavaScript `BigInt` in application code.
- PostgreSQL `BIGINT` is used for monetary columns.
- Floating-point arithmetic is deliberately avoided, which prevents rounding drift such as `0.1 + 0.2 !== 0.3`.

### Split calculation and remainder allocation

- **Equal splits:** The total is divided by the number of participants. Any remainder poisha is allocated **deterministically**, so the same input always produces the same result and the shares always sum exactly to the total.
- **Percentage splits:** Percentages are represented as **basis points** (1% = 100 basis points) and distributed using **largest-remainder allocation**. This guarantees the resulting shares add up to the exact expense amount.
- **Exact and shares-based splits:** Exact amounts are entered directly. Shares-based splits distribute the total in proportion to each participant's number of shares.

### Balance calculation

Each member's balance is derived from recorded **expenses** and recorded **settlements**:

- A **positive** balance means the member is **owed** money.
- A **negative** balance means the member **owes** money.

### Settlement algorithm

Settlement suggestions use a **deterministic greedy creditor/debtor matching algorithm**: members who are owed money are matched against members who owe money, and payments are generated until all balances are cleared.

**Limitation:** This approach reduces the number of transactions but does **not guarantee a globally minimum number of transactions** in every scenario. Finding the true minimum is a harder combinatorial problem, and the greedy approach trades optimality for simplicity and predictable output.

### Database constraints

Constraints are defined in the Prisma schema and migrations to protect data integrity. Money is stored as `BIGINT`, and relational integrity is enforced at the database level. Refer to `prisma/schema.prisma` and `prisma/migrations/` for the authoritative definitions.

## bKash Sandbox Integration

FairShare integrates with the **bKash tokenized sandbox checkout API**.

### Sandbox merchant checkout versus manual settlements

These are two separate things:

- **Sandbox merchant checkout:** An optional integration that demonstrates a bKash merchant checkout flow against bKash's sandbox environment. It uses the `BKASH_*` environment variables.
- **Manual member-to-member settlements:** Members record that a payment happened, choosing **Cash**, **bKash**, or **Bank transfer** as the method. Recording a settlement documents a payment made outside the application. The application does not verify it with bKash or any bank.

The sandbox checkout must not be understood as real verification of payments between members.

### Sandbox limitations

- It runs against the bKash **sandbox**, so **no real money** is moved.
- It requires sandbox credentials from bKash, which are not included in this repository.
- Without the `BKASH_*` variables, the rest of the application still works.
- Production bKash payment processing is not implemented.

## Project Structure

The repository follows the standard Next.js App Router layout. The main items are:

```text
fairshare/
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── migrations/       # Prisma migration history
├── scripts/              # Project utility scripts
├── prisma.config.ts      # Prisma CLI configuration
├── .env.example          # Example environment variables
├── package.json          # Dependencies and npm scripts
└── ...                   # Next.js App Router source, configuration, and tests
```

This overview lists only the top-level items that are certain to exist. For the full, current file layout, browse the repository on GitHub: https://github.com/ShantoSarkar34/fairshare

## Deployment

FairShare is deployed on **Vercel**, with its database hosted on **Neon** PostgreSQL.

- **Live URL:** https://get-fairshare.vercel.app/

### Deploying your own instance

1. Create a Neon PostgreSQL database and note both the **pooled** and **direct** connection strings.
2. Import the GitHub repository into Vercel.
3. In the Vercel project settings, add the following environment variables:
   - `DATABASE_URL` (Neon pooled connection)
   - `DIRECT_URL` (Neon direct connection)
   - `BETTER_AUTH_SECRET` (a newly generated, private secret)
   - `BETTER_AUTH_URL` (your production URL, for example `https://get-fairshare.vercel.app`)
   - Optionally, the `BKASH_*` variables for sandbox checkout
4. Apply migrations to the production database:

   ```bash
   npm run db:deploy
   ```

   Run this with `DIRECT_URL` pointing at the production database.
5. Deploy. Vercel runs `npm install`, which triggers `prisma generate` through the `postinstall` script, and then builds the application with `npm run build`.

## Security Considerations

- **Secrets stay out of version control.** Credentials such as `BETTER_AUTH_SECRET`, database URLs, and bKash keys belong in environment variables. Never commit a real `.env` file.
- **Authentication** is handled by Better Auth, with session signing protected by `BETTER_AUTH_SECRET`.
- **Input validation** uses Zod to validate data on the way in.
- **Integer money arithmetic** avoids floating-point errors that could cause incorrect balances.
- **bKash credentials** are read from environment variables and must only be used server-side. They must never be exposed to the browser.
- **Sandbox only:** bKash integration is limited to the sandbox, so no real funds are at risk.
- **Database access** uses a pooled connection at runtime and a separate direct connection for migrations.

## License

No license has been specified for this project. Unless a license file is added to the repository, all rights are reserved by the author, and the code is provided for assessment and review purposes.