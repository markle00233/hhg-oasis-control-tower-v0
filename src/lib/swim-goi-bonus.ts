import type { Prisma } from "@prisma/client";
import { POOL_SWIM_BONUS_ID } from "@/lib/olympic-pool-menu";
import { SPA_GOI_BONUS_ID } from "@/lib/spa-menu";
import { normalizePhone } from "@/lib/phone";
import {
  swimBonusStartedAfter,
  type SwimBonusPurpose,
} from "@/lib/swim-packages";

type Tx = Prisma.TransactionClient;

export function phoneKeys(raw: string | null | undefined) {
  const digits = String(raw || "").replace(/\D/g, "");
  const keys = new Set<string>();
  if (digits.length < 9) return [];
  keys.add(normalizePhone(digits));
  keys.add(digits);
  const stripped = digits.replace(/^0+/, "");
  if (stripped.length >= 9) {
    keys.add(stripped);
    keys.add(`0${stripped}`);
  }
  return [...keys];
}

function lineQty(items: { itemId: string; qty: number }[], itemId: string) {
  return items.reduce(
    (n, line) =>
      line.itemId === itemId ? n + Math.max(0, Math.round(line.qty) || 0) : n,
    0
  );
}

const SWIM_BONUS_ACTION = "SWIM_GOI_BONUS";

/** Spend swim-student lượt tự chọn. The same ref spends only the new quantity. */
export async function consumeSwimBonus(
  tx: Tx,
  opts: {
    customerId: string;
    items: { itemId: string; qty: number }[];
    refId: string;
    staffId?: string | null;
    itemId: string;
    purpose: SwimBonusPurpose;
    zoneCode: string;
    emptyMessage: string;
  }
) {
  const qty = lineQty(opts.items, opts.itemId);
  if (qty <= 0 || !opts.refId) return { spent: 0, left: null as number | null };

  const customer = await tx.appCustomer.findUnique({
    where: { id: opts.customerId },
    select: { phone: true, phoneNormalized: true },
  });
  const keys = [
    ...phoneKeys(customer?.phoneNormalized),
    ...phoneKeys(customer?.phone),
  ];
  const uniqueKeys = [...new Set(keys)];
  if (!uniqueKeys.length) {
    throw Object.assign(new Error("Khách chưa có SĐT để trừ lượt tự chọn."), {
      status: 409,
    });
  }

  const now = new Date();
  const students = await tx.appSwimStudent.findMany({
    where: {
      status: "ACTIVE",
      bonusVisitsTotal: { gt: 0 },
      startedAt: { gt: swimBonusStartedAfter(now) },
      OR: [
        { phoneNormalized: { in: uniqueKeys } },
        { phone: { in: uniqueKeys } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  const student = students[0];
  if (!student) {
    const expired = await tx.appSwimStudent.findFirst({
      where: {
        status: "ACTIVE",
        bonusVisitsTotal: { gt: 0 },
        bonusVisitsLeft: { gt: 0 },
        startedAt: { lte: swimBonusStartedAfter(now) },
        OR: [
          { phoneNormalized: { in: uniqueKeys } },
          { phone: { in: uniqueKeys } },
        ],
      },
      select: { id: true },
    });
    throw Object.assign(
      new Error(
        expired
          ? "Lượt tự chọn chỉ dùng trong 30 ngày kể từ ngày đăng ký."
          : opts.emptyMessage
      ),
      { status: 409 }
    );
  }

  const prior = await tx.appAuditLog.findMany({
    where: { action: SWIM_BONUS_ACTION, entityId: opts.refId },
    select: { payload: true },
  });
  const already = prior.reduce((n, row) => {
    const payload =
      row.payload && typeof row.payload === "object"
        ? (row.payload as { spent?: number; purpose?: string })
        : null;
    if (payload?.purpose && payload.purpose !== opts.purpose) return n;
    return n + Math.max(0, Math.round(Number(payload?.spent) || 0));
  }, 0);
  const need = qty - already;
  if (need <= 0) return { spent: 0, left: student.bonusVisitsLeft };
  if (student.bonusVisitsLeft < need) {
    throw Object.assign(
      new Error(
        student.bonusVisitsLeft <= 0
          ? "Đã hết lượt tự chọn."
          : `Chỉ còn ${student.bonusVisitsLeft} lượt tự chọn.`
      ),
      { status: 409 }
    );
  }

  const spent = await tx.appSwimStudent.updateMany({
    where: { id: student.id, bonusVisitsLeft: { gte: need } },
    data: { bonusVisitsLeft: { decrement: need } },
  });
  if (spent.count !== 1) {
    throw Object.assign(new Error("Đã hết lượt tự chọn."), { status: 409 });
  }
  const logIds: string[] = [];
  for (let i = 0; i < need; i++) {
    const log = await tx.appSwimBonusLog.create({
      data: { studentId: student.id, purpose: opts.purpose },
      select: { id: true },
    });
    logIds.push(log.id);
  }
  await tx.appAuditLog.create({
    data: {
      actorType: "STAFF",
      actorId: opts.staffId || null,
      action: SWIM_BONUS_ACTION,
      entityType: "CART",
      entityId: opts.refId,
      zoneCode: opts.zoneCode,
      payload: {
        studentId: student.id,
        spent: need,
        purpose: opts.purpose,
        logIds,
      },
    },
  });
  const fresh = await tx.appSwimStudent.findUnique({
    where: { id: student.id },
    select: { bonusVisitsLeft: true },
  });
  return { spent: need, left: fresh?.bonusVisitsLeft ?? 0 };
}

/** Spend swim-student lượt tự chọn for Gội 30' lines. */
export async function consumeGoiBonus(
  tx: Tx,
  opts: {
    customerId: string;
    items: { itemId: string; qty: number }[];
    refId: string;
    staffId?: string | null;
  }
) {
  return consumeSwimBonus(tx, {
    ...opts,
    itemId: SPA_GOI_BONUS_ID,
    purpose: "Gội 30'",
    zoneCode: "SAUNA",
    emptyMessage: "Khách không có lượt tự chọn để dùng Gội 30'.",
  });
}

/** Spend one self-choice swim from gói bơi for each Bơi tự do line. */
export async function consumePoolSwimBonus(
  tx: Tx,
  opts: {
    customerId: string;
    items: { itemId: string; qty: number }[];
    refId: string;
    staffId?: string | null;
  }
) {
  return consumeSwimBonus(tx, {
    ...opts,
    itemId: POOL_SWIM_BONUS_ID,
    purpose: "Bơi tự do",
    zoneCode: "OLYMPIC_POOL",
    emptyMessage: "Khách không có lượt tự chọn từ gói bơi.",
  });
}

/** Put lượt tự chọn back when a confirmed bill is undone. */
export async function refundSwimBonus(tx: Tx, opts: { refId: string }) {
  if (!opts.refId) return { restored: 0 };
  const rows = await tx.appAuditLog.findMany({
    where: { action: SWIM_BONUS_ACTION, entityId: opts.refId },
  });
  let restored = 0;
  for (const row of rows) {
    const payload =
      row.payload && typeof row.payload === "object"
        ? (row.payload as { studentId?: string; spent?: number; logIds?: string[] })
        : null;
    const spent = Math.max(0, Math.round(Number(payload?.spent) || 0));
    const studentId = String(payload?.studentId || "");
    if (spent > 0 && studentId) {
      const updated = await tx.appSwimStudent.updateMany({
        where: { id: studentId },
        data: { bonusVisitsLeft: { increment: spent } },
      });
      if (updated.count === 1) restored += spent;
    }
    const logIds = Array.isArray(payload?.logIds)
      ? payload.logIds.filter((id) => typeof id === "string" && id)
      : [];
    if (logIds.length) {
      await tx.appSwimBonusLog.deleteMany({ where: { id: { in: logIds } } });
    }
    await tx.appAuditLog.delete({ where: { id: row.id } });
  }
  return { restored };
}
