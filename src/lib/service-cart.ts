import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { CART_STATUS } from "./cart-status";

export type CartItemInput = {
  id: string;
  nameVi: string;
  qty: number;
  priceVnd: number;
  note?: string;
};

function customerAppUrl() {
  return (
    process.env.NEXT_PUBLIC_CUSTOMER_APP_URL ||
    process.env.CUSTOMER_APP_URL ||
    "https://huyhoanggiaoasis.vercel.app"
  ).replace(/\/$/, "");
}

export function serviceCartQrPayload(token: string) {
  return `${customerAppUrl()}/q/${encodeURIComponent(token)}`;
}

/** Desk / CRM: tạo cart (mặc định PENDING; walk-in có thể OPEN). */
export async function createServiceCart(opts: {
  customerId: string;
  zoneCode: string;
  zoneName?: string;
  items: CartItemInput[];
  ttlHours?: number;
  discountVnd?: number;
  /** PENDING_APPROVAL | OPEN */
  status?: string;
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

  if (!items.length) throw new Error("Chọn ít nhất 1 dịch vụ.");

  const subtotal = items.reduce((s, i) => s + i.priceVnd * i.qty, 0);
  const discountVnd = Math.min(
    subtotal,
    Math.max(0, Math.round(Number(opts.discountVnd) || 0))
  );
  const totalVnd = Math.max(0, subtotal - discountVnd);
  const ttlHours = opts.ttlHours ?? 48;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  const status =
    opts.status === CART_STATUS.OPEN ? CART_STATUS.OPEN : CART_STATUS.PENDING;

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
          status,
          expiresAt,
        },
      });
      return {
        cart,
        payload: serviceCartQrPayload(cart.token),
        discountVnd,
      };
    } catch {
      // unique collision
    }
  }
  throw new Error("Không tạo được yêu cầu dịch vụ.");
}
