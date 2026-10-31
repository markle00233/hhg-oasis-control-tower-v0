import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireDeskZone } from "@/lib/auth";
import { CART_STATUS } from "@/lib/cart-status";
import { deskZoneAliases, miaOlympicSector } from "@/lib/desk-zones";
import { releaseLongNuongTableHold } from "@/lib/long-nuong-activate";
import {
  applyOlympicMembership,
  pickPrimaryOlympicPackage,
} from "@/lib/olympic-membership";
import { awardCheckInPoints } from "@/lib/points";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Kept on the cart items so the customer clock starts at duyệt, not at send. */
function stampShiftStaff(
  items: unknown,
  user: { id: string; displayName?: string | null; username: string }
): Prisma.InputJsonValue {
  const rows = Array.isArray(items)
    ? items.filter(
        (row) =>
          !row ||
          typeof row !== "object" ||
          (row as { id?: string }).id !== "__staff"
      )
    : [];
  rows.push({
    id: "__staff",
    nameVi: "staff",
    qty: 1,
    priceVnd: 0,
    staffName: user.displayName?.trim() || user.username,
    staffUserId: user.id,
  });
  return rows as Prisma.InputJsonValue;
}

function stampCartApprovedAt(items: unknown, at: Date): Prisma.InputJsonValue {
  const rows = Array.isArray(items)
    ? items.filter(
        (row) =>
          !row ||
          typeof row !== "object" ||
          (row as { id?: string }).id !== "__approvedAt"
      )
    : [];
  rows.push({ id: "__approvedAt", approvedAt: at.toISOString() });
  return rows as Prisma.InputJsonValue;
}

/**
 * Staff: approve (OPEN), reject (REJECTED + adminNote),
 * or finalize (USED) after kế toán đã kiểm chứng từ.
 * Body: { zone, token, action?: "approve"|"reject"|"finalize", reason? }
 */

/** Duyệt gói tháng gắn luôn lên tài khoản khách (VIP, hạn, voucher). */
async function grantApprovedPackage(customerId: string, items: unknown) {
  const itemIds = Array.isArray(items)
    ? items
        .map((row) =>
          row && typeof row === "object"
            ? String((row as { id?: string }).id || "")
            : ""
        )
        .filter(Boolean)
    : [];
  const packageId = pickPrimaryOlympicPackage(itemIds);
  if (!packageId) return null;
  const applied = await applyOlympicMembership(prisma, {
    customerId,
    packageId,
    from: new Date(),
  }).catch((err) => {
    console.error("[approve-cart membership]", err);
    return null;
  });
  if (!applied || applied.alreadyActive) return null;
  return {
    planLabel: applied.vipPlanLabel,
    expiresAt: applied.vipExpiresAt,
    packageId,
  };
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const zone = String(body.zone || "").trim().toUpperCase();
    const token = String(body.token || body.cartToken || "")
      .trim()
      .replace(/^.*\/q\//, "");
    const rawAction = String(body.action || "approve").trim().toLowerCase();
    const action =
      rawAction === "reject"
        ? "reject"
        : rawAction === "finalize"
          ? "finalize"
          : "approve";
    const reason = String(body.reason || body.adminNote || "")
      .trim()
      .slice(0, 500);

    if (!zone || !token) {
      return NextResponse.json({ error: "Thiếu zone / token" }, { status: 400 });
    }
    if (action === "reject" && reason.length < 2) {
      return NextResponse.json(
        { error: "Nhập lý do từ chối trước khi gửi." },
        { status: 400 }
      );
    }

    const gate = await requireDeskZone(zone);
    if ("error" in gate) return gate.error;

    const aliases = deskZoneAliases(zone);
    const cart = await prisma.appServiceCart.findUnique({
      where: { token },
      select: {
        id: true,
        token: true,
        status: true,
        zoneCode: true,
        zoneName: true,
        totalVnd: true,
        items: true,
        adminNote: true,
        billPhotoAt: true,
        customerId: true,
        expiresAt: true,
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            shortId: true,
            phoneLast4: true,
            customerCode: true,
            segment: true,
            vipExpiresAt: true,
            vipPlanLabel: true,
          },
        },
      },
    });

    if (!cart) {
      return NextResponse.json({ error: "Không tìm thấy yêu cầu." }, { status: 404 });
    }
    if (!aliases.includes(cart.zoneCode.toUpperCase())) {
      return NextResponse.json(
        { error: `Yêu cầu thuộc khu ${cart.zoneCode}, không phải quầy này.` },
        { status: 403 }
      );
    }

    if (action === "finalize") {
      if (!miaOlympicSector(cart.zoneCode)) {
        return NextResponse.json(
          { error: "Khu này chưa chốt đơn tại đây." },
          { status: 400 }
        );
      }
      if (cart.status === CART_STATUS.USED) {
        const membership = await grantApprovedPackage(
          cart.customerId,
          cart.items
        );
        return NextResponse.json({
          ok: true,
          already: true,
          cart: serialize(cart),
          customer: cart.customer,
          membership,
        });
      }
      if (cart.status !== CART_STATUS.OPEN) {
        return NextResponse.json(
          { error: "Duyệt đơn trước khi chốt." },
          { status: 409 }
        );
      }
      if (!cart.billPhotoAt) {
        return NextResponse.json(
          { error: "Bổ sung chứng từ trước khi chốt." },
          { status: 400 }
        );
      }
      const updated = await prisma.appServiceCart.update({
        where: { id: cart.id },
        data: { status: CART_STATUS.USED },
      });
      const membership = await grantApprovedPackage(cart.customerId, cart.items);
      return NextResponse.json({
        ok: true,
        cart: serialize(updated),
        customer: cart.customer,
        membership,
      });
    }

    if (action === "approve") {
      if (cart.status === CART_STATUS.OPEN) {
        const membership = await grantApprovedPackage(
          cart.customerId,
          cart.items
        );
        return NextResponse.json({
          ok: true,
          already: true,
          cart: serialize(cart, CART_STATUS.OPEN),
          customer: cart.customer,
          membership,
        });
      }
      if (cart.status !== CART_STATUS.PENDING) {
        return NextResponse.json(
          { error: `Không duyệt được (trạng thái ${cart.status}).` },
          { status: 409 }
        );
      }
      if (cart.expiresAt < new Date()) {
        await prisma.appServiceCart
          .update({
            where: { id: cart.id },
            data: { status: CART_STATUS.EXPIRED },
          })
          .catch(() => undefined);
        return NextResponse.json({ error: "Yêu cầu đã hết hạn." }, { status: 410 });
      }

      const {
        cartItemsIncludeMembership,
        isOlympicMembershipActive,
      } = await import("@/lib/olympic-membership");
      if (
        cartItemsIncludeMembership(cart.items) &&
        isOlympicMembershipActive({
          segment: cart.customer.segment,
          vipExpiresAt: cart.customer.vipExpiresAt,
        })
      ) {
        const exp = cart.customer.vipExpiresAt
          ? cart.customer.vipExpiresAt.toLocaleDateString("vi-VN")
          : null;
        return NextResponse.json(
          {
            error: exp
              ? `Khách đang dùng ${cart.customer.vipPlanLabel || "gói hội viên"} đến ${exp}. Hết hạn mới duyệt gói mới.`
              : "Khách đang dùng gói hội viên. Hết hạn mới duyệt gói mới.",
          },
          { status: 409 }
        );
      }

      const approvedAt = new Date();
      const updated = await prisma.appServiceCart.update({
        where: { id: cart.id },
        data: {
          status: CART_STATUS.OPEN,
          adminNote: null,
          approvedAt,
          items: stampShiftStaff(
            stampCartApprovedAt(cart.items, approvedAt),
            gate.user
          ),
        },
      });

      if (cart.zoneCode.toUpperCase() === "LONG_NUONG") {
        const { parseCartTableRef } = await import("@/lib/long-nuong-activate");
        const ref = parseCartTableRef(cart.items);
        if (ref.bookingId) {
          await prisma.appBooking
            .updateMany({
              where: { id: ref.bookingId, status: "PENDING" },
              data: { status: "CONFIRMED" },
            })
            .catch((err) =>
              console.error("[approve-cart long-nuong booking]", err)
            );
        }
      }

      const membership = await grantApprovedPackage(cart.customerId, cart.items);

      const pts = await awardCheckInPoints({
        customerId: cart.customerId,
        refType: "SERVICE_CART",
        refId: cart.id,
        note: `Check-in ${cart.zoneCode}`,
      }).catch((err) => {
        console.error("[desk/approve-cart points]", err);
        return null;
      });
      return NextResponse.json({
        ok: true,
        cart: serialize(updated),
        customer: cart.customer,
        pointsAwarded: pts?.delta ?? 0,
        pointsBalance: pts?.balance ?? null,
        membership,
      });
    }

    // reject
    if (
      cart.status !== CART_STATUS.PENDING &&
      cart.status !== CART_STATUS.OPEN
    ) {
      return NextResponse.json(
        { error: `Không từ chối được (trạng thái ${cart.status}).` },
        { status: 409 }
      );
    }
    const updated = await prisma.appServiceCart.update({
      where: { id: cart.id },
      data: { status: CART_STATUS.REJECTED, adminNote: reason },
    });
    if (cart.zoneCode.toUpperCase() === "LONG_NUONG") {
      await releaseLongNuongTableHold(cart.items).catch((err) =>
        console.error("[approve-cart release table]", err)
      );
    }
    let pointsBalance: number | null = null;
    try {
      const { settlePointsOnCancel } = await import("@/lib/points-refund");
      const settled = await settlePointsOnCancel({
        customerId: cart.customerId,
        refIds: [cart.id],
        note: "Hoàn điểm · quầy từ chối",
      });
      pointsBalance = settled.balance;
    } catch (err) {
      console.error("[approve-cart refund points]", err);
    }
    // Hoàn lượt voucher hội viên (đã trừ khi tạo vé)
    try {
      const { isLimitedMembershipVoucher } = await import("@/lib/hhg-vouchers");
      const { refundMembershipVoucherUse } = await import(
        "@/lib/membership-voucher-qty"
      );
      const items = Array.isArray(cart.items) ? cart.items : [];
      const offerIds = new Set<string>();
      for (const row of items) {
        if (!row || typeof row !== "object") continue;
        const id = String((row as { id?: string }).id || "");
        if (id.startsWith("voucher-")) {
          for (const oid of id.slice("voucher-".length).split("+")) {
            if (oid.trim()) offerIds.add(oid.trim());
          }
        }
      }
      for (const offerId of offerIds) {
        if (!isLimitedMembershipVoucher(offerId)) continue;
        await refundMembershipVoucherUse(prisma, {
          customerId: cart.customerId,
          offerId,
        });
      }
    } catch (err) {
      console.error("[approve-cart refund voucher]", err);
    }
    return NextResponse.json({
      ok: true,
      cart: serialize(updated),
      customer: cart.customer,
      pointsBalance,
    });
  } catch (e) {
    console.error("[desk/approve-cart]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

function serialize(
  cart: {
    token: string;
    status: string;
    zoneCode: string;
    zoneName: string | null;
    totalVnd: number;
    items: unknown;
    adminNote?: string | null;
  },
  statusOverride?: string
) {
  return {
    token: cart.token,
    status: statusOverride || cart.status,
    zoneCode: cart.zoneCode,
    zoneName: cart.zoneName,
    totalVnd: cart.totalVnd,
    items: cart.items,
    adminNote: cart.adminNote ?? null,
  };
}
