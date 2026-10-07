import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  publicCustomer,
  recordServiceUsage,
  resolveService,
} from "@/lib/checkin";
import {
  clearPendingCookie,
  readPendingCustomerId,
  resolveDeviceCustomer,
} from "@/lib/device";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

/**
 * Record service usage ONLY after explicit user confirm.
 * Customer resolved from device cookie or pending identify cookie — never from client customerId.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || body.service || body.serviceCode || "").trim();
    if (!token) {
      return NextResponse.json({ error: "Thiếu mã dịch vụ." }, { status: 400 });
    }

    const service = await resolveService(token);
    if (!service) {
      return NextResponse.json({ error: "Không tìm thấy dịch vụ." }, { status: 404 });
    }

    const deviceCustomer = await resolveDeviceCustomer();
    let customerId = deviceCustomer?.id || null;
    let deviceId = deviceCustomer?.deviceId || null;

    if (!customerId) {
      customerId = await readPendingCustomerId();
    }
    if (!customerId) {
      return NextResponse.json(
        { error: "Chưa nhận diện khách. Vui lòng nhập thông tin." },
        { status: 401 }
      );
    }

    const customer = await prisma.appCustomer.findUnique({
      where: { id: customerId },
    });
    if (!customer || customer.status !== "ACTIVE") {
      await clearPendingCookie();
      return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 404 });
    }

    const { event, duplicate } = await recordServiceUsage({
      customerId: customer.id,
      serviceId: service.id,
      deviceId,
      metadata: {
        fullName: customer.fullName,
        phone: customer.phoneNormalized,
      },
    });

    // Keep pending until remember decision; clear after successful usage if device exists
    if (deviceId) {
      await clearPendingCookie();
    }

    return NextResponse.json({
      ok: true,
      duplicate,
      customer: publicCustomer(customer),
      event: {
        id: event.id,
        serviceCode: event.service.serviceCode,
        serviceName: event.service.serviceName,
        createdAt: event.createdAt,
      },
    });
  } catch (e) {
    console.error("[checkin/confirm]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Confirm failed" },
      { status: 500 }
    );
  }
}
