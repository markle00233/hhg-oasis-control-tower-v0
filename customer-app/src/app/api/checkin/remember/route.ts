import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createRememberDevice,
  readPendingCustomerId,
  resolveDeviceCustomer,
  revokeCurrentDevice,
} from "@/lib/device";
import { publicCustomer } from "@/lib/checkin";
import { getSessionCustomer } from "@/lib/session";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

/** Save / sync device cookie to the current customer (session > pending > device). */
export async function POST() {
  try {
    const pendingId = await readPendingCustomerId();
    const already = await resolveDeviceCustomer();
    const session = await getSessionCustomer().catch(() => null);
    // Session đang login trên Home luôn là nguồn đúng khi sync device
    const customerId = session?.id || pendingId || already?.id;
    if (!customerId) {
      return NextResponse.json(
        { error: "Chưa xác định khách. Vui lòng nhập thông tin trước." },
        { status: 400 }
      );
    }

    // Đổi người → huỷ device cũ rồi tạo mới
    if (already && already.id !== customerId) {
      await revokeCurrentDevice().catch(() => undefined);
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
