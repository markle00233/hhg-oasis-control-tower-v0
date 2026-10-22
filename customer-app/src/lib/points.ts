import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export const POINTS_ENABLED = true;

/** Legacy flat check-in (off — dùng điểm theo doanh thu). */
export const CHECKIN_POINTS = 5;

/** 10.000đ (trước giảm giá) = 1 điểm. */
export const POINTS_PER_10K = 1;

export type PointRefType = "SERVICE_EVENT" | "SERVICE_CART" | "APP_ORDER";

export function pointsFromSubtotal(subtotalVnd: number) {
  const base = Math.max(0, Math.round(Number(subtotalVnd) || 0));
  return Math.floor(base / 10_000) * POINTS_PER_10K;
}

export async function awardCheckInPoints(opts: {
  customerId: string;
  refType: PointRefType;
  refId: string;
  note?: string;
}) {
  if (!POINTS_ENABLED) {
    return { awarded: false as const, balance: 0, delta: 0 };
  }
  void opts;
  return { awarded: false as const, balance: 0, delta: 0 };
}

/** Điểm theo tiền hàng trước giảm giá (10k = 1 điểm), idempotent theo ref. */
export async function awardPurchasePoints(opts: {
  customerId: string;
  refType: PointRefType;
  refId: string;
  subtotalVnd: number;
  note?: string;
}) {
  if (!POINTS_ENABLED) {
    return { awarded: false as const, balance: 0, delta: 0 };
  }
  const refId = opts.refId.trim();
  const delta = pointsFromSubtotal(opts.subtotalVnd);
  if (!opts.customerId || !refId || delta <= 0) {
    const c = opts.customerId
      ? await prisma.appCustomer.findUnique({
          where: { id: opts.customerId },
          select: { pointsBalance: true },
        })
      : null;
    return {
      awarded: false as const,
      balance: c?.pointsBalance ?? 0,
      delta: 0,
    };
  }

  const existing = await prisma.appPointLedger.findFirst({
    where: {
      reason: "PURCHASE",
      refType: opts.refType,
      refId,
    },
    select: { id: true, balanceAfter: true },
  });
  if (existing) {
    const c = await prisma.appCustomer.findUnique({
      where: { id: opts.customerId },
      select: { pointsBalance: true },
    });
    return {
      awarded: false as const,
      balance: c?.pointsBalance ?? existing.balanceAfter,
      delta: 0,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.appCustomer.update({
        where: { id: opts.customerId },
        data: { pointsBalance: { increment: delta } },
        select: { pointsBalance: true },
      });
      await tx.appPointLedger.create({
        data: {
          customerId: opts.customerId,
          delta,
          balanceAfter: customer.pointsBalance,
          reason: "PURCHASE",
          refType: opts.refType,
          refId,
          note:
            opts.note ||
            `+${delta}đ điểm · ${Math.round(opts.subtotalVnd)}đ trước giảm`,
        },
      });
      return customer.pointsBalance;
    });
    return { awarded: true as const, balance: result, delta };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const c = await prisma.appCustomer.findUnique({
        where: { id: opts.customerId },
        select: { pointsBalance: true },
      });
      return {
        awarded: false as const,
        balance: c?.pointsBalance ?? 0,
        delta: 0,
      };
    }
    throw e;
  }
}

export {
  REDEEM_TIER_DRINK,
  REDEEM_TIER_SWIM,
  REDEEM_DRINK_MAX_VND,
  computeGuestPointsRedeem,
  parsePointsRedeemFromCartItems,
  cartHasVoucherItem,
} from "./points-redeem";

/**
 * Trừ đủ `cost` điểm (idempotent). Không đủ → throws { status: 400 }.
 */
export async function redeemPoints(opts: {
  customerId: string;
  cost: number;
  refType: PointRefType | "DESK_REDEEM";
  refId: string;
  note?: string;
}) {
  if (!POINTS_ENABLED) {
    return { redeemed: false as const, balance: 0, delta: 0 };
  }
  const refId = opts.refId.trim();
  const cost = Math.round(Number(opts.cost) || 0);
  if (!opts.customerId || !refId || cost <= 0) {
    const c = opts.customerId
      ? await prisma.appCustomer.findUnique({
          where: { id: opts.customerId },
          select: { pointsBalance: true },
        })
      : null;
    return {
      redeemed: false as const,
      balance: c?.pointsBalance ?? 0,
      delta: 0,
    };
  }

  const existing = await prisma.appPointLedger.findFirst({
    where: { reason: "REDEEM", refType: opts.refType, refId },
    select: { id: true, balanceAfter: true, delta: true },
  });
  if (existing) {
    const c = await prisma.appCustomer.findUnique({
      where: { id: opts.customerId },
      select: { pointsBalance: true },
    });
    return {
      redeemed: false as const,
      balance: c?.pointsBalance ?? existing.balanceAfter,
      delta: existing.delta,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.appCustomer.findUnique({
        where: { id: opts.customerId },
        select: { pointsBalance: true },
      });
      if (!before) {
        throw Object.assign(new Error("Khách không tồn tại."), { status: 404 });
      }
      if (before.pointsBalance < cost) {
        throw Object.assign(
          new Error(
            `Không đủ điểm (cần ${cost}, đang có ${before.pointsBalance}).`
          ),
          { status: 400 }
        );
      }
      const customer = await tx.appCustomer.update({
        where: { id: opts.customerId },
        data: { pointsBalance: { decrement: cost } },
        select: { pointsBalance: true },
      });
      await tx.appPointLedger.create({
        data: {
          customerId: opts.customerId,
          delta: -cost,
          balanceAfter: customer.pointsBalance,
          reason: "REDEEM",
          refType: opts.refType,
          refId,
          note: opts.note || `Đổi −${cost} điểm`,
        },
      });
      return customer.pointsBalance;
    });
    return { redeemed: true as const, balance: result, delta: -cost };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const c = await prisma.appCustomer.findUnique({
        where: { id: opts.customerId },
        select: { pointsBalance: true },
      });
      return {
        redeemed: false as const,
        balance: c?.pointsBalance ?? 0,
        delta: 0,
      };
    }
    throw e;
  }
}

/** Hoàn điểm khi quầy từ chối / khách xoá yêu cầu đã đổi điểm. */
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

/** Hoàn điểm đã đổi và thu điểm đã cộng cho các ref của vé / đơn bị huỷ. */
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
