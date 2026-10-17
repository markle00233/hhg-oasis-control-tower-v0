import { NextRequest, NextResponse } from "next/server";
import {
  ensureServiceTokens,
  publicCustomer,
  resolveService,
} from "@/lib/checkin";
import { maskFullName } from "@/lib/names";
import { resolveDeviceCustomer, revokeCurrentDevice } from "@/lib/device";
import { getSessionCustomer } from "@/lib/session";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

/**
 * Open QR page: resolve zone + optional known customer.
 * Priority: login session (Home hiện ai) > device remember cookie.
 * Nếu session ≠ device → huỷ device cũ (tránh hỏi nhầm người).
 * Never records SERVICE_USE.
 */
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

    const [deviceCustomer, sessionCustomer] = await Promise.all([
      resolveDeviceCustomer().catch(() => null),
      getSessionCustomer().catch(() => null),
    ]);

    // Session đang login trên Home luôn thắng cookie thiết bị cũ
    if (
      sessionCustomer &&
      deviceCustomer &&
      sessionCustomer.id !== deviceCustomer.id
    ) {
      await revokeCurrentDevice().catch(() => undefined);
    }

    let known = null as ReturnType<typeof publicCustomer> | null;
    let fromSession = false;
    let remembered = false;
    let deviceId: string | null = null;

    if (sessionCustomer) {
      known = publicCustomer(sessionCustomer);
      fromSession = true;
      // device cùng người vẫn ok
      if (deviceCustomer && deviceCustomer.id === sessionCustomer.id) {
        remembered = true;
        deviceId = deviceCustomer.deviceId;
      }
    } else if (deviceCustomer) {
      known = publicCustomer(deviceCustomer);
      remembered = true;
      deviceId = deviceCustomer.deviceId;
    }

    return NextResponse.json({
      ok: true,
      service: {
        id: service.id,
        code: service.serviceCode,
        name: service.serviceName,
        slug: service.slug,
        qrToken: service.qrToken,
      },
      remembered,
      fromSession,
      customer: known,
      maskedName: known ? maskFullName(known.name) : null,
      deviceId,
    });
  } catch (e) {
    console.error("[checkin/resolve]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Resolve failed" },
      { status: 500 }
    );
  }
}
