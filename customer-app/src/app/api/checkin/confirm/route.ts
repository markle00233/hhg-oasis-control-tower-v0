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
import { matchBookingToArrival } from "@/lib/booking-match";
import { awardCheckInPoints } from "@/lib/points";

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

    let bookingMatch: {
      matched: { id: string; bookingCode: string; status: string } | null;
      walkIn: boolean;
      candidateCount: number;
    } = { matched: null, walkIn: true, candidateCount: 0 };

    let pointsAwarded = 0;
    let pointsBalance: number | null = null;

    if (!duplicate) {
      const result = await matchBookingToArrival({
        customerId: customer.id,
        phoneNormalized: customer.phoneNormalized,
        serviceId: service.id,
        serviceUseId: event.id,
      });
      bookingMatch = {
        matched: result.matched
          ? {
              id: result.matched.id,
              bookingCode: result.matched.bookingCode,
              status: result.matched.status,
            }
          : null,
        walkIn: result.walkIn,
        candidateCount: result.candidates.length,
      };

      const pts = await awardCheckInPoints({
        customerId: customer.id,
        refType: "SERVICE_EVENT",
        refId: event.id,
        note: `Check-in ${service.serviceCode}`,
      }).catch((err) => {
        console.error("[checkin/confirm points]", err);
        return null;
      });
      if (pts) {
        pointsAwarded = pts.delta;
        pointsBalance = pts.balance;
      }
    }

    // Keep pending until remember decision; clear after successful usage if device exists
    if (deviceId) {
      await clearPendingCookie();
    }

    return NextResponse.json({
      ok: true,
      duplicate,
      customer: publicCustomer(customer),
      bookingMatch,
      pointsAwarded,
      pointsBalance,
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
