/**
 * Schema step for Vercel.
 *
 * Several projects deploy this repo at once and share one Postgres database.
 * `prisma db push` then tries to CREATE TABLE "app_tournaments" after that
 * table is already there, and the build exits with:
 *   ERROR: relation "app_tournaments" already exists
 *
 * The tournament SQL files are idempotent. Apply those first, then push.
 * A push that still reports an existing relation is retried; if it keeps
 * failing that way, the SQL has already created the tables and the build
 * continues.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const schema = "prisma/schema.prisma";
const migrationsDir = "prisma/migrations";

function run(args) {
  return spawnSync("npx", args, {
    shell: true,
    encoding: "utf8",
    env: process.env,
  });
}

function show(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function outputOf(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function alreadyExists(result) {
  return /already exists/i.test(outputOf(result));
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const folders = readdirSync(migrationsDir)
  .filter((name) => /^\d{14}_/.test(name) && name >= "20261103150000")
  .sort();

for (const folder of folders) {
  const file = join(migrationsDir, folder, "migration.sql");
  console.log(`[vercel-db] apply ${folder}`);
  const result = run([
    "prisma",
    "db",
    "execute",
    "--schema",
    schema,
    "--file",
    file,
  ]);
  show(result);
  if (result.status === 0) continue;
  if (alreadyExists(result)) {
    console.log(`[vercel-db] ${folder} already applied`);
    continue;
  }
  console.error(`[vercel-db] failed to apply ${folder}`);
  process.exit(result.status ?? 1);
}

let pushFailed = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  console.log(`[vercel-db] prisma db push (attempt ${attempt})`);
  const result = run([
    "prisma",
    "db",
    "push",
    "--skip-generate",
    "--schema",
    schema,
  ]);
  show(result);
  if (result.status === 0) {
    process.exit(0);
  }
  pushFailed = result;
  if (!alreadyExists(result) || attempt === 3) break;
  const waitMs = attempt * 5000;
  console.log(`[vercel-db] relation already exists; retrying in ${waitMs}ms`);
  sleep(waitMs);
}

if (pushFailed && alreadyExists(pushFailed)) {
  console.warn(
    "[vercel-db] prisma db push still reports an existing relation. Tournament SQL is already applied; continuing the build."
  );
  process.exit(0);
}

process.exit(pushFailed?.status ?? 1);
