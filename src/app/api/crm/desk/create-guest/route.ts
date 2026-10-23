import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireDeskZone } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { normalizePhone, phoneShortId } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function generateCustomerCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let body = "";
  for (let i = 0; i < 6; i++) body += alphabet[bytes[i]! % alphabet.length];
  return `CUS-${body}`;
}

function mapDeskZoneToService(zone: string) {
  const map: Record<string, string> = {
    PICKLEBALL: "PICKLEBALL",
    SPA: "SPA",
    MIA_OI: "MIA_OI",
    /** Quầy gộp: lần quét phải là hồ thì xác thực vé được. */
    MIA_OLYMPIC: "OLYMPIC_POOL",
    VIP: "VIP_RESORT",
    VIP_RESORT: "VIP_RESORT",
    OLYMPIC: "OLYMPIC_POOL",
    OLYMPIC_POOL: "OLYMPIC_POOL",
    RESORT: "RESORT_POOL",
    RESORT_POOL: "RESORT_POOL",
    LONG_NUONG: "LONG_NUONG",
    SAUNA: "SAUNA",
  };
  return map[zone] || zone;
}

/**
 * Quầy tạo đơn walk-in:
 * - Chưa có TK → tạo AppCustomer, mật khẩu = SĐT
 * - Luôn Khách lẻ (VIP chỉ khi khách đăng ký gói)
 * - Mở 1 lần quét chưa xác thực để NV chọn món / vé
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const zone = String(body.zone || "").trim().toUpperCase();
    const gate = await requireDeskZone(zone);
    if ("error" in gate) return gate.error;

    const fullName = String(body.fullName || "").trim().slice(0, 120);
    const phoneRaw = String(body.phone || "").trim();
    const phoneNormalizedRaw = normalizePhone(phoneRaw);
    if (!fullName) {
      return NextResponse.json({ error: "Nhập tên khách." }, { status: 400 });
    }
    if (phoneNormalizedRaw.length < 9 || phoneNormalizedRaw.length > 11) {
      return NextResponse.json(
        { error: "SĐT không hợp lệ (9–11 số)." },
        { status: 400 }
      );
    }
    const phoneDisplay = phoneNormalizedRaw.startsWith("0")
      ? phoneNormalizedRaw
      : `0${phoneNormalizedRaw}`;
    const phoneNormalized = phoneDisplay;
    const phoneKeys = Array.from(
      new Set(
        [phoneNormalizedRaw, phoneDisplay, phoneNormalizedRaw.replace(/^0+/, "")]
          .map((p) => p.trim())
          .filter((p) => p.length >= 9)
      )
    );
    const shortId = phoneShortId(phoneDisplay);
    /** Mật khẩu đăng nhập app = số điện thoại (≥8 ký tự). */
    const password =
      phoneDisplay.length >= 8
        ? phoneDisplay
        : `Oasis${phoneDisplay}`.padEnd(8, "0");
    const passwordHash = await hashPassword(password);

    let customer = await prisma.appCustomer.findFirst({
      where: {
        OR: [
          { phoneNormalized: { in: phoneKeys } },
          { phone: { in: phoneKeys } },
          { username: { in: phoneKeys } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    let created = false;

    if (customer) {
      const keepVip =
        String(customer.segment || "").toUpperCase() === "VIP" &&
        (!customer.vipExpiresAt ||
          customer.vipExpiresAt.getTime() > Date.now());
      const patch: Prisma.AppCustomerUpdateInput = {
        fullName: customer.fullName || fullName,
        status: "ACTIVE",
        segment: keepVip ? "VIP" : customer.segment,
        ...(!customer.identityToken
          ? { identityToken: `oq_${randomBytes(18).toString("base64url")}` }
          : {}),
      };
      customer = await prisma.appCustomer.update({
        where: { id: customer.id },
        data: patch,
      });
    } else {
      for (let i = 0; i < 6; i++) {
        const customerCode = generateCustomerCode();
        try {
          customer = await prisma.appCustomer.create({
            data: {
              customerCode,
              /** Đăng nhập bằng SĐT cũng khớp username */
              username: phoneNormalized,
              passwordHash,
              status: "ACTIVE",
              fullName,
              phone: phoneDisplay,
              phoneNormalized,
              phoneLast4: shortId,
              shortId,
              segment: "WALK_IN",
              identityToken: `oq_${randomBytes(18).toString("base64url")}`,
              adminConfirmedAt: new Date(),
              adminNote: `Tạo đơn walk-in tại quầy ${zone}`,
            },
          });
          created = true;
          break;
        } catch (e) {
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002"
          ) {
            continue;
          }
          throw e;
        }
      }
      if (!customer) {
        return NextResponse.json(
          { error: "Không tạo được mã khách." },
          { status: 500 }
        );
      }
    }

    const service = await prisma.appService.findFirst({
      where: {
        OR: [
          { serviceCode: zone },
          { serviceCode: mapDeskZoneToService(zone) },
        ],
      },
      select: { id: true },
    });

    let scanEventId: string | null = null;
    if (service) {
      const scan = await prisma.appServiceEvent.create({
        data: {
          customerId: customer.id,
          serviceId: service.id,
          eventType: "SERVICE_USE",
          operationalStatus: "NEW",
          metadata: {
            source: "desk_walkin_order",
            createdByStaffId: gate.user.id,
          },
        },
      });
      scanEventId = scan.id;
    }

    const keepVip =
      String(customer.segment || "").toUpperCase() === "VIP" &&
      (!customer.vipExpiresAt || customer.vipExpiresAt.getTime() > Date.now());
    const segment = keepVip ? "VIP" : "WALK_IN";

    return NextResponse.json({
      ok: true,
      created,
      scanEventId,
      customer: {
        id: customer.id,
        customerCode: customer.customerCode,
        username: customer.username,
        fullName: customer.fullName,
        phone: customer.phone,
        shortId: customer.shortId || customer.phoneLast4,
        segment,
        segmentLabel: segment === "VIP" ? "VIP" : "Khách lẻ",
      },
      message: created
        ? "Đã tạo khách lẻ. Chọn món / vé rồi xác thực đơn."
        : "Đã mở khách. Chọn món / vé rồi xác thực đơn.",
    });
  } catch (e) {
    console.error("[desk/create-guest]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
