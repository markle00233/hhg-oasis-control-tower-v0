import { prisma } from "./prisma";
import {
  deskVoucherCut,
  getDeskHhgVoucher,
  isDurationMembershipVoucher,
  isLimitedMembershipVoucher,
  offerMatchesDeskZone,
} from "./hhg-vouchers";
import { consumeMembershipVoucherUse } from "./membership-voucher-qty";
import { isOlympicMembershipActive } from "./olympic-membership";

export function voucherErrorStatus(err: unknown, fallback = 500) {
  if (err && typeof err === "object" && "status" in err) {
    const n = Number((err as { status: number }).status);
    if (Number.isFinite(n) && n >= 400 && n < 600) return n;
  }
  return fallback;
}

export type DeskBillVoucherQuote = {
  offerId: string;
  title: string;
  discountVnd: number;
};

export function deskVoucherNote(q: DeskBillVoucherQuote) {
  if (!q.offerId || q.discountVnd <= 0) return "";
  return `Voucher ${q.title} (−${q.discountVnd.toLocaleString("vi-VN")}đ)`;
}

/** Kiểm tra voucher áp bill, chưa trừ lượt. */
export async function quoteDeskBillVoucher(opts: {
  customerId: string;
  offerId: string;
  zone: string;
  baseVnd: number;
}): Promise<DeskBillVoucherQuote> {
  const offerId = opts.offerId.trim();
  if (!offerId) {
    return { discountVnd: 0, title: "", offerId: "" };
  }
  if (!offerMatchesDeskZone(offerId, opts.zone)) {
    throw Object.assign(new Error("Voucher không dùng tại khu này."), {
      status: 400,
    });
  }
  const meta = getDeskHhgVoucher(offerId);
  if (!meta || (meta.discountType !== "amount" && meta.discountType !== "percent")) {
    throw Object.assign(new Error("Voucher không áp vào bill."), {
      status: 400,
    });
  }
  const row = await prisma.appCollectedOffer.findUnique({
    where: {
      customerId_offerId: {
        customerId: opts.customerId,
        offerId,
      },
    },
  });
  if (!row || row.status !== "COLLECTED") {
    throw Object.assign(
      new Error("Khách không có voucher này (chưa thu thập hoặc đã dùng)."),
      { status: 404 }
    );
  }
  if (
    row.qtyTotal != null &&
    (row.qtyRemaining == null || row.qtyRemaining <= 0)
  ) {
    throw Object.assign(new Error("Đã hết lượt voucher này."), { status: 409 });
  }
  if (isDurationMembershipVoucher(offerId)) {
    const customer = await prisma.appCustomer.findUnique({
      where: { id: opts.customerId },
      select: { segment: true, vipExpiresAt: true },
    });
    if (
      !isOlympicMembershipActive({
        segment: customer?.segment,
        vipExpiresAt: customer?.vipExpiresAt,
      })
    ) {
      const exp = customer?.vipExpiresAt
        ? customer.vipExpiresAt.toLocaleDateString("vi-VN")
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
  }
  return {
    discountVnd: deskVoucherCut(opts.baseVnd, meta),
    title: meta.title,
    offerId,
  };
}

/** Trừ lượt / ghi log sau khi đơn đã tạo. */
export async function consumeDeskBillVoucher(opts: {
  customerId: string;
  offerId: string;
  zone: string;
  staffUserId: string;
  staffName: string;
  baseVnd: number;
  note?: string;
}) {
  const quoted = await quoteDeskBillVoucher(opts);
  if (!quoted.offerId) return quoted;

  const offerId = quoted.offerId;
  if (isDurationMembershipVoucher(offerId)) {
    await consumeMembershipVoucherUse(prisma, {
      customerId: opts.customerId,
      offerId,
    });
  } else {
    await prisma.appCollectedOffer.update({
      where: {
        customerId_offerId: {
          customerId: opts.customerId,
          offerId,
        },
      },
      data: { status: "USED", usedAt: new Date() },
    });
  }

  await prisma.appOfferClaimLog.create({
    data: {
      customerId: opts.customerId,
      offerId,
      offerTitle: quoted.title,
      zoneCode: opts.zone.toUpperCase(),
      claimedByUserId: opts.staffUserId,
      claimedByName: opts.staffName,
      note: opts.note || `Dùng voucher trên bill quầy ${opts.zone}`,
    },
  });

  return quoted;
}

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
