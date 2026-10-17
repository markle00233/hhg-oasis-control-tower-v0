import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { publicAppUrl } from "./services";

export type CartItemInput = {
  id: string;
  nameVi: string;
  qty: number;
  priceVnd: number;
  note?: string;
};

/** PENDING_APPROVAL → desk duyệt → OPEN → USED | REJECTED | NO_SHOW | CANCELLED */
export const CART_STATUS = {
  PENDING: "PENDING_APPROVAL",
  OPEN: "OPEN",
  USED: "USED",
  REJECTED: "REJECTED",
  NO_SHOW: "NO_SHOW",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;

export function serviceCartQrPayload(token: string) {
  return `${publicAppUrl()}/q/${encodeURIComponent(token)}`;
}

export async function createServiceCart(opts: {
  customerId: string;
  zoneCode: string;
  zoneName?: string;
  items: CartItemInput[];
  /** hours until expiry */
  ttlHours?: number;
  discountVnd?: number;
  /** @deprecated use offerIds */
  offerId?: string;
  offerIds?: string[];
  /** 50 | 100 — đổi điểm ngay khi tạo QR (trừ điểm sau khi tạo cart) */
  pointsRedeemTier?: number | null;
  pointsRedeemDiscountVnd?: number;
}) {
  const items = opts.items
    .map((i) => ({
      id: String(i.id || "").trim(),
      nameVi: String(i.nameVi || "").trim().slice(0, 200),
      qty: Math.min(Math.max(Number(i.qty) || 1, 1), 20),
      priceVnd: Math.max(0, Math.round(Number(i.priceVnd) || 0)),
      note: i.note ? String(i.note).slice(0, 200) : undefined,
    }))
    .filter((i) => i.id && i.nameVi);

  if (!items.length) {
    throw new Error("Chọn ít nhất 1 dịch vụ.");
  }

  const offerIds = Array.from(
    new Set(
      [
        ...(Array.isArray(opts.offerIds) ? opts.offerIds : []),
        opts.offerId || "",
      ]
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );

  const subtotal = items.reduce((s, i) => s + i.priceVnd * i.qty, 0);
  let discountVnd = Math.min(
    subtotal,
    Math.max(0, Math.round(Number(opts.discountVnd) || 0))
  );
  if (offerIds.length) {
    items.push({
      id: `voucher-${offerIds.join("+")}`,
      nameVi:
        offerIds.length > 1
          ? `Voucher ×${offerIds.length}`
          : `Voucher giảm`,
      qty: 1,
      priceVnd: 0,
      note:
        discountVnd > 0
          ? `-${discountVnd}đ · ${offerIds.join(", ")}`
          : offerIds.join(", "),
    });
  }

  const redeemTier = Math.round(Number(opts.pointsRedeemTier) || 0);
  const redeemDiscount = Math.max(
    0,
    Math.round(Number(opts.pointsRedeemDiscountVnd) || 0)
  );
  if (redeemTier === 50 || redeemTier === 100) {
    const afterVoucher = Math.max(0, subtotal - discountVnd);
    const ptsDisc = Math.min(afterVoucher, redeemDiscount || afterVoucher);
    discountVnd = Math.min(subtotal, discountVnd + ptsDisc);
    items.push({
      id: `points-redeem-${redeemTier}`,
      nameVi: `Đổi ${redeemTier} điểm`,
      qty: 1,
      priceVnd: 0,
      note:
        ptsDisc > 0
          ? `−${ptsDisc}đ · chờ quầy xác nhận`
          : `−${redeemTier} điểm · chờ quầy xác nhận`,
    });
  }

  const totalVnd = Math.max(0, subtotal - discountVnd);
  const ttlHours = opts.ttlHours ?? 48;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = `sc_${randomBytes(16).toString("base64url")}`;
    try {
      const cart = await prisma.appServiceCart.create({
        data: {
          token,
          customerId: opts.customerId,
          zoneCode: opts.zoneCode,
          zoneName: opts.zoneName || null,
          items,
          totalVnd,
          status: CART_STATUS.PENDING,
          expiresAt,
        },
      });
      return {
        cart,
        payload: serviceCartQrPayload(cart.token),
        discountVnd,
        offerIds,
        pointsRedeemTier: redeemTier === 50 || redeemTier === 100 ? redeemTier : null,
      };
    } catch {
      // unique collision
    }
  }
  throw new Error("Không tạo được yêu cầu dịch vụ.");
}

export async function findServiceCartByToken(raw: string) {
  const token = decodeURIComponent(raw.trim()).replace(/^.*\/q\//, "");
  if (!token.startsWith("sc_")) return null;
  const cart = await prisma.appServiceCart.findUnique({
    where: { token },
    include: {
      customer: {
        select: {
          id: true,
          customerCode: true,
          fullName: true,
          shortId: true,
          phoneLast4: true,
        },
      },
    },
  });
  if (!cart) return null;
  if (
    cart.expiresAt < new Date() &&
    (cart.status === CART_STATUS.OPEN || cart.status === CART_STATUS.PENDING)
  ) {
    await prisma.appServiceCart
      .update({ where: { id: cart.id }, data: { status: CART_STATUS.EXPIRED } })
      .catch(() => undefined);
    return { ...cart, status: CART_STATUS.EXPIRED };
  }
  return cart;
}
