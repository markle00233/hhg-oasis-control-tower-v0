import { prisma } from "./prisma";

/** Hoàn điểm khi quầy từ chối / huỷ yêu cầu đã đổi điểm. */
export async function refundRedeemPoints(opts: {
  customerId: string;
  cost: number;
  refId: string;
  note?: string;
}) {
  const cost = Math.round(Number(opts.cost) || 0);
  const refundRef = `refund:${opts.refId}`;
  if (!opts.customerId || cost <= 0) {
    return { refunded: false as const, balance: 0 };
  }
  const existing = await prisma.appPointLedger.findFirst({
    where: {
      reason: "ADJUST",
      refType: "SERVICE_CART",
      refId: refundRef,
    },
  });
  if (existing) {
    const c = await prisma.appCustomer.findUnique({
      where: { id: opts.customerId },
      select: { pointsBalance: true },
    });
    return { refunded: false as const, balance: c?.pointsBalance ?? 0 };
  }
  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.appCustomer.update({
      where: { id: opts.customerId },
      data: { pointsBalance: { increment: cost } },
      select: { pointsBalance: true },
    });
    await tx.appPointLedger.create({
      data: {
        customerId: opts.customerId,
        delta: cost,
        balanceAfter: customer.pointsBalance,
        reason: "ADJUST",
        refType: "SERVICE_CART",
        refId: refundRef,
        note: opts.note || `Hoàn +${cost} điểm (huỷ đổi điểm)`,
      },
    });
    return customer.pointsBalance;
  });
  return { refunded: true as const, balance: result };
}

/** Thu lại điểm đã cộng cho đơn bị huỷ. Idempotent theo ref. Không âm số dư. */
export async function clawbackPurchasePoints(opts: {
  customerId: string;
  amount: number;
  refId: string;
  note?: string;
}) {
  const amount = Math.round(Number(opts.amount) || 0);
  const clawRef = `clawback:${opts.refId}`;
  if (!opts.customerId || !opts.refId || amount <= 0) {
    return { clawed: false as const, amount: 0, balance: 0 };
  }
  const existing = await prisma.appPointLedger.findFirst({
    where: {
      reason: "ADJUST",
      refType: "APP_ORDER",
      refId: clawRef,
    },
  });
  if (existing) {
    const c = await prisma.appCustomer.findUnique({
      where: { id: opts.customerId },
      select: { pointsBalance: true },
    });
    return {
      clawed: false as const,
      amount: 0,
      balance: c?.pointsBalance ?? 0,
    };
  }
  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.appCustomer.findUnique({
      where: { id: opts.customerId },
      select: { pointsBalance: true },
    });
    const balance = before?.pointsBalance ?? 0;
    const take = Math.min(amount, Math.max(0, balance));
    if (take <= 0) {
      await tx.appPointLedger.create({
        data: {
          customerId: opts.customerId,
          delta: 0,
          balanceAfter: balance,
          reason: "ADJUST",
          refType: "APP_ORDER",
          refId: clawRef,
          note: opts.note || `Không còn điểm để thu (đơn đã cộng ${amount})`,
        },
      });
      return { amount: 0, balance };
    }
    const customer = await tx.appCustomer.update({
      where: { id: opts.customerId },
      data: { pointsBalance: { decrement: take } },
      select: { pointsBalance: true },
    });
    await tx.appPointLedger.create({
      data: {
        customerId: opts.customerId,
        delta: -take,
        balanceAfter: customer.pointsBalance,
        reason: "ADJUST",
        refType: "APP_ORDER",
        refId: clawRef,
        note:
          opts.note ||
          (take < amount
            ? `Thu −${take}/${amount} điểm (huỷ đơn)`
            : `Thu −${take} điểm (huỷ đơn)`),
      },
    });
    return { amount: take, balance: customer.pointsBalance };
  });
  return { clawed: true as const, amount: result.amount, balance: result.balance };
}

/**
 * Huỷ đơn / vé: hoàn mọi REDEEM và thu mọi PURCHASE gắn các ref này.
 * Ref điển hình: cart id, order id, `mia-extra:${orderId}`, `redeem:${orderId}`.
 */
export async function settlePointsOnCancel(opts: {
  customerId: string;
  refIds: string[];
  note?: string;
}) {
  const refIds = [
    ...new Set(opts.refIds.map((id) => id.trim()).filter(Boolean)),
  ];
  const current = async () => {
    const c = await prisma.appCustomer.findUnique({
      where: { id: opts.customerId },
      select: { pointsBalance: true },
    });
    return c?.pointsBalance ?? 0;
  };
  if (!opts.customerId || !refIds.length) {
    return { refunded: 0, clawed: 0, balance: opts.customerId ? await current() : 0 };
  }
  const rows = await prisma.appPointLedger.findMany({
    where: {
      customerId: opts.customerId,
      refId: { in: refIds },
      reason: { in: ["REDEEM", "PURCHASE"] },
    },
    select: { reason: true, refId: true, delta: true },
  });
  let refunded = 0;
  let clawed = 0;
  let balance = await current();
  for (const row of rows) {
    const refId = row.refId || "";
    if (!refId) continue;
    if (row.reason === "REDEEM" && row.delta < 0) {
      const result = await refundRedeemPoints({
        customerId: opts.customerId,
        cost: -row.delta,
        refId,
        note: opts.note,
      });
      if (result.refunded) refunded += -row.delta;
      balance = result.balance;
    } else if (row.reason === "PURCHASE" && row.delta > 0) {
      const result = await clawbackPurchasePoints({
        customerId: opts.customerId,
        amount: row.delta,
        refId,
        note: opts.note,
      });
      if (result.clawed) clawed += result.amount;
      balance = result.balance;
    }
  }
  return { refunded, clawed, balance };
}
