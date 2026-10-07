import { NextRequest, NextResponse } from "next/server";
import { ensureServiceTokens, publicCustomer, resolveService } from "@/lib/checkin";
import { resolveDeviceCustomer } from "@/lib/device";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

/** Open QR page: resolve service + optional remembered customer. Never records usage. */
export async function GET(req: NextRequest) {
  try {
    await ensureServiceTokens();
    const token =
      req.nextUrl.searchParams.get("token") ||
      req.nextUrl.searchParams.get("service") ||
      "";
    const service = await resolveService(token);
    if (!service) {
      return NextResponse.json({ error: "Không tìm thấy dịch vụ." }, { status: 404 });
    }

    const deviceCustomer = await resolveDeviceCustomer();

    return NextResponse.json({
      ok: true,
      service: {
        id: service.id,
        code: service.serviceCode,
        name: service.serviceName,
        slug: service.slug,
        qrToken: service.qrToken,
      },
      remembered: !!deviceCustomer,
      customer: deviceCustomer ? publicCustomer(deviceCustomer) : null,
      deviceId: deviceCustomer?.deviceId ?? null,
    });
  } catch (e) {
    console.error("[checkin/resolve]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Resolve failed" },
      { status: 500 }
    );
  }
}
