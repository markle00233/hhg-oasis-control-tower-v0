import { prisma } from "@/lib/prisma";

/** Latest VIS-###### via the unique index, instead of counting the whole table. */
export async function nextVisitCode() {
  const last = await prisma.visit.findFirst({
    orderBy: { visitCode: "desc" },
    select: { visitCode: true },
  });
  const n = Number(String(last?.visitCode || "").replace(/\D/g, "")) || 0;
  return `VIS-${String(n + 1).padStart(6, "0")}`;
}

export async function nextCode(
  prefix: string,
  model: "customer" | "membership" | "visit" | "contract" | "family" | "promotion"
) {
  const count =
    model === "customer"
      ? await prisma.customer.count()
      : model === "membership"
        ? await prisma.membership.count()
        : model === "visit"
          ? await prisma.visit.count()
          : model === "contract"
            ? await prisma.membership.count()
            : model === "family"
              ? await prisma.familyGroup.count()
              : await prisma.promotion.count();
  return `${prefix}-${String(count + 1).padStart(6, "0")}`;
}

export async function logActivity(params: {
  customerId: string;
  activityType: string;
  title: string;
  serviceId?: string;
  note?: string;
  staffId?: string;
  occurredAt?: Date;
}) {
  await prisma.activityLog.create({
    data: {
      customerId: params.customerId,
      activityType: params.activityType,
      title: params.title,
      serviceId: params.serviceId,
      note: params.note,
      staffId: params.staffId,
      occurredAt: params.occurredAt ?? new Date(),
    },
  });
}
