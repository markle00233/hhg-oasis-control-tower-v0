/**
 * Import khách VIP Full từ bảng Sep 2026.
 * Bỏ qua STT 17–18 (Đoạt giải nhất).
 */
import { PrismaClient } from "@prisma/client";
import { ensureCustomerReceiptDrafts } from "../src/lib/service-contract-drafts";
import { insertMembership } from "../src/lib/membership-write";
import { logActivity, nextCode } from "../src/lib/codes";

const prisma = new PrismaClient();

type Row = {
  stt: number;
  fullName: string;
  phone?: string;
  packageLabel: string;
  start: string;
  end: string;
  amount: number | null;
  sheetNote: string;
  prize?: "DOAT_GIAI" | "DOAT_GIAI_NHAT";
};

const ROWS: Row[] = [
  {
    stt: 1,
    fullName: "Nguyễn Phương Thảo",
    phone: "0389954975",
    packageLabel: "12T + 4T",
    start: "2026-07-02",
    end: "2027-11-02",
    amount: 7_560_000,
    sheetNote: "gói số 4 + 4 tháng",
  },
  {
    stt: 2,
    fullName: "Nguyễn Thành Trung",
    phone: "0967423959",
    packageLabel: "3T + 1T",
    start: "2026-07-24",
    end: "2026-11-24",
    amount: 2_700_000,
    sheetNote: "gói số 2 + 1 tháng",
  },
  {
    stt: 3,
    fullName: "Nguyễn Thị Ngọc Hằng",
    phone: "0971070503",
    packageLabel: "3T + 1T",
    start: "2026-07-21",
    end: "2026-11-21",
    amount: 2_700_000,
    sheetNote: "gói số 2 + 1 tháng",
  },
  {
    stt: 4,
    fullName: "Nguyễn Huỳnh Phương",
    phone: "0933846505",
    packageLabel: "3T + 1T",
    start: "2026-07-25",
    end: "2026-11-25",
    amount: 2_700_000,
    sheetNote: "gói số 2 + 1 tháng",
  },
  {
    stt: 5,
    fullName: "Bùi Nhựt Trường",
    phone: "0909254336",
    packageLabel: "3T + 1T",
    start: "2026-07-25",
    end: "2026-11-25",
    amount: 2_700_000,
    sheetNote: "gói số 2 + 1 tháng",
  },
  {
    stt: 6,
    fullName: "Đặng Thanh Hải",
    phone: "0931301889",
    packageLabel: "12T + 4T",
    start: "2026-07-29",
    end: "2027-11-02",
    amount: 7_560_000,
    sheetNote: "gói số 4 + 4 tháng",
  },
  {
    stt: 7,
    fullName: "Trần Quốc Trị",
    phone: "0909182968",
    packageLabel: "12T + 4T",
    start: "2026-07-25",
    end: "2027-11-02",
    amount: 7_800_000,
    sheetNote: "gói số 4 + 4 tháng",
  },
  {
    stt: 8,
    fullName: "Nguyễn Anh Khoa",
    phone: "0907222260",
    packageLabel: "6T + 2T",
    start: "2026-08-04",
    end: "2027-06-04",
    amount: 4_800_000,
    sheetNote: "gói số 3 + 2 tháng",
  },
  {
    stt: 9,
    fullName: "Huỳnh Thị Anh Thư",
    phone: "0907652060",
    packageLabel: "6T + 2T",
    start: "2026-08-04",
    end: "2027-06-04",
    amount: 4_800_000,
    sheetNote: "gói số 3 + 2 tháng",
  },
  {
    stt: 10,
    fullName: "Nguyễn Anh Khôi",
    phone: "0907692080",
    packageLabel: "1T",
    start: "2026-08-04",
    end: "2026-09-04",
    amount: 1_000_000,
    sheetNote: "gói số 1",
  },
  {
    stt: 11,
    fullName: "Anh Thanh",
    packageLabel: "12T + 4T",
    start: "2026-09-10",
    end: "2028-01-10",
    amount: 7_020_000,
    sheetNote: "gói số 4 + 4 tháng",
  },
  {
    stt: 12,
    fullName: "Võ Thị Bé Hèn",
    phone: "0937865139",
    packageLabel: "3T + 1T",
    start: "2026-08-11",
    end: "2026-12-11",
    amount: 2_700_000,
    sheetNote: "gói số 2 + 1 tháng",
  },
  {
    stt: 13,
    fullName: "Nguyễn Thị Bích Ngọc",
    phone: "0939397029",
    packageLabel: "1T",
    start: "2026-08-18",
    end: "2026-09-18",
    amount: 1_000_000,
    sheetNote: "gói số 1",
  },
  {
    stt: 14,
    fullName: "Thành Lộc",
    phone: "0979146744",
    packageLabel: "1T",
    start: "2026-08-11",
    end: "2026-09-11",
    amount: null,
    sheetNote: "gói số 1",
    prize: "DOAT_GIAI",
  },
  {
    stt: 15,
    fullName: "Anh Hùng",
    phone: "0919822480",
    packageLabel: "1T",
    start: "2026-08-11",
    end: "2026-09-11",
    amount: null,
    sheetNote: "gói số 1",
    prize: "DOAT_GIAI",
  },
  {
    stt: 16,
    fullName: "Minh Phú",
    phone: "0937197086",
    packageLabel: "1T",
    start: "2026-08-11",
    end: "2026-09-11",
    amount: null,
    sheetNote: "gói số 1",
    prize: "DOAT_GIAI",
  },
  {
    stt: 19,
    fullName: "Anh Quân",
    packageLabel: "12T + 4T",
    start: "2026-09-01",
    end: "2028-01-01",
    amount: 7_020_000,
    sheetNote: "gói số 4 + 4 tháng",
  },
  {
    stt: 20,
    fullName: "Nguyễn Hoàng Vũ",
    packageLabel: "3T + 1T",
    start: "2026-08-24",
    end: "2026-12-21",
    amount: 2_700_000,
    sheetNote: "gói số 2 + 1 tháng",
  },
  {
    stt: 21,
    fullName: "Chị Nhi",
    packageLabel: "3T + 1T",
    start: "2026-08-24",
    end: "2026-12-21",
    amount: 2_700_000,
    sheetNote: "gói số 2 + 1 tháng",
  },
  {
    stt: 22,
    fullName: "Nguyễn Gia Khiêm",
    packageLabel: "3T + 1T",
    start: "2026-08-31",
    end: "2026-12-31",
    amount: 2_700_000,
    sheetNote: "gói số 2 + 1 tháng",
  },
];

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

function planCodeFromSheetNote(note: string): string {
  if (/gói số 4/i.test(note)) return "PKG_VIP_12M";
  if (/gói số 3/i.test(note)) return "PKG_VIP_6M";
  if (/gói số 2/i.test(note)) return "PKG_VIP_3M";
  return "PKG_VIP_1M";
}

function vipLabelFromNote(note: string): string {
  if (/gói số 4/i.test(note)) return "VIP Full · 12 tháng + 4 tháng";
  if (/gói số 3/i.test(note)) return "VIP Full · 6 tháng + 2 tháng";
  if (/gói số 2/i.test(note)) return "VIP Full · 3 tháng + 1 tháng";
  return "VIP Full · 1 tháng";
}

function monthsBetween(start: Date, end: Date): number {
  return (
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    (end.getDate() >= start.getDate() ? 0 : -1)
  );
}

function expectedTotalMonths(label: string): number | null {
  const m = label.match(/(\d+)\s*T\s*\+\s*(\d+)\s*T/i);
  if (m) return Number(m[1]) + Number(m[2]);
  const single = label.match(/^(\d+)\s*T$/i);
  if (single) return Number(single[1]);
  return null;
}

function buildMembershipNote(row: Row): string {
  const parts = [vipLabelFromNote(row.sheetNote), row.sheetNote];
  if (row.amount != null) parts.push(`${row.amount.toLocaleString("vi-VN")}đ`);
  if (row.prize === "DOAT_GIAI") parts.push("Đoạt giải");
  return parts.join(" · ");
}

function buildCustomerNote(row: Row): string {
  return `Import bảng Sep/2026 · STT ${row.stt}`;
}

async function main() {
  const actor = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const actorId = actor?.id ?? null;

  const plans = await prisma.membershipPlan.findMany({
    where: { planCode: { startsWith: "PKG_VIP_" } },
  });
  const planByCode = new Map(plans.map((p) => [p.planCode, p]));

  console.log(`Import ${ROWS.length} khách VIP Full (bỏ STT 17–18)...`);

  for (const row of ROWS) {
    const phone = row.phone ? normalizePhone(row.phone) : "";
    const phoneNormalized = phone.replace(/\D/g, "");
    const startDate = new Date(row.start);
    const expiryDate = new Date(row.end);
    const planCode = planCodeFromSheetNote(row.sheetNote);
    const plan = planByCode.get(planCode);
    if (!plan) throw new Error(`Missing plan ${planCode}`);

    const totalMonths = monthsBetween(startDate, expiryDate);
    const expected = expectedTotalMonths(row.packageLabel);
    const dateOk =
      expected == null ? "?" : Math.abs(totalMonths - expected) <= 1 ? "OK" : "WARN";
    console.log(
      `[${row.stt}] ${row.fullName} · ${row.packageLabel} · ${totalMonths} tháng (kỳ vọng ${expected ?? "?"}) ${dateOk}`
    );

    if (phoneNormalized) {
      const existing = await prisma.customer.findFirst({
        where: { phoneNormalized },
      });
      if (existing) {
        console.log(`  ↷ Skip — SĐT đã tồn tại: ${existing.customerCode}`);
        continue;
      }
    }

    const customerCode = await nextCode("CUS", "customer");
    const customer = await prisma.customer.create({
      data: {
        customerCode,
        fullName: row.fullName,
        phone,
        phoneNormalized,
        source: "WALK_IN",
        note: buildCustomerNote(row),
      },
    });

    await logActivity({
      customerId: customer.id,
      activityType: "CUSTOMER_CREATED",
      title: "Customer Created (import)",
      note: `STT ${row.stt}`,
      staffId: actorId ?? undefined,
    });

    await insertMembership({
      customerId: customer.id,
      planId: plan.id,
      planName: plan.name,
      startDate,
      expiryDate,
      note: buildMembershipNote(row),
      actorId,
    });

    await ensureCustomerReceiptDrafts({ customerId: customer.id, actorId });

    console.log(`  ✓ ${customerCode} · ${plan.name}`);
  }

  const counts = {
    customers: await prisma.customer.count(),
    memberships: await prisma.membership.count(),
    contracts: await prisma.serviceContract.count(),
  };
  console.log("Done:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
