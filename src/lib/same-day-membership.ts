/** −10% gói tháng nếu đăng ký sau khi đã có đơn bơi cùng ngày (VN). */

export const SAME_DAY_MEMBERSHIP_DISCOUNT_RATE = 0.1;

export function vnDayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function vnDayStart(now = new Date()) {
  return new Date(`${vnDayKey(now)}T00:00:00+07:00`);
}

export function isOlympicMembershipItemId(id: string | null | undefined) {
  return /^oly-\d+m$/i.test(String(id || "").trim());
}

export function isOlympicSwimTicketId(id: string | null | undefined) {
  return /^pool-/i.test(String(id || "").trim());
}

export function itemsIncludeSwimTicket(
  items: { itemId?: string; id?: string; nameVi?: string; name?: string }[]
) {
  return items.some((row) => {
    const id = String(row.itemId || row.id || "");
    if (isOlympicSwimTicketId(id)) return true;
    const name = String(row.nameVi || row.name || "").toLowerCase();
    return (
      name.includes("vé bơi") ||
      name.includes("vé 90") ||
      name.includes("không giới hạn")
    );
  });
}

export function sameDayMembershipDiscountVnd(baseVnd: number) {
  return Math.round(
    Math.max(0, Number(baseVnd) || 0) * SAME_DAY_MEMBERSHIP_DISCOUNT_RATE
  );
}

export function sameDayMembershipPriceVnd(baseVnd: number) {
  const base = Math.max(0, Math.round(Number(baseVnd) || 0));
  return Math.max(0, base - sameDayMembershipDiscountVnd(base));
}

export function formatMembershipPayLabel(vnd: number) {
  const n = Math.max(0, Math.round(Number(vnd) || 0));
  if (n >= 1_000_000) {
    const tr = n / 1_000_000;
    const s = tr
      .toFixed(2)
      .replace(/\.?0+$/, "")
      .replace(".", ",");
    return `${s}tr`;
  }
  return `${Math.round(n / 1000)}K`;
}

type OrderPrisma = {
  appService: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>;
  };
  appOrder: {
    findMany: (args: unknown) => Promise<
      {
        status: string;
        items: { itemId: string; nameVi: string }[];
      }[]
    >;
  };
};

/** Đã có đơn Hồ Olympic hoàn tất hôm nay (vé / phụ kiện / gói). */
export async function customerHasSameDayOlympicOrder(
  prisma: OrderPrisma,
  customerId: string
): Promise<boolean> {
  const service = await prisma.appService.findUnique({
    where: { serviceCode: "OLYMPIC_POOL" },
    select: { id: true },
  });
  if (!service) return false;
  const orders = await prisma.appOrder.findMany({
    where: {
      customerId,
      serviceId: service.id,
      createdAt: { gte: vnDayStart() },
      status: { notIn: ["CANCELLED", "PENDING", "SUBMITTED"] },
    },
    select: {
      status: true,
      items: { select: { itemId: true, nameVi: true } },
    },
    take: 30,
  });
  return orders.length > 0;
}

export async function customerHasSameDaySwimOrder(
  prisma: OrderPrisma,
  customerId: string
): Promise<boolean> {
  return customerHasSameDayOlympicOrder(prisma, customerId);
}

export async function isSameDayMembershipEligible(
  prisma: OrderPrisma,
  customer: { id: string }
): Promise<boolean> {
  return customerHasSameDayOlympicOrder(prisma, customer.id);
}
