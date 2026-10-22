import { prisma } from "./prisma";

export const SPA_DONE_NOTE = "Đã dùng";

function cartIsLive(status: string) {
  return status === "OPEN" || status === "PENDING_APPROVAL";
}

/** Quét QR hoặc Xác nhận = khách đang dùng dịch vụ, chưa kết thúc lượt. */
export async function markSpaInUse(cartId: string, cartStatus: string) {
  if (!cartIsLive(cartStatus)) return false;
  const updated = await prisma.appServiceCart.updateMany({
    where: {
      id: cartId,
      status: { in: ["OPEN", "PENDING_APPROVAL"] },
    },
    data: { status: "USED" },
  });
  return updated.count > 0;
}

/** Staff bấm Đã dùng — gỡ đơn khỏi danh sách đang dùng của khách. */
export async function finishSpaVisit(cartId: string) {
  await prisma.appServiceCart.updateMany({
    where: { id: cartId, status: "USED" },
    data: { adminNote: SPA_DONE_NOTE },
  });
}
