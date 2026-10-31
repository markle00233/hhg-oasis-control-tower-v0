import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireDeskZone } from "@/lib/auth";
import { activeCrmMemberships } from "@/lib/crm-membership";
import { deskZoneServiceCode } from "@/lib/desk-zones";
import {
  customerHasLoginAccount,
  deskSegmentOf,
} from "@/lib/desk-segment";
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

/** Khách lẻ không đăng nhập. Hash một lần cho cả process, không bcrypt mỗi đơn. */
let sharedWalkInHash: Promise<string> | null = null;
function walkInPasswordHash() {
  sharedWalkInHash ??= hashPassword(randomBytes(24).toString("base64url")).catch(
    (err) => {
      sharedWalkInHash = null;
      throw err;
    }
  );
  return sharedWalkInHash;
}

/**
 * Quầy tạo đơn:
 * - Có SĐT → tài khoản app (mật khẩu = SĐT). Nhãn: Khách / Member / VIP.
 * - anonymous → không tài khoản, nhãn Khách lẻ.
 * - Luôn mở 1 lần quét mới chưa xác thực để NV chọn món / vé.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const zone = String(body.zone || "").trim().toUpperCase();
    const gate = await requireDeskZone(zone);
    if ("error" in gate) return gate.error;

    const anonymous = body.anonymous === true;
    const fullName = String(body.fullName || "").trim().slice(0, 120);
    let customer: Awaited<ReturnType<typeof prisma.appCustomer.create>> | null =
      null;
    let created = false;

    if (anonymous) {
      const phoneRaw = String(body.phone || "").trim();
      if (fullName || phoneRaw) {
        return NextResponse.json(
          { error: "Xóa họ tên và số điện thoại trước khi tạo khách lẻ." },
          { status: 400 }
        );
      }
      const displayName = "Khách lẻ";
      const passwordHash = await walkInPasswordHash();
      for (let i = 0; i < 6; i++) {
        const customerCode = generateCustomerCode();
        const tag = customerCode.slice(4);
        try {
          customer = await prisma.appCustomer.create({
            data: {
              customerCode,
              username: `anon-${tag}`,
              passwordHash,
              status: "ACTIVE",
              fullName: displayName,
              segment: "WALK_IN",
              shortId: tag.slice(-4),
              adminConfirmedAt: new Date(),
              adminNote: `Đơn khách lẻ (không tài khoản) tại quầy ${zone}`,
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
          { error: "Không tạo được đơn khách lẻ." },
          { status: 500 }
        );
      }
    } else {
      if (!fullName) {
        return NextResponse.json({ error: "Nhập tên khách." }, { status: 400 });
      }
      const phoneRaw = String(body.phone || "").trim();
      const phoneNormalizedRaw = normalizePhone(phoneRaw);
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

      customer = await prisma.appCustomer.findFirst({
        where: {
          OR: [
            { phoneNormalized: { in: phoneKeys } },
            { phone: { in: phoneKeys } },
            { username: { in: phoneKeys } },
          ],
        },
        orderBy: { createdAt: "asc" },
      });

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
        const passwordHash = await hashPassword(password);
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
                adminNote: `Tạo đơn tại quầy ${zone}`,
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
    }

    /** Prefer mapped code (MIA_OLYMPIC → OLYMPIC_POOL) so vé hồ unlocks on the board. */
    const preferredService = deskZoneServiceCode(zone);
    const service = await prisma.appService.findFirst({
      where: {
        OR: [
          { serviceCode: preferredService },
          ...(preferredService !== zone ? [{ serviceCode: zone }] : []),
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
            staffName: gate.user.displayName || gate.user.username,
            ...(anonymous ? { anonymous: true } : {}),
          },
        },
      });
      scanEventId = scan.id;
    }

    const crm = customer.phoneNormalized
      ? await activeCrmMemberships([customer.phoneNormalized])
      : new Map();
    const marked = deskSegmentOf({
      segment: customer.segment,
      vipExpiresAt: customer.vipExpiresAt,
      vipPlanLabel: customer.vipPlanLabel,
      hasAccount: customerHasLoginAccount(customer),
      crmMember: !!(
        customer.phoneNormalized && crm.has(customer.phoneNormalized)
      ),
    });

    return NextResponse.json({
      ok: true,
      created,
      anonymous,
      scanEventId,
      customer: {
        id: customer.id,
        customerCode: customer.customerCode,
        username: customer.username,
        fullName: customer.fullName,
        phone: customer.phone,
        shortId: customer.shortId || customer.phoneLast4,
        segment: marked.segment,
        segmentLabel: marked.segmentLabel,
      },
      message: anonymous
        ? "Đã mở đơn khách lẻ. Chọn món / vé rồi xác thực đơn."
        : created
          ? "Đã tạo tài khoản. Chọn món / vé rồi xác thực đơn."
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
