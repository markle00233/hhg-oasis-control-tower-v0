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

/** Quầy tạo khách lẻ: lưu tên + SĐT, hiện trên dashboard khu. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const zone = String(body.zone || "").trim().toUpperCase();
    const gate = await requireDeskZone(zone);
    if ("error" in gate) return gate.error;

    const fullName = String(body.fullName || "").trim().slice(0, 120);
    const phoneRaw = String(body.phone || "").trim();
    const wantSegment =
      String(body.segment || "WALK_IN").trim().toUpperCase() === "MEMBER"
        ? "MEMBER"
        : "WALK_IN";
    const phoneNormalized = normalizePhone(phoneRaw);
    if (!fullName) {
      return NextResponse.json({ error: "Nhập tên khách." }, { status: 400 });
    }
    if (phoneNormalized.length < 9 || phoneNormalized.length > 11) {
      return NextResponse.json(
        { error: "SĐT không hợp lệ (9–11 số)." },
        { status: 400 }
      );
    }
    const phoneDisplay = phoneNormalized.startsWith("0")
      ? phoneNormalized
      : `0${phoneNormalized}`;
    const shortId = phoneShortId(phoneDisplay);

    let customer = await prisma.appCustomer.findFirst({
      where: { phoneNormalized },
    });
    let created = false;

    if (customer) {
      customer = await prisma.appCustomer.update({
        where: { id: customer.id },
        data: {
          fullName,
          phone: phoneDisplay,
          phoneLast4: shortId,
          shortId,
          status: "ACTIVE",
          segment:
            customer.segment === "VIP" ? "VIP" : wantSegment,
          ...(!customer.identityToken
            ? { identityToken: `oq_${randomBytes(18).toString("base64url")}` }
            : {}),
        },
      });
    } else {
      const passwordHash = await hashPassword(
        `desk_${randomBytes(12).toString("base64url")}`
      );
      for (let i = 0; i < 6; i++) {
        const customerCode = generateCustomerCode();
        try {
          customer = await prisma.appCustomer.create({
            data: {
              customerCode,
              username: customerCode,
              passwordHash,
              status: "ACTIVE",
              fullName,
              phone: phoneDisplay,
              phoneNormalized,
              phoneLast4: shortId,
              shortId,
              segment: wantSegment,
              identityToken: `oq_${randomBytes(18).toString("base64url")}`,
              adminConfirmedAt: new Date(),
              adminNote: `Tạo tại quầy ${zone}`,
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
      const recent = await prisma.appServiceEvent.findFirst({
        where: {
          customerId: customer.id,
          serviceId: service.id,
          eventType: "SERVICE_USE",
          createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
      });
      if (recent) {
        scanEventId = recent.id;
      } else {
        const scan = await prisma.appServiceEvent.create({
          data: {
            customerId: customer.id,
            serviceId: service.id,
            eventType: "SERVICE_USE",
            operationalStatus: "ACKNOWLEDGED",
            metadata: {
              source: "desk_create_guest",
              createdByStaffId: gate.user.id,
            },
          },
        });
        scanEventId = scan.id;
      }
    }

    const segment =
      customer.segment === "MEMBER" || customer.segment === "VIP"
        ? customer.segment
        : "WALK_IN";

    return NextResponse.json({
      ok: true,
      created,
      scanEventId,
      customer: {
        id: customer.id,
        customerCode: customer.customerCode,
        fullName: customer.fullName,
        phone: customer.phone,
        shortId: customer.shortId || customer.phoneLast4,
        segment,
        segmentLabel: segment === "MEMBER" ? "Member" : "Khách lẻ",
      },
      message: created
        ? "Đã tạo khách mới."
        : "SĐT đã có — cập nhật tên và mở khách.",
    });
  } catch (e) {
    console.error("[desk/create-guest]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
