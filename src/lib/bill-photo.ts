/** Ảnh bill gửi từ quầy: JPEG/PNG/WebP data URL, đã thu nhỏ phía client. */
export function parseBillPhoto(raw: unknown): string | null {
  const dataUrl = String(raw || "").trim();
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(dataUrl)) {
    return null;
  }
  if (dataUrl.length < 80 || dataUrl.length > 1_200_000) return null;
  return dataUrl;
}

export const BILL_PHOTO_REQUIRED = "Gắn ảnh bill trước khi chốt đơn.";

/** Đơn khách gửi: quầy gắn ảnh bill để xác nhận, giống gói bơi. */
const BILL_PHOTO_ZONES = new Set([
  "LONG_NUONG",
  "PICKLEBALL",
  "SPA",
  "SAUNA",
  "MIA_OI",
  "MIA_OLYMPIC",
  "OLYMPIC_POOL",
  "OLYMPIC",
  "VIP",
  "VIP_RESORT",
  "GYM",
  "RESORT_POOL",
  "RESORT",
  "JACUZZI",
]);

export function zoneRequiresBillPhoto(zone: string | null | undefined) {
  return BILL_PHOTO_ZONES.has((zone || "").trim().toUpperCase());
}
export const BILL_PHOTO_LOCKED = "Đơn đã chốt, không đổi được ảnh bill.";

/** Đơn đã lưu trên lần quét, không có giỏ. */
export const EVENT_BILL_PREFIX = "event:";

export function eventBillToken(eventId: string) {
  return `${EVENT_BILL_PREFIX}${eventId}`;
}

export function eventIdFromBillToken(token: string) {
  return token.startsWith(EVENT_BILL_PREFIX)
    ? token.slice(EVENT_BILL_PREFIX.length)
    : "";
}

/** Khách xoá / từ chối / hết hạn — không gắn chứng từ. */
export function billOrderClosed(status?: string | null) {
  const s = (status || "").toUpperCase();
  return s === "CANCELLED" || s === "REJECTED" || s === "EXPIRED";
}

const IN_SERVICE_ZONES = new Set(["LONG_NUONG", "SAUNA", "SPA"]);

/**
 * Ảnh đã có trên đơn đã chốt thì không đổi.
 * Đơn chưa có ảnh vẫn bổ sung được sau khi thanh toán xong.
 * Đơn đóng (huỷ / từ chối / hết hạn) không gắn chứng từ.
 */
export function billEvidenceFrozen(cart: {
  status?: string | null;
  adminNote?: string | null;
  zoneCode?: string | null;
}): boolean {
  if (billOrderClosed(cart.status)) return true;
  if ((cart.adminNote || "").trim() === "Đã dùng") return true;
  const zone = (cart.zoneCode || "").toUpperCase();
  if (IN_SERVICE_ZONES.has(zone)) return false;
  return (cart.status || "").toUpperCase() === "USED";
}
