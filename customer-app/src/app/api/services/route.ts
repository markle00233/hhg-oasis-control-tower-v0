import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureServiceTokens } from "@/lib/checkin";
import { scanUrlForService } from "@/lib/services";

export const preferredRegion = "sin1";
export const revalidate = 300; // cache zone list 5 minutes

export async function GET() {
  await ensureServiceTokens();
  const services = await prisma.appService.findMany({
    where: { status: "ACTIVE" },
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
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
