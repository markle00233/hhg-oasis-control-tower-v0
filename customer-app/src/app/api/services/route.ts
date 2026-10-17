import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureServiceTokens } from "@/lib/checkin";
import {
  ACTIVE_ZONE_QR_CODES,
  DEPRECATED_ZONE_CODES,
  scanUrlForService,
  SERVICE_CATALOG,
} from "@/lib/services";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureServiceTokens();

  // Đảm bảo đủ zone active (SPA / LONG_NUONG…) có trong DB
  for (let i = 0; i < SERVICE_CATALOG.length; i++) {
    const s = SERVICE_CATALOG[i]!;
    await prisma.appService.upsert({
      where: { serviceCode: s.serviceCode },
      create: {
        serviceCode: s.serviceCode,
        serviceName: s.serviceName,
        slug: s.serviceCode.toLowerCase().replace(/_/g, "-"),
        qrToken: s.serviceCode,
        status: "ACTIVE",
        sortOrder: i + 1,
      },
      update: {
        serviceName: s.serviceName,
        status: "ACTIVE",
        sortOrder: i + 1,
        qrToken: s.serviceCode,
      },
    });
  }
  const services = await prisma.appService.findMany({
    where: {
      status: "ACTIVE",
      serviceCode: {
        in: [...ACTIVE_ZONE_QR_CODES],
        notIn: [...DEPRECATED_ZONE_CODES],
      },
    },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      serviceCode: true,
      serviceName: true,
      slug: true,
      qrToken: true,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      base: process.env.NEXT_PUBLIC_CUSTOMER_APP_URL || null,
      services: services.map((s) => {
        const token = s.qrToken || s.serviceCode;
        return {
          id: s.id,
          serviceCode: s.serviceCode,
          serviceName: s.serviceName,
          slug: s.slug,
          qrToken: token,
          scanPath: `/s/${token}`,
          scanUrl: scanUrlForService(token),
        };
      }),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
