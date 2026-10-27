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
  "OLYMPIC_POOL",
  "OLYMPIC",
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

const IN_SERVICE_ZONES = new Set(["LONG_NUONG", "SAUNA", "SPA"]);

/** Đơn đã chốt hoặc đã đóng — không thêm / không đổi ảnh bill. */
export function billEvidenceFrozen(cart: {
  status?: string | null;
  adminNote?: string | null;
  zoneCode?: string | null;
}): boolean {
  const status = (cart.status || "").toUpperCase();
  if (status === "CANCELLED" || status === "REJECTED" || status === "EXPIRED") {
    return true;
  }
  if ((cart.adminNote || "").trim() === "Đã dùng") return true;
  const zone = (cart.zoneCode || "").toUpperCase();
  if (IN_SERVICE_ZONES.has(zone)) return false;
  return status === "USED";
}
