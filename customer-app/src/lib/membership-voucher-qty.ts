import type { PrismaClient } from "@prisma/client";
import {
  isDurationMembershipVoucher,
  isLimitedMembershipVoucher,
  packageIdFromVipPlanLabel,
  qtyForOlympicVoucher,
} from "@/lib/hhg-vouchers";

type Tx = Pick<PrismaClient, "appCollectedOffer" | "appCustomer">;

/** Gán / backfill qtyTotal + qtyRemaining theo gói đang hiệu lực. */
export async function ensureMembershipVoucherQty(
  prisma: Tx,
  opts: {
    customerId: string;
    offerId: string;
    packageId?: string | null;
    /** true = reset về đủ số lần (gắn gói mới) */
    reset?: boolean;
  }
) {
  if (!isDurationMembershipVoucher(opts.offerId)) return null;

  let packageId = opts.packageId || null;
  if (!packageId) {
    const c = await prisma.appCustomer.findUnique({
      where: { id: opts.customerId },
      select: { vipPlanLabel: true },
    });
    packageId = packageIdFromVipPlanLabel(c?.vipPlanLabel);
  }
  if (!packageId) return null;

  const granted = qtyForOlympicVoucher(packageId, opts.offerId);
  const row = await prisma.appCollectedOffer.findUnique({
    where: {
      customerId_offerId: {
        customerId: opts.customerId,
        offerId: opts.offerId,
      },
    },
  });
  if (!row) return null;

  if (granted == null) {
    // Unlimited trong hạn gói
    if (row.qtyTotal != null || row.qtyRemaining != null) {
      return prisma.appCollectedOffer.update({
        where: { id: row.id },
        data: { qtyTotal: null, qtyRemaining: null },
      });
    }
    return row;
  }

  if (opts.reset || row.qtyTotal == null || row.qtyRemaining == null) {
    return prisma.appCollectedOffer.update({
      where: { id: row.id },
      data: {
        status: "COLLECTED",
        qtyTotal: granted,
        qtyRemaining: granted,
        usedAt: null,
      },
    });
  }
  return row;
}

/**
 * Trừ 1 lần dùng voucher hội viên có giới hạn.
 * Unlimited (Mía %) → không trừ, nhưng chỉ khi gói còn hạn.
 * Hết lần → throw status 409; thẻ vẫn COLLECTED.
 */
export async function consumeMembershipVoucherUse(
  prisma: Tx,
  opts: { customerId: string; offerId: string }
): Promise<{
  qtyTotal: number | null;
  qtyRemaining: number | null;
  unlimited: boolean;
}> {
  const { customerId, offerId } = opts;
  if (!isDurationMembershipVoucher(offerId)) {
    throw Object.assign(new Error("Not a membership voucher"), { status: 400 });
  }

  const customer = await prisma.appCustomer.findUnique({
    where: { id: customerId },
    select: { segment: true, vipExpiresAt: true, vipPlanLabel: true },
  });
  const { isVipActive } = await import("@/lib/vip");
  if (
    !isVipActive({
      segment: customer?.segment,
      vipExpiresAt: customer?.vipExpiresAt,
    })
  ) {
    const exp = customer?.vipExpiresAt
      ? new Date(customer.vipExpiresAt).toLocaleDateString("vi-VN")
      : null;
    throw Object.assign(
      new Error(
        exp
          ? `Voucher hội viên hết hạn cùng gói (đã hết ${exp}).`
          : "Voucher hội viên chỉ dùng trong thời hạn gói."
      ),
      { status: 409 }
    );
  }

  await ensureMembershipVoucherQty(prisma, { customerId, offerId });

  const row = await prisma.appCollectedOffer.findUnique({
    where: { customerId_offerId: { customerId, offerId } },
  });
  if (!row || row.status !== "COLLECTED") {
    throw Object.assign(new Error("Không có voucher để dùng."), {
      status: 404,
    });
  }

  if (!isLimitedMembershipVoucher(offerId) || row.qtyTotal == null) {
    // Mía %: dùng suốt từ ngày nâng cấp → hết hạn gói, không trừ lượt
    return {
      qtyTotal: null,
      qtyRemaining: null,
      unlimited: true,
    };
  }

  const left = row.qtyRemaining ?? 0;
  if (left <= 0) {
    throw Object.assign(
      new Error("Đã hết lượt voucher này (0/" + row.qtyTotal + ")."),
      { status: 409 }
    );
  }

  const next = left - 1;
  const updated = await prisma.appCollectedOffer.update({
    where: { id: row.id },
    data: {
      qtyRemaining: next,
      usedAt: new Date(),
      // Giữ COLLECTED dù 0 — thẻ vẫn hiện, không dùng thêm
      status: "COLLECTED",
    },
  });

  return {
    qtyTotal: updated.qtyTotal,
    qtyRemaining: updated.qtyRemaining,
    unlimited: false,
  };
}

/** Hoàn 1 lần (khi quầy từ chối / khách huỷ vé chưa dùng). */
export async function refundMembershipVoucherUse(
  prisma: Tx,
  opts: { customerId: string; offerId: string }
) {
  if (!isLimitedMembershipVoucher(opts.offerId)) return null;
  const row = await prisma.appCollectedOffer.findUnique({
    where: {
      customerId_offerId: {
        customerId: opts.customerId,
        offerId: opts.offerId,
      },
    },
  });
  if (!row || row.qtyTotal == null) return null;
  const cur = row.qtyRemaining ?? 0;
  if (cur >= row.qtyTotal) return row;
  return prisma.appCollectedOffer.update({
    where: { id: row.id },
    data: {
      qtyRemaining: cur + 1,
      status: "COLLECTED",
    },
  });
}
