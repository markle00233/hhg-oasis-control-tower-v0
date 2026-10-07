/**
 * Seed zone-desk accounts (1 khu = 1 acc).
 * Password from HHG_PASSWORD_DESK_ZONES (required for create / reset).
 *
 * Usage: npx tsx prisma/seed-desk-zones.ts
 * Reset passwords: HHG_SEED_RESET_PASSWORDS=true npx tsx prisma/seed-desk-zones.ts
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { DESK_ZONES } from "../src/lib/desk-zones";

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

const prisma = new PrismaClient();

async function main() {
  const plain = process.env.HHG_PASSWORD_DESK_ZONES;
  const reset = process.env.HHG_SEED_RESET_PASSWORDS === "true";
  if (!plain || plain.length < 6) {
    throw new Error(
      "Set HHG_PASSWORD_DESK_ZONES in .env (min 6 chars) before seeding desk zones."
    );
  }

  const passwordHash = await hashPassword(plain);
  const created: string[] = [];
  const updated: string[] = [];

  for (const z of DESK_ZONES) {
    const existing = await prisma.user.findUnique({
      where: { username: z.username },
    });
    if (!existing) {
      await prisma.user.create({
        data: {
          username: z.username,
          displayName: z.name,
          passwordHash,
          systemRole: "STANDARD_USER",
          status: "ACTIVE",
          deskZone: z.code,
        },
      });
      created.push(z.username);
      continue;
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        displayName: z.name,
        deskZone: z.code,
        systemRole: "STANDARD_USER",
        status: "ACTIVE",
        ...(reset ? { passwordHash } : {}),
      },
    });
    updated.push(z.username);
  }

  console.log("[seed-desk-zones] ok", { created, updated, reset });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
