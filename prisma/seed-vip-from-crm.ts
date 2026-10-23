/**
 * Sync CRM membership list (hhgoasis-crm DB) → My Oasis AppCustomer VIP + vouchers.
 *
 * Reads DATABASE_URL from hhgoasistonghop/.env (CRM)
 * Writes into Control Tower DATABASE_URL (.env root)
 *
 * Usage: npx tsx prisma/seed-vip-from-crm.ts
 * Login: SĐT · mật khẩu tạm: oasisvip
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const tower = new PrismaClient();
const TEMP_PASSWORD = "oasisvip";

type CrmRow = {
  customerCode: string;
  fullName: string;
  phone: string;
  phoneNormalized: string;
  planLabel: string;
  planCode: string;
  expiresAt: Date;
  active: boolean;
};

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return {} as Record<string, string>;
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}

function normalizePhone(raw: string) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("84") && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  if (digits.length === 9 && !digits.startsWith("0")) {
    digits = `0${digits}`;
  }
  return digits;
}

function phoneShortId(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-4) || null;
}

function olympicPackageFromPlan(planName: string, planCode: string) {
  const s = `${planName} ${planCode}`.toUpperCase();
  if (s.includes("12")) return "oly-12m";
  if (s.includes("6")) return "oly-6m";
  if (s.includes("3")) return "oly-3m";
  if (s.includes("1")) return "oly-1m";
  return "oly-3m";
}

function vouchersForPackage(pkg?: string) {
  if (!pkg) return [] as string[];
  const map: Record<string, string[]> = {
    "oly-1m": ["hhg-oly-spa-goi"],
    "oly-3m": ["hhg-oly-spa-massage", "hhg-oly-ln-100k"],
    "oly-6m": ["hhg-oly-spa-massage", "hhg-oly-ln-100k"],
    "oly-12m": ["hhg-oly-spa-massage", "hhg-oly-ln-100k"],
  };
  return map[pkg] || [];
}

async function loadFromCrmDb(): Promise<CrmRow[]> {
  const crmEnv = loadEnvFile(
    path.join(process.cwd(), "hhgoasistonghop", ".env")
  );
  const crmUrl =
    process.env.CRM_DATABASE_URL ||
    crmEnv.CRM_DATABASE_URL ||
    crmEnv.DATABASE_URL ||
    "";
  if (!crmUrl) {
    throw new Error(
      "Thiếu CRM DATABASE_URL (hhgoasistonghop/.env hoặc CRM_DATABASE_URL)."
    );
  }

  const crm = new PrismaClient({
    datasources: { db: { url: crmUrl } },
  });

  try {
    const rows = await crm.$queryRaw<
      Array<{
        customerCode: string;
        fullName: string;
        phone: string | null;
        phoneNormalized: string | null;
        planName: string | null;
        planCode: string | null;
        memStatus: string | null;
        expiryDate: Date | null;
      }>
    >(Prisma.sql`
      SELECT
        c."customerCode",
        c."fullName",
        c."phone",
        c."phoneNormalized",
        p."name" AS "planName",
        p."planCode" AS "planCode",
        m."status" AS "memStatus",
        m."expiryDate" AS "expiryDate"
      FROM "Customer" c
      INNER JOIN "Membership" m ON m."customerId" = c."id"
      LEFT JOIN "MembershipPlan" p ON p."id" = m."planId"
      WHERE c."status" = 'ACTIVE'
      ORDER BY c."customerCode" ASC, m."expiryDate" DESC
    `);

    const now = Date.now();
    const byCode = new Map<string, CrmRow>();
    for (const r of rows) {
      if (byCode.has(r.customerCode)) continue; // latest expiry first
      const phoneNormalized = normalizePhone(
        r.phoneNormalized || r.phone || ""
      );
      const exp = r.expiryDate ? new Date(r.expiryDate) : new Date();
      const active =
        String(r.memStatus || "").toUpperCase() === "ACTIVE" &&
        exp.getTime() > now;
      byCode.set(r.customerCode, {
        customerCode: r.customerCode,
        fullName: r.fullName,
        phone: r.phone || phoneNormalized,
        phoneNormalized,
        planLabel: r.planName || "Hội viên CRM",
        planCode: r.planCode || "",
        expiresAt: exp,
        active,
      });
    }
    return [...byCode.values()];
  } finally {
    await crm.$disconnect();
  }
}

async function upsertAppVip(row: CrmRow, passwordHash: string) {
  const last4 = phoneShortId(row.phoneNormalized || row.customerCode);
  const username = row.phoneNormalized || row.customerCode;

  const existing = await tower.appCustomer.findFirst({
    where: {
      OR: [
        ...(row.phoneNormalized
          ? [
              { phoneNormalized: row.phoneNormalized },
              { username: row.phoneNormalized },
            ]
          : []),
        { customerCode: row.customerCode },
        { username: row.customerCode },
      ],
    },
  });

  const vip = row.active;
  const data = {
    fullName: row.fullName,
    phone: row.phone || null,
    phoneNormalized: row.phoneNormalized || null,
    phoneLast4: last4,
    shortId: last4,
    segment: vip ? "VIP" : "WALK_IN",
    vipExpiresAt: vip ? row.expiresAt : null,
    vipPlanLabel: vip ? row.planLabel : null,
    status: "ACTIVE" as const,
  };

  let customerId: string;
  let loginCode = row.customerCode;

  if (existing) {
    await tower.appCustomer.update({
      where: { id: existing.id },
      data: { ...data, passwordHash, username },
    });
    customerId = existing.id;
    loginCode = existing.customerCode;
  } else {
    try {
      const created = await tower.appCustomer.create({
        data: {
          customerCode: row.customerCode,
          username,
          passwordHash,
          ...data,
        },
      });
      customerId = created.id;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        const created = await tower.appCustomer.create({
          data: {
            customerCode: `${row.customerCode}-M`,
            username: `${username}-m`,
            passwordHash,
            ...data,
          },
        });
        customerId = created.id;
        loginCode = created.customerCode;
      } else {
        throw e;
      }
    }
  }

  const pkg = olympicPackageFromPlan(row.planLabel, row.planCode);
  const offers = vip ? vouchersForPackage(pkg) : [];
  for (const offerId of offers) {
    await tower.appCollectedOffer.upsert({
      where: { customerId_offerId: { customerId, offerId } },
      create: { customerId, offerId, status: "COLLECTED" },
      update: { status: "COLLECTED", usedAt: null },
    });
  }

  return {
    customerId,
    vip,
    offers,
    login: row.phoneNormalized || loginCode,
  };
}

async function main() {
  const rows = await loadFromCrmDb();
  console.log(`[seed-vip] CRM membership unique customers=${rows.length}`);

  const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 10);
  const summary: unknown[] = [];
  let vipCount = 0;

  for (const row of rows) {
    const r = await upsertAppVip(row, passwordHash);
    if (r.vip) vipCount += 1;
    summary.push({
      code: row.customerCode,
      name: row.fullName,
      phone: row.phoneNormalized || "(no phone)",
      vip: r.vip,
      plan: row.planLabel,
      expires: row.expiresAt.toISOString().slice(0, 10),
      vouchers: r.offers,
      login: r.login,
      password: TEMP_PASSWORD,
    });
  }

  console.log(JSON.stringify(summary, null, 2));
  console.log(
    `[seed-vip] done vip=${vipCount}/${rows.length} password=${TEMP_PASSWORD}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => tower.$disconnect());
