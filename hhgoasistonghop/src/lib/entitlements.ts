import { prisma } from "@/lib/prisma";
import { startOfDay } from "@/lib/attendance";
import { normalizePhone } from "@/lib/utils";

export type EntitledService = { id: string; code: string; name: string; source: string };

export async function getCustomerEntitlements(customerId: string) {
  const today = startOfDay(new Date());
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      memberships: {
        where: { status: "ACTIVE", expiryDate: { gte: today } },
        include: { plan: { include: { services: { include: { service: true } } } } },
      },
      familyGroup: {
        include: {
          owner: {
            include: {
              memberships: {
                where: { status: "ACTIVE", expiryDate: { gte: today } },
                include: { plan: { include: { services: { include: { service: true } } } } },
              },
            },
          },
        },
      },
      customerPromotions: {
        where: { status: "ACTIVE" },
        include: { promotion: { include: { service: true } } },
      },
    },
  });

  const map = new Map<string, EntitledService>();

  function addFromMemberships(
    memberships: {
      plan: {
        name: string;
        services: { serviceId: string; service: { id: string; code: string; name: string } }[];
      };
    }[],
    source: string
  ) {
    for (const m of memberships) {
      for (const s of m.plan.services) {
        if (!map.has(s.serviceId)) {
          map.set(s.serviceId, {
            id: s.service.id,
            code: s.service.code,
            name: s.service.name,
            source: `${source}: ${m.plan.name}`,
          });
        }
      }
    }
  }

  if (customer) {
    addFromMemberships(customer.memberships, "Gói của khách");
    if (customer.familyGroup && customer.familyGroup.ownerId !== customer.id) {
      addFromMemberships(
        customer.familyGroup.owner.memberships,
        `Gói gia đình (${customer.familyGroup.owner.fullName})`
      );
    }
    for (const cp of customer.customerPromotions) {
      const p = cp.promotion;
      if (p.status !== "ACTIVE") continue;
      if (p.validFrom && p.validFrom > new Date()) continue;
      if (p.validTo && p.validTo < today) continue;
      if (p.service && !map.has(p.service.id)) {
        map.set(p.service.id, {
          id: p.service.id,
          code: p.service.code,
          name: p.service.name,
          source: `${p.type === "VOUCHER" ? "Voucher" : "Promotion"}: ${p.name}`,
        });
      }
    }
  }

  return [...map.values()];
}

export async function findFamilyByPhone(phone: string) {
  const phoneNormalized = normalizePhone(phone);
  if (!phoneNormalized) return null;
  return prisma.familyGroup.findUnique({
    where: { phoneNormalized },
    include: {
      owner: { select: { id: true, fullName: true, customerCode: true, phone: true } },
      members: {
        select: {
          id: true,
          fullName: true,
          customerCode: true,
          phone: true,
          dateOfBirth: true,
        },
        orderBy: { fullName: "asc" },
      },
    },
  });
}

export async function familyPhoneConflict(phoneNormalized: string, exceptCustomerId?: string) {
  const group = await prisma.familyGroup.findUnique({
    where: { phoneNormalized },
    include: {
      owner: { select: { id: true, fullName: true, customerCode: true } },
      members: { select: { id: true, fullName: true, customerCode: true } },
    },
  });
  if (!group) return null;
  if (exceptCustomerId && group.members.some((m) => m.id === exceptCustomerId)) return null;
  return group;
}
