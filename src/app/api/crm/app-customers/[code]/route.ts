import { NextRequest, NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Timeline quét QR của 1 khách app (theo customerCode hoặc id). */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> }
) {
  const gate = await requireSystemAdmin();
  if ("error" in gate) return gate.error;

  const { code: raw } = await ctx.params;
  const code = decodeURIComponent(raw || "").trim();
  if (!code) {
    return NextResponse.json({ error: "Missing customer code" }, { status: 400 });
  }

  const days = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("days") || 30) || 30, 1),
    365
  );
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const customer = await prisma.appCustomer.findFirst({
      where: {
        OR: [{ customerCode: code }, { id: code }, { username: code }],
      },
      select: {
        id: true,
        customerCode: true,
        username: true,
        status: true,
        createdAt: true,
      },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const events = await prisma.appServiceEvent.findMany({
      where: {
        customerId: customer.id,
        eventType: "SERVICE_USE",
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        createdAt: true,
        metadata: true,
        service: {
          select: { serviceCode: true, serviceName: true },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      days,
      customer: {
        id: customer.id,
        customerCode: customer.customerCode,
        username: customer.username,
        status: customer.status,
        createdAt: customer.createdAt,
        displayName: customer.customerCode,
      },
      timeline: events.map((e) => {
        const meta =
          e.metadata && typeof e.metadata === "object"
            ? (e.metadata as Record<string, unknown>)
            : {};
        const partySize =
          typeof meta.partySize === "number" && meta.partySize >= 1
            ? meta.partySize
            : 1;
        return {
          id: e.id,
          at: e.createdAt,
          serviceCode: e.service.serviceCode,
          serviceName: e.service.serviceName,
          partySize,
        };
      }),
    });
  } catch (e) {
    console.error("[crm/app-customers/:code]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load timeline" },
      { status: 500 }
    );
  }
}
