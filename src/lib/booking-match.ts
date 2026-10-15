import { prisma } from "./prisma";

/**
 * Link a new SERVICE_USE arrival to a matching booking (same customer/phone + zone + time window).
 * Returns matched booking or candidates if ambiguous.
 */
export async function matchBookingToArrival(opts: {
  customerId: string;
  phoneNormalized?: string | null;
  serviceId: string;
  serviceUseId: string;
  at?: Date;
}) {
  const at = opts.at || new Date();
  const windowStart = new Date(at.getTime() - 2 * 60 * 60 * 1000); // early 2h
  const windowEnd = new Date(at.getTime() + 3 * 60 * 60 * 1000); // late 3h

  const or: Array<Record<string, unknown>> = [{ customerId: opts.customerId }];
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
      resource: { select: { id: true, code: true, name: true, type: true } },
    },
    orderBy: { startAt: "asc" },
    take: 10,
  });

  if (candidates.length === 1) {
    const b = candidates[0];
    const updated = await prisma.appBooking.update({
      where: { id: b.id },
      data: {
        status: "CHECKED_IN",
        serviceUseId: opts.serviceUseId,
        customerId: opts.customerId,
      },
      include: {
        resource: { select: { id: true, code: true, name: true, type: true } },
      },
    });
    return { matched: updated, candidates: [] as typeof candidates };
  }

  return { matched: null, candidates };
}
