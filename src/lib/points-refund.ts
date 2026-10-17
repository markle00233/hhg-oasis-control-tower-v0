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
