import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  CUSTOMER_COOKIE,
  createCustomerSession,
  getSessionCustomer,
} from "@/lib/session";
import { namesMatch } from "@/lib/names";
import { isValidPhone, normalizePhone, phoneShortId } from "@/lib/phone";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

const DUPLICATE_WINDOW_MS = 45_000;

async function findByShortId(shortId: string) {
  return prisma.appCustomer.findMany({
    where: {
      OR: [{ shortId }, { phoneNormalized: { endsWith: shortId } }],
      status: "ACTIVE",
    },
    take: 30,
    orderBy: { updatedAt: "desc" },
  });
}

async function recordEvent(opts: {
  customerId: string;
  serviceCode: string;
  fullName: string;
  phoneNormalized: string | null;
  shortId: string;
  phoneDisplay: string | null;
  segment: string;
  customerCode: string;
}) {
  const service = await prisma.appService.findUnique({
    where: { serviceCode: opts.serviceCode },
  });
  if (!service || service.status !== "ACTIVE") {
    return {
      error: NextResponse.json(
        { error: "Điểm dịch vụ này hiện không khả dụng." },
        { status: 400 }
      ),
    };
  }

  const recent = await prisma.appServiceEvent.findFirst({
    where: {
      customerId: opts.customerId,
      serviceId: service.id,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    const meta = (recent.metadata ?? {}) as { fullName?: string };
    return {
      duplicate: true as const,
      response: NextResponse.json(
        {
          error: "Đã xác nhận gần đây.",
          duplicate: true,
          event: {
            id: recent.id,
            serviceCode: service.serviceCode,
            serviceName: service.serviceName,
            createdAt: recent.createdAt,
            partySize: 1,
            fullName: meta.fullName || opts.fullName,
            phone: opts.phoneDisplay,
            shortId: opts.shortId,
            customerCode: opts.customerCode,
            segment: opts.segment,
          },
        },
        { status: 409 }
      ),
    };
  }

  const event = await prisma.appServiceEvent.create({
    data: {
      customerId: opts.customerId,
      serviceId: service.id,
      eventType: "SERVICE_USE",
      metadata: {
        source: "qr_scan",
        fullName: opts.fullName,
        partySize: 1,
        phone: opts.phoneNormalized,
        shortId: opts.shortId,
      },
    },
  });

  return {
    event: {
      id: event.id,
      customerCode: opts.customerCode,
      shortId: opts.shortId,
      phone: opts.phoneDisplay,
      fullName: opts.fullName,
      segment: opts.segment,
      serviceCode: service.serviceCode,
      serviceName: service.serviceName,
      eventType: event.eventType,
      createdAt: event.createdAt,
      partySize: 1,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const sessionCustomer = await getSessionCustomer();
    if (!sessionCustomer) {
      return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const serviceCode = String(body.serviceCode || "")
      .trim()
      .toUpperCase();
    const shortIdRaw = String(body.shortId || "").replace(/\D/g, "").slice(0, 4);
    const phoneRaw = String(body.phone || "").trim();
    const fullName = String(body.fullName || body.name || "").trim().slice(0, 120);

    if (!serviceCode) {
      return NextResponse.json({ error: "Thiếu mã dịch vụ." }, { status: 400 });
    }
    if (shortIdRaw.length !== 4) {
      return NextResponse.json(
        { error: "ID phải gồm đúng 4 chữ số (có thể sửa)." },
        { status: 400 }
      );
    }
    if (fullName.length < 2) {
      return NextResponse.json({ error: "Nhập họ tên khách." }, { status: 400 });
    }

    const existing = await findByShortId(shortIdRaw);
    const nameHits = existing.filter(
      (c) => c.fullName && namesMatch(c.fullName, fullName)
    );

    // ── Đã có ID trong hệ thống → phải khớp tên ──
    if (existing.length > 0) {
      if (nameHits.length === 0) {
        const hints = existing
          .map((c) => c.fullName)
          .filter((n): n is string => !!n && n.trim().length > 0)
          .slice(0, 3);
        return NextResponse.json(
          {
            error:
              hints.length > 0
                ? `ID đã có trong hệ thống nhưng tên chưa khớp. Gợi ý gần: ${hints.join(", ")}`
                : "ID đã có trong hệ thống — nhập đúng họ tên đã đăng ký để vào.",
            needNameMatch: true,
            found: true,
          },
          { status: 400 }
        );
      }

      // Ưu tiên bản ghi khớp tên mới nhất
      const matched = nameHits[0]!;

      // Chuyển session sang tài khoản đã có
      if (matched.id !== sessionCustomer.id) {
        const jar = await cookies();
        const token = jar.get(CUSTOMER_COOKIE)?.value;
        if (token) {
          await prisma.appCustomerSession.updateMany({
            where: { sessionToken: token },
            data: { customerId: matched.id, lastUsedAt: new Date() },
          });
        } else {
          await createCustomerSession(matched.id);
        }
      }

      const result = await recordEvent({
        customerId: matched.id,
        serviceCode,
        fullName: matched.fullName || fullName,
        phoneNormalized: matched.phoneNormalized,
        shortId: matched.shortId || shortIdRaw,
        phoneDisplay: matched.phone,
        segment: matched.segment,
        customerCode: matched.customerCode,
      });
      if ("error" in result && result.error) return result.error;
      if ("duplicate" in result && result.duplicate) return result.response;
      return NextResponse.json({ ok: true, event: result.event, mode: "existing" });
    }

    // ── Chưa có ID → bắt buộc SĐT (khách mới) ──
    if (!isValidPhone(phoneRaw)) {
      return NextResponse.json(
        {
          error: "ID chưa có trong hệ thống — bắt buộc nhập số điện thoại.",
          needPhone: true,
          found: false,
        },
        { status: 400 }
      );
    }

    const phoneNormalized = normalizePhone(phoneRaw);
    // Nếu user không sửa ID, đồng bộ theo SĐT; nếu đã sửa thì giữ shortId đã nhập
    const shortId =
      shortIdRaw || phoneShortId(phoneNormalized);

    const taken = await prisma.appCustomer.findFirst({
      where: {
        phoneNormalized,
        NOT: { id: sessionCustomer.id },
      },
      select: { id: true, fullName: true, shortId: true },
    });
    if (taken) {
      // SĐT đã thuộc tài khoản khác → yêu cầu khớp tên với tài khoản đó
      if (!taken.fullName || !namesMatch(taken.fullName, fullName)) {
        return NextResponse.json(
          {
            error:
              "SĐT đã có trong hệ thống. Nhập đúng họ tên của tài khoản đó, hoặc dùng SĐT khác.",
            needNameMatch: true,
          },
          { status: 409 }
        );
      }
      if (taken.id !== sessionCustomer.id) {
        const jar = await cookies();
        const token = jar.get(CUSTOMER_COOKIE)?.value;
        if (token) {
          await prisma.appCustomerSession.updateMany({
            where: { sessionToken: token },
            data: { customerId: taken.id, lastUsedAt: new Date() },
          });
        }
      }
      const existingTaken = await prisma.appCustomer.findUniqueOrThrow({
        where: { id: taken.id },
      });
      const result = await recordEvent({
        customerId: existingTaken.id,
        serviceCode,
        fullName: existingTaken.fullName || fullName,
        phoneNormalized: existingTaken.phoneNormalized,
        shortId: existingTaken.shortId || shortId,
        phoneDisplay: existingTaken.phone,
        segment: existingTaken.segment,
        customerCode: existingTaken.customerCode,
      });
      if ("error" in result && result.error) return result.error;
      if ("duplicate" in result && result.duplicate) return result.response;
      return NextResponse.json({ ok: true, event: result.event, mode: "phone_existing" });
    }

    const keepMember = sessionCustomer.segment === "MEMBER";
    const updated = await prisma.appCustomer.update({
      where: { id: sessionCustomer.id },
      data: {
        fullName,
        phone: phoneRaw,
        phoneNormalized,
        shortId,
        segment: keepMember ? "MEMBER" : "WALK_IN",
        username: phoneNormalized,
      },
    });

    const result = await recordEvent({
      customerId: updated.id,
      serviceCode,
      fullName,
      phoneNormalized,
      shortId,
      phoneDisplay: updated.phone,
      segment: updated.segment,
      customerCode: updated.customerCode,
    });
    if ("error" in result && result.error) return result.error;
    if ("duplicate" in result && result.duplicate) return result.response;
    return NextResponse.json({ ok: true, event: result.event, mode: "new" });
  } catch (e) {
    console.error("[events/confirm]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Xác nhận thất bại" },
      { status: 500 }
    );
  }
}
