import { prisma } from "@/lib/prisma";
import { startOfDay } from "@/lib/attendance";

export type OverlapItem = {
  serviceName: string;
  serviceCode: string;
  newPlanName: string;
  existingPlanName: string;
};

export async function findServiceOverlap(
  customerId: string,
  newPlanIds: string[]
): Promise<OverlapItem[]> {
  if (newPlanIds.length === 0) return [];

  const today = startOfDay(new Date());
  const [newPlans, existing] = await Promise.all([
    prisma.membershipPlan.findMany({
      where: { id: { in: newPlanIds } },
      include: { services: { include: { service: true } } },
    }),
    prisma.membership.findMany({
      where: {
        customerId,
        status: "ACTIVE",
        expiryDate: { gte: today },
      },
      include: {
        plan: { include: { services: { include: { service: true } } } },
      },
    }),
  ]);

  const existingByService = new Map<string, string>();
  for (const m of existing) {
    for (const s of m.plan.services) {
      if (!existingByService.has(s.serviceId)) {
        existingByService.set(s.serviceId, m.plan.name);
      }
    }
  }

  const overlapping: OverlapItem[] = [];
  const seen = new Set<string>();
  for (const plan of newPlans) {
    for (const s of plan.services) {
      const existingPlanName = existingByService.get(s.serviceId);
      const key = `${s.serviceId}:${plan.id}`;
      if (existingPlanName && !seen.has(key)) {
        seen.add(key);
        overlapping.push({
          serviceName: s.service.name,
          serviceCode: s.service.code,
          newPlanName: plan.name,
          existingPlanName,
        });
      }
    }
  }
  return overlapping;
}

export function overlapAlertMessage(items: OverlapItem[]) {
  const lines = items.map(
    (i) =>
      `- ${i.serviceName}: đã có trong "${i.existingPlanName}", combo/gói mới "${i.newPlanName}" cũng gồm dịch vụ này`
  );
  return [
    "Khách đã có sẵn dịch vụ trùng với gói đang mua.",
    "Hãy báo khách và xác nhận còn muốn mua không.",
    "",
    ...lines,
  ].join("\n");
}
