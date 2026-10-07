import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createRememberDevice,
  readPendingCustomerId,
  resolveDeviceCustomer,
} from "@/lib/device";
import { publicCustomer } from "@/lib/checkin";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

/** User agreed to remember this browser/device. */
export async function POST() {
  try {
    const pendingId = await readPendingCustomerId();
    const already = await resolveDeviceCustomer();
    const customerId = pendingId || already?.id;
    if (!customerId) {
      return NextResponse.json(
        { error: "Chưa xác định khách. Vui lòng nhập thông tin trước." },
        { status: 400 }
      );
    }

    const customer = await prisma.appCustomer.findUnique({
      where: { id: customerId },
    });
    if (!customer || customer.status !== "ACTIVE") {
      return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 404 });
    }

    const device = await createRememberDevice(customer.id);
    return NextResponse.json({
      ok: true,
      remembered: true,
      customer: publicCustomer(customer),
      deviceId: device.id,
    });
  } catch (e) {
    console.error("[checkin/remember]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Remember failed" },
      { status: 500 }
    );
  }
}
