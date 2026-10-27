/**
 * Idempotent global admin for the desk login screen.
 * Runs during vercel-build, after prisma db push.
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { ADMIN_PANEL_USERNAME } from "../src/lib/admin-panel";
import { ensureAdminPanelUser } from "../src/lib/ensure-admin-panel";

/** Fill missing keys only. Vercel already provides DATABASE_URL; a local file must not replace it. */
function loadEnvFiles() {
  const fromFiles: Record<string, string> = {};
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
      fromFiles[key] = val;
    }
  }
  for (const [key, val] of Object.entries(fromFiles)) {
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFiles();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to ensure the admin panel account.");
  }
  const prisma = new PrismaClient();
  try {
    const action = await ensureAdminPanelUser(prisma);
    let host = "unknown";
    try {
      host = new URL(process.env.DATABASE_URL || "").host;
    } catch {
      host = "unparsed";
    }
    console.log(`[ensure-admin-panel] ${action} ${ADMIN_PANEL_USERNAME} @ ${host}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
