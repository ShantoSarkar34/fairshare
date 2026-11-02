import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // The CLI (migrate, db push, studio) connects through the DIRECT URL.
    // The running app uses DATABASE_URL via the adapter in src/lib/db/prisma.ts.
    url: env("DIRECT_URL"),
  },
});