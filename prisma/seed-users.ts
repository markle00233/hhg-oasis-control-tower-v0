/**
 * Idempotent User seed for P1.
 *
 * Passwords MUST come from env (never hardcoded):
 *   HHG_PASSWORD_NGHIAPHAM
 *   HHG_PASSWORD_TIENPHAM
 *   HHG_PASSWORD_MICAHPHAM
 *   HHG_PASSWORD_HOANGLE
 *   HHG_PASSWORD_ANHNAM
 *   HHG_PASSWORD_ADMINISTRATION
 *
 * Behavior:
 * - Creates missing users with hashed password from env.
 * - If user exists: updates displayName/systemRole when needed;
 *   does NOT overwrite passwordHash unless HHG_SEED_RESET_PASSWORDS=true.
 * - No UnitAssignment.
 * - Never logs password values.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient, SystemRole } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

/** Load .env then .env.local (later wins). Always apply for seed scripts. */
function loadEnvFiles() {
  for (const name of [".env", ".env.local"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

loadEnvFiles();

const INITIAL_USERS: Array<{
  username: string;
  systemRole: SystemRole;
  envKey: string;
}> = [
  { username: "NGHIAPHAM", systemRole: "STANDARD_USER", envKey: "HHG_PASSWORD_NGHIAPHAM" },
  { username: "TIENPHAM", systemRole: "STANDARD_USER", envKey: "HHG_PASSWORD_TIENPHAM" },
  { username: "MICAHPHAM", systemRole: "STANDARD_USER", envKey: "HHG_PASSWORD_MICAHPHAM" },
  { username: "HOANGLE", systemRole: "STANDARD_USER", envKey: "HHG_PASSWORD_HOANGLE" },
  { username: "ANHNAM", systemRole: "STANDARD_USER", envKey: "HHG_PASSWORD_ANHNAM" },
  {
    username: "ADMINISTRATION",
    systemRole: "SYSTEM_ADMIN",
    envKey: "HHG_PASSWORD_ADMINISTRATION",
  },
];

export async function seedUsers(prisma: PrismaClient) {
  const resetPasswords = process.env.HHG_SEED_RESET_PASSWORDS === "true";
  const created: string[] = [];
  const skippedExisting: string[] = [];
  const passwordReset: string[] = [];
  const missingEnv: string[] = [];

  for (const row of INITIAL_USERS) {
    const existing = await prisma.user.findUnique({
      where: { username: row.username },
    });

    if (existing) {
      skippedExisting.push(row.username);
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          displayName: existing.displayName || row.username,
          systemRole: row.systemRole,
        },
      });

      if (resetPasswords) {
        const plain = process.env[row.envKey];
        if (!plain) {
          missingEnv.push(row.envKey);
          continue;
        }
        const passwordHash = await hashPassword(plain);
        await prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash },
        });
        passwordReset.push(row.username);
      }
      continue;
    }

    const plain = process.env[row.envKey];
    if (!plain) {
      missingEnv.push(row.envKey);
      continue;
    }

    const passwordHash = await hashPassword(plain);
    await prisma.user.create({
      data: {
        username: row.username,
        displayName: row.username,
        passwordHash,
        systemRole: row.systemRole,
        status: "ACTIVE",
      },
    });
    created.push(row.username);
  }

  if (missingEnv.length) {
    throw new Error(
      `Missing required password env for User seed: ${missingEnv.join(", ")}. ` +
        `Set each HHG_PASSWORD_* in deployment config. No insecure defaults are used.`
    );
  }

  console.log(
    `[seed-users] created=${created.length} existing=${skippedExisting.length} passwordResets=${passwordReset.length}`
  );
  if (created.length) console.log(`[seed-users] created: ${created.join(", ")}`);
  if (passwordReset.length)
    console.log(`[seed-users] password reset: ${passwordReset.join(", ")}`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedUsers(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  /seed-users\.(ts|js)$/.test(process.argv[1].replace(/\\/g, "/"));

if (isDirect) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
