/**
 * On Vercel: migrate the same Postgres the app uses (demo fallback when env missing/SQLite).
 */
import { spawnSync } from "node:child_process";

const DEMO_DATABASE_URL =
  "postgres://fc3e13ae4866abe68dfcee5c9633b2d8891a3475d31f275e1039b49b736c2e62:sk_WH68hkA-6qINchebn8SoI@db.prisma.io:5432/postgres?sslmode=require";

const raw = process.env.DATABASE_URL || "";
if (!raw || raw.startsWith("file:") || raw.includes("localhost") || process.env.VERCEL) {
  // Match src/lib/prisma.ts runtime fallback so migrate hits the live app DB
  if (process.env.VERCEL || !raw || raw.startsWith("file:") || raw.includes("localhost")) {
    process.env.DATABASE_URL = DEMO_DATABASE_URL;
  }
}

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("file:")) {
  console.warn("[build] Skip prisma migrate deploy — no Postgres URL.");
  process.exit(0);
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});
process.exit(result.status ?? 1);
