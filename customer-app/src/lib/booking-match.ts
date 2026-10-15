import { prisma } from "./prisma";

export async function matchBookingToArrival(opts: {
  customerId: string;
  phoneNormalized?: string | null;
  serviceId: string;
  serviceUseId: string;
  at?: Date;
}) {
  const at = opts.at || new Date();
  const windowStart = new Date(at.getTime() - 2 * 60 * 60 * 1000);
  const windowEnd = new Date(at.getTime() + 3 * 60 * 60 * 1000);

  const or: Array<{ customerId: string } | { phoneNormalized: string }> = [
    { customerId: opts.customerId },
  ];
  if (opts.phoneNormalized) {
    or.push({ phoneNormalized: opts.phoneNormalized });
  }

  const candidates = await prisma.appBooking.findMany({
    where: {
      serviceId: opts.serviceId,
      status: { in: ["PENDING", "CONFIRMED", "ARRIVED"] },
      serviceUseId: null,
      startAt: { lte: windowEnd },
      endAt: { gte: windowStart },
      OR: or,
    },
    include: {
      // resourceId only in slim schema — no relation include if missing
    },
    orderBy: { startAt: "asc" },
    take: 10,
  });

  if (candidates.length === 1) {
    const updated = await prisma.appBooking.update({
      where: { id: candidates[0].id },
      data: {
        status: "CHECKED_IN",
        serviceUseId: opts.serviceUseId,
        customerId: opts.customerId,
      },
    });
    return { matched: updated, candidates: [] as typeof candidates, walkIn: false };
  }

  return {
    matched: null,
    candidates,
    walkIn: candidates.length === 0,
  };
}
