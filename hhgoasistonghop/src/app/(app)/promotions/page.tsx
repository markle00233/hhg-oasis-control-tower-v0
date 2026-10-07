import { prisma } from "@/lib/prisma";
import { PromotionsClient } from "@/components/promotions-client";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function PromotionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [promotions, services, customers, assignments] = await Promise.all([
    prisma.promotion.findMany({
      include: { service: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.service.findMany({
      where: { status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.customer.findMany({
      orderBy: { fullName: "asc" },
      take: 300,
      select: { id: true, customerCode: true, fullName: true, phone: true },
    }),
    prisma.customerPromotion.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { customer: true, promotion: true },
    }),
  ]);

  return (
    <PromotionsClient
      promotions={promotions.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        type: p.type,
        description: p.description,
        serviceName: p.service?.name ?? null,
        validFrom: p.validFrom?.toISOString() ?? null,
        validTo: p.validTo?.toISOString() ?? null,
        status: p.status,
      }))}
      services={services.map((s) => ({ id: s.id, name: s.name }))}
      customers={customers}
      assignments={assignments.map((a) => ({
        id: a.id,
        customerName: a.customer.fullName,
        customerId: a.customerId,
        promoName: a.promotion.name,
        promoCode: a.promotion.code,
        createdAt: a.createdAt.toISOString(),
        status: a.status,
      }))}
    />
  );
}
