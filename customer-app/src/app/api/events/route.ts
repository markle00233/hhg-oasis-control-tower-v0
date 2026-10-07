import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCustomer } from "@/lib/session";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getSessionCustomer();
  if (!customer) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  const events = await prisma.appServiceEvent.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      eventType: true,
      createdAt: true,
      metadata: true,
      service: {
        select: { serviceCode: true, serviceName: true },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    events: events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      createdAt: e.createdAt,
      serviceCode: e.service.serviceCode,
      serviceName: e.service.serviceName,
      partySize:
        e.metadata &&
        typeof e.metadata === "object" &&
        "partySize" in e.metadata &&
        typeof (e.metadata as { partySize?: unknown }).partySize === "number"
          ? (e.metadata as { partySize: number }).partySize
          : 1,
    })),
  });
}
