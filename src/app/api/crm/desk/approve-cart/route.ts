import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { CART_STATUS } from "@/lib/cart-status";
import { deskZoneAliases } from "@/lib/desk-zones";
import { releaseLongNuongTableHold } from "@/lib/long-nuong-activate";
import { awardCheckInPoints } from "@/lib/points";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Staff: approve (OPEN) or reject (REJECTED + adminNote).
 * Body: { zone, token, action?: "approve"|"reject", reason? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const zone = String(body.zone || "").trim().toUpperCase();
    const token = String(body.token || body.cartToken || "")
      .trim()
      .replace(/^.*\/q\//, "");
    const action =
      String(body.action || "approve").trim().toLowerCase() === "reject"
        ? "reject"
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

    if (action === "approve") {
      if (cart.status === CART_STATUS.OPEN) {
        return NextResponse.json({
          ok: true,
          already: true,
          cart: serialize(cart, CART_STATUS.OPEN),
          customer: cart.customer,
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
      const updated = await prisma.appServiceCart.update({
        where: { id: cart.id },
        data: { status: CART_STATUS.OPEN, adminNote: null },
      });
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
    return NextResponse.json({
      ok: true,
      cart: serialize(updated),
      customer: cart.customer,
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
