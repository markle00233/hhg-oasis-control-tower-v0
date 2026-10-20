import { prisma } from "./prisma";
import {
  isDurationMembershipVoucher,
  isLimitedMembershipVoucher,
} from "./hhg-vouchers";
import { consumeMembershipVoucherUse } from "./membership-voucher-qty";

export function voucherTokenFromScan(raw: string) {
  const text = String(raw || "").trim();
  if (text.startsWith("vr_")) return text;
  const match = text.match(/\/v\/(vr_[A-Za-z0-9_-]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function zonesMatch(deskZone: string, voucherZone: string) {
  const desk = deskZone.toUpperCase();
  const voucher = voucherZone.toUpperCase();
  if (desk === "SPA" || desk === "SAUNA") {
    return voucher === "SPA" || voucher === "SAUNA";
  }
  if (desk === "LONG_NUONG" || desk === "CHI_PHEO") {
    return voucher === "LONG_NUONG" || voucher === "CHI_PHEO";
  }
  return desk === voucher;
}

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

/**
 * Staff scan of a Spa / Lòng Nướng voucher QR.
 * Valid → consume the voucher and write a claim log.
 * Already scanned → return the existing log, do not consume again.
 */
export async function redeemVoucherScan(opts: {
  raw: string;
  deskZone: string;
  staffUserId: string;
  staffName: string;
}) {
  const token = voucherTokenFromScan(opts.raw);
  if (!token) return null;

  const row = await prisma.appVoucherRedemption.findUnique({
    where: { token },
    include: {
      customer: {
        select: {
          id: true,
          status: true,
          fullName: true,
          phone: true,
          customerCode: true,
          shortId: true,
          phoneLast4: true,
          segment: true,
        },
      },
    },
  });
  if (!row || !row.customer || row.customer.status !== "ACTIVE") {
    throw httpError("QR voucher không hợp lệ.", 404);
  }
  if (!zonesMatch(opts.deskZone, row.zoneCode)) {
    throw httpError("Voucher này không dùng tại khu này.", 400);
  }

  if (row.status === "SCANNED") {
    const log = row.claimLogId
      ? await prisma.appOfferClaimLog.findUnique({ where: { id: row.claimLogId } })
      : null;
    return {
      already: true,
      voucher: row,
      log,
      customer: row.customer,
    };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw httpError("Mã voucher đã hết hạn. Khách tạo QR lại.", 409);
  }

  const result = await prisma.$transaction(async (tx) => {
    const won = await tx.appVoucherRedemption.updateMany({
      where: { id: row.id, status: "OPEN" },
      data: {
        status: "SCANNED",
        scannedAt: new Date(),
        scannedByName: opts.staffName,
      },
    });
    if (won.count === 0) {
      const again = await tx.appVoucherRedemption.findUnique({
        where: { id: row.id },
      });
      const log = again?.claimLogId
        ? await tx.appOfferClaimLog.findUnique({ where: { id: again.claimLogId } })
        : null;
      return { already: true as const, voucher: again || row, log };
    }

    const offer = await tx.appCollectedOffer.findUnique({
      where: {
        customerId_offerId: {
          customerId: row.customerId,
          offerId: row.offerId,
        },
      },
    });
    if (!offer || offer.status !== "COLLECTED") {
      throw httpError("Voucher không còn trong ví khách.", 409);
    }

    if (
      isDurationMembershipVoucher(row.offerId) &&
      isLimitedMembershipVoucher(row.offerId)
    ) {
      const used = await consumeMembershipVoucherUse(tx, {
        customerId: row.customerId,
        offerId: row.offerId,
      });
      if (used.qtyRemaining != null && used.qtyRemaining <= 0) {
        await tx.appCollectedOffer.update({
          where: { id: offer.id },
          data: { status: "USED", usedAt: new Date(), qtyRemaining: 0 },
        });
      }
    } else {
      await tx.appCollectedOffer.update({
        where: { id: offer.id },
        data: { status: "USED", usedAt: new Date() },
      });
    }

    const log = await tx.appOfferClaimLog.create({
      data: {
        customerId: row.customerId,
        offerId: row.offerId,
        offerTitle: row.offerTitle,
        zoneCode: opts.deskZone.toUpperCase(),
        claimedByUserId: opts.staffUserId,
        claimedByName: opts.staffName,
        phoneSnapshot: row.customer.phone,
        note: `Quét QR voucher · ${row.token}`,
      },
    });
    const voucher = await tx.appVoucherRedemption.update({
      where: { id: row.id },
      data: { claimLogId: log.id },
    });
    return { already: false as const, voucher, log };
  });

  return {
    already: result.already,
    voucher: result.voucher,
    log: result.log,
    customer: row.customer,
  };
}
