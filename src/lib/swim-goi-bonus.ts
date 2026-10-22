import type { Prisma } from "@prisma/client";
import { SPA_GOI_BONUS_ID } from "@/lib/spa-menu";
import { normalizePhone } from "@/lib/phone";

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

function goiQty(items: { itemId: string; qty: number }[]) {
  return items.reduce(
    (n, line) =>
      line.itemId === SPA_GOI_BONUS_ID ? n + Math.max(0, Math.round(line.qty) || 0) : n,
    0
  );
}

/** Spend swim-student lượt tự chọn for Gội 30' lines. Same ref spends only the new quantity. */
export async function consumeGoiBonus(
  tx: Tx,
  opts: {
    customerId: string;
    items: { itemId: string; qty: number }[];
    refId: string;
    staffId?: string | null;
  }
) {
  const qty = goiQty(opts.items);
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
    throw Object.assign(new Error("Khách chưa có SĐT để trừ lượt gội."), {
      status: 409,
    });
  }

  const students = await tx.appSwimStudent.findMany({
    where: {
      status: "ACTIVE",
      bonusVisitsTotal: { gt: 0 },
      OR: [
        { phoneNormalized: { in: uniqueKeys } },
        { phone: { in: uniqueKeys } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  const student = students[0];
  if (!student) {
    throw Object.assign(
      new Error("Khách không có lượt tự chọn để dùng Gội 30'."),
      { status: 409 }
    );
  }

  const prior = await tx.appAuditLog.findMany({
    where: { action: "SWIM_GOI_BONUS", entityId: opts.refId },
    select: { payload: true },
  });
  const already = prior.reduce((n, row) => {
    const payload =
      row.payload && typeof row.payload === "object"
        ? (row.payload as { spent?: number })
        : null;
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

  for (let i = 0; i < need; i++) {
    const spent = await tx.appSwimStudent.updateMany({
      where: { id: student.id, bonusVisitsLeft: { gte: 1 } },
      data: { bonusVisitsLeft: { decrement: 1 } },
    });
    if (spent.count !== 1) {
      throw Object.assign(new Error("Đã hết lượt tự chọn."), { status: 409 });
    }
    await tx.appSwimBonusLog.create({
      data: { studentId: student.id, purpose: "Gội 30'" },
    });
  }
  await tx.appAuditLog.create({
    data: {
      actorType: "STAFF",
      actorId: opts.staffId || null,
      action: "SWIM_GOI_BONUS",
      entityType: "CART",
      entityId: opts.refId,
      zoneCode: "SAUNA",
      payload: { studentId: student.id, spent: need, purpose: "Gội 30'" },
    },
  });
  const fresh = await tx.appSwimStudent.findUnique({
    where: { id: student.id },
    select: { bonusVisitsLeft: true },
  });
  return { spent: need, left: fresh?.bonusVisitsLeft ?? 0 };
}
