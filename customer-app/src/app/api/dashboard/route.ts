import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCustomer } from "@/lib/session";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getSessionCustomer();
  if (!customer) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  // One query: group visits with service labels (was 2 sequential queries).
  const grouped = await prisma.appServiceEvent.groupBy({
    by: ["serviceId"],
    where: {
      customerId: customer.id,
      eventType: "SERVICE_USE",
    },
    _count: { _all: true },
  });

  let activities: {
    serviceCode: string;
    serviceName: string;
    visits: number;
  }[] = [];

  if (grouped.length > 0) {
    const services = await prisma.appService.findMany({
      where: { id: { in: grouped.map((g) => g.serviceId) } },
      select: { id: true, serviceCode: true, serviceName: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    });
    const countMap = Object.fromEntries(
      grouped.map((g) => [g.serviceId, g._count._all])
    );
    activities = services.map((s) => ({
      serviceCode: s.serviceCode,
      serviceName: s.serviceName,
      visits: countMap[s.id] ?? 0,
    }));
  }

  return NextResponse.json({
    ok: true,
    customer: {
      customerCode: customer.customerCode,
      username: customer.username,
      fullName: customer.fullName,
      phone: customer.phone,
      shortId: customer.shortId,
      segment: customer.segment,
    },
    activities,
  });
}
