import { randomBytes } from "crypto";
import { getOfferById } from "./home-services";
import {
  isDurationMembershipVoucher,
  isLimitedMembershipVoucher,
} from "./hhg-vouchers";
import { prisma } from "./prisma";
import { publicAppUrl } from "./services";
import { isVipActive } from "./vip";

const TTL_HOURS = 48;

export type VoucherPassView = {
  token: string;
  offerId: string;
  offerTitle: string;
  zoneCode: string;
  status: string;
  payload: string;
  expiresAt: string;
  scannedAt: string | null;
  scannedByName: string | null;
};

export function isStaffScanVoucher(offerId: string) {
  const zone = String(getOfferById(offerId)?.zoneCode || "").toUpperCase();
  return (
    zone === "SPA" ||
    zone === "SAUNA" ||
    zone === "LONG_NUONG" ||
    zone === "CHI_PHEO"
  );
}

export function voucherQrPayload(token: string) {
  return `${publicAppUrl()}/v/${encodeURIComponent(token)}`;
}

function toView(row: {
  token: string;
  offerId: string;
  offerTitle: string;
  zoneCode: string;
  status: string;
  expiresAt: Date;
  scannedAt: Date | null;
  scannedByName: string | null;
}): VoucherPassView {
  return {
    token: row.token,
    offerId: row.offerId,
    offerTitle: row.offerTitle,
    zoneCode: row.zoneCode,
    status: row.status,
    payload: voucherQrPayload(row.token),
    expiresAt: row.expiresAt.toISOString(),
    scannedAt: row.scannedAt ? row.scannedAt.toISOString() : null,
    scannedByName: row.scannedByName,
  };
}

export async function issueVoucherPasses(customerId: string, offerIds: string[]) {
  const ids = [...new Set(offerIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) throw Object.assign(new Error("Chọn voucher."), { status: 400 });

  const customer = await prisma.appCustomer.findUnique({
    where: { id: customerId },
    select: { id: true, segment: true, vipExpiresAt: true, status: true },
  });
  if (!customer || customer.status !== "ACTIVE") {
    throw Object.assign(new Error("Khách không hợp lệ."), { status: 404 });
  }

  const passes: VoucherPassView[] = [];
  for (const offerId of ids) {
    passes.push(await issueOne(customer, offerId));
  }
  return passes;
}

async function issueOne(
  customer: { id: string; segment: string; vipExpiresAt: Date | null },
  offerId: string
) {
  const offer = getOfferById(offerId);
  if (!offer || !isStaffScanVoucher(offerId)) {
    throw Object.assign(
      new Error("Chỉ voucher Spa và Lòng Nướng có mã QR riêng."),
      { status: 400 }
    );
  }

  const row = await prisma.appCollectedOffer.findUnique({
    where: { customerId_offerId: { customerId: customer.id, offerId } },
  });
  if (!row || row.status !== "COLLECTED") {
    throw Object.assign(new Error("Không có voucher này trong ví."), { status: 404 });
  }

  const membership = isDurationMembershipVoucher(offerId);
  if (
    membership &&
    !isVipActive({
      segment: customer.segment,
      vipExpiresAt: customer.vipExpiresAt,
    })
  ) {
    throw Object.assign(
      new Error("Voucher hội viên chỉ dùng trong thời hạn gói."),
      { status: 409 }
    );
  }
  if (
    isLimitedMembershipVoucher(offerId) &&
    row.qtyTotal != null &&
    (row.qtyRemaining ?? 0) <= 0
  ) {
    throw Object.assign(new Error("Đã hết lượt voucher này."), { status: 409 });
  }

  const open = await prisma.appVoucherRedemption.findFirst({
    where: {
      customerId: customer.id,
      offerId,
      status: "OPEN",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (open) return toView(open);

  const zoneCode =
    offer.zoneCode.toUpperCase() === "LONG_NUONG" ||
    offer.zoneCode.toUpperCase() === "CHI_PHEO"
      ? "LONG_NUONG"
      : "SPA";
  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = `vr_${randomBytes(16).toString("base64url")}`;
    try {
      const created = await prisma.appVoucherRedemption.create({
        data: {
          token,
          customerId: customer.id,
          offerId,
          offerTitle: offer.title,
          zoneCode,
          status: "OPEN",
          expiresAt,
        },
      });
      return toView(created);
    } catch {
      // unique collision
    }
  }
  throw Object.assign(new Error("Không tạo được QR voucher."), { status: 500 });
}

export async function findVoucherPass(rawToken: string) {
  const token = decodeURIComponent(String(rawToken || "").trim()).replace(
    /^.*\/v\//,
    ""
  );
  if (!token.startsWith("vr_")) return null;
  const row = await prisma.appVoucherRedemption.findUnique({
    where: { token },
    include: {
      customer: {
        select: { fullName: true, customerCode: true, shortId: true },
      },
    },
  });
  if (!row) return null;
  return {
    ...toView(row),
    customerName: row.customer.fullName,
    customerCode: row.customer.customerCode,
    shortId: row.customer.shortId,
  };
}
