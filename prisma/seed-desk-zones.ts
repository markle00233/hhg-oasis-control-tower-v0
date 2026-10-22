/**
 * Seed zone-desk accounts (1 khu = 1 acc + 1 acc admin khu).
 * - Acc khu: MIAOI, SPA, … · password HHG_PASSWORD_DESK_ZONES
 * - Acc admin khu: ADMINISTRATIONMIAOI, … · password 12345678
 *
 * Usage: npx tsx prisma/seed-desk-zones.ts
 * Reset passwords: HHG_SEED_RESET_PASSWORDS=true npx tsx prisma/seed-desk-zones.ts
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { DESK_ZONES, zoneAdminUsername } from "../src/lib/desk-zones";

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

/** Password cố định theo yêu cầu cho acc ADMINISTRATION{khu}. */
const ZONE_ADMIN_PASSWORD = "12345678";
/** Admin tile on the zone picker. Same account as global ADMINISTRATION. */
const ADMIN_PANEL_PASSWORD = "12345678!";

async function upsertDeskUser(opts: {
  username: string;
  displayName: string;
  deskZone: string;
  passwordHash: string;
  reset: boolean;
}) {
  const existing = await prisma.user.findUnique({
    where: { username: opts.username },
  });
  if (!existing) {
    await prisma.user.create({
      data: {
        username: opts.username,
        displayName: opts.displayName,
        passwordHash: opts.passwordHash,
        systemRole: "STANDARD_USER",
        status: "ACTIVE",
        deskZone: opts.deskZone,
      },
    });
    return "created" as const;
  }
  await prisma.user.update({
    where: { id: existing.id },
    data: {
      displayName: opts.displayName,
      deskZone: opts.deskZone,
      systemRole: "STANDARD_USER",
      status: "ACTIVE",
      ...(opts.reset ? { passwordHash: opts.passwordHash } : {}),
    },
  });
  return "updated" as const;
}

async function main() {
  const plain = process.env.HHG_PASSWORD_DESK_ZONES;
  const reset = process.env.HHG_SEED_RESET_PASSWORDS === "true";
  if (!plain || plain.length < 6) {
    throw new Error(
      "Set HHG_PASSWORD_DESK_ZONES in .env (min 6 chars) before seeding desk zones."
    );
  }

  const staffHash = await hashPassword(plain);
  const adminHash = await hashPassword(ZONE_ADMIN_PASSWORD);
  const created: string[] = [];
  const updated: string[] = [];

  for (const z of DESK_ZONES) {
    const staff = await upsertDeskUser({
      username: z.username,
      displayName: z.name,
      deskZone: z.code,
      passwordHash: staffHash,
      reset,
    });
    (staff === "created" ? created : updated).push(z.username);

    const adminUser = zoneAdminUsername(z.username);
    const admin = await upsertDeskUser({
      username: adminUser,
      displayName: `Admin ${z.name}`,
      deskZone: z.code,
      passwordHash: adminHash,
      // Luôn đồng bộ mk 12345678 khi seed (acc mới theo yêu cầu).
      reset: true,
    });
    (admin === "created" ? created : updated).push(adminUser);
  }

  const administrationHash = await hashPassword(ADMIN_PANEL_PASSWORD);
  const administration = await prisma.user.findUnique({
    where: { username: "ADMINISTRATION" },
  });
  if (!administration) {
    await prisma.user.create({
      data: {
        username: "ADMINISTRATION",
        displayName: "ADMINISTRATION",
        passwordHash: administrationHash,
        systemRole: "SYSTEM_ADMIN",
        status: "ACTIVE",
      },
    });
    created.push("ADMINISTRATION");
  } else {
    await prisma.user.update({
      where: { id: administration.id },
      data: {
        passwordHash: administrationHash,
        systemRole: "SYSTEM_ADMIN",
        status: "ACTIVE",
      },
    });
    updated.push("ADMINISTRATION");
  }

  console.log("[seed-desk-zones] ok", { created, updated, reset });
  console.log(
    "[seed-desk-zones] zone admin usernames:",
    DESK_ZONES.map((z) => zoneAdminUsername(z.username)).join(", ")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
