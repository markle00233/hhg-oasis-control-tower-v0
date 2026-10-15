import { NextRequest, NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import {
  CART_STATUS,
  createServiceCart,
  serviceCartQrPayload,
  type CartItemInput,
} from "@/lib/service-cart";
import { parseCartTableRef } from "@/lib/long-nuong";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** Create multi-service request — PENDING until desk confirms → OPEN QR. */
export async function POST(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const zoneCode = String(body.zoneCode || "").trim().toUpperCase();
    const zoneName = String(body.zoneName || "").trim() || undefined;
    const items = Array.isArray(body.items)
      ? (body.items as CartItemInput[])
      : [];
    const offerIds = Array.from(
      new Set(
        [
          ...(Array.isArray(body.offerIds) ? body.offerIds : []),
          body.offerId,
        ]
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )
    );
    const discountVnd = Math.max(0, Math.round(Number(body.discountVnd) || 0));

    if (!zoneCode) {
      return NextResponse.json({ error: "Thiếu khu vực." }, { status: 400 });
    }

    const {
      cart,
      payload,
      discountVnd: applied,
      offerIds: savedOfferIds,
    } = await createServiceCart({
      customerId: customer.id,
      zoneCode,
      zoneName,
      items,
      discountVnd,
      offerIds,
    });

    if (savedOfferIds.length) {
      await prisma.appCollectedOffer
        .updateMany({
          where: {
            customerId: customer.id,
            offerId: { in: savedOfferIds },
            status: "COLLECTED",
          },
          data: { status: "USED", usedAt: new Date() },
        })
        .catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      cart: {
        id: cart.id,
        token: cart.token,
        zoneCode: cart.zoneCode,
        zoneName: cart.zoneName,
        items: cart.items,
        totalVnd: cart.totalVnd,
        status: cart.status,
        expiresAt: cart.expiresAt,
      },
      discountVnd: applied,
      /** Only usable after desk approves (status OPEN) */
      payload: cart.status === CART_STATUS.OPEN ? payload : null,
      customer: {
        fullName: customer.fullName,
        customerCode: customer.customerCode,
      },
    });
  } catch (e) {
    console.error("[me/cart POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** Customer deletes unused ticket → CANCELLED (desk shows Xóa). */
export async function DELETE(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const token = String(
      body.token || req.nextUrl.searchParams.get("token") || ""
    ).trim();
    if (!token) {
      return NextResponse.json({ error: "Thiếu token" }, { status: 400 });
    }
    const cart = await prisma.appServiceCart.findFirst({
      where: { token, customerId: customer.id },
    });
    if (!cart) {
      return NextResponse.json({ error: "Không tìm thấy vé" }, { status: 404 });
    }
    if (cart.status === CART_STATUS.USED) {
      return NextResponse.json(
        { error: "Vé đã dùng, không xoá được." },
        { status: 409 }
      );
    }
    await prisma.appServiceCart.update({
      where: { id: cart.id },
      data: { status: CART_STATUS.CANCELLED },
    });
    if (cart.zoneCode.toUpperCase() === "LONG_NUONG") {
      const ref = parseCartTableRef(cart.items);
      if (ref.bookingId) {
        await prisma.appBooking
          .updateMany({
            where: {
              id: ref.bookingId,
              status: {
                in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN"],
              },
            },
            data: { status: "CANCELLED" },
          })
          .catch(() => undefined);
      }
      if (ref.resourceId) {
        const active = await prisma.appResourceSession.findFirst({
          where: { resourceId: ref.resourceId, status: "OCCUPIED" },
        });
        if (!active) {
          await prisma.appResource
            .updateMany({
              where: { id: ref.resourceId, status: "RESERVED" },
              data: { status: "AVAILABLE" },
            })
            .catch(() => undefined);
        }
      }
    }
    return NextResponse.json({ ok: true, status: CART_STATUS.CANCELLED });
  } catch (e) {
    console.error("[me/cart DELETE]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/**
 * List pending + open (+ rejected) carts.
 * ?token=sc_… → lightweight status poll (no list).
 */
export async function GET(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = String(req.nextUrl.searchParams.get("token") || "").trim();
    if (token) {
      const cart = await prisma.appServiceCart.findFirst({
        where: { token, customerId: customer.id },
        select: {
          token: true,
          status: true,
          zoneCode: true,
          zoneName: true,
          totalVnd: true,
          adminNote: true,
          updatedAt: true,
        },
      });
      if (!cart) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        token: cart.token,
        status: cart.status,
        zoneCode: cart.zoneCode,
        zoneName: cart.zoneName,
        totalVnd: cart.totalVnd,
        adminNote: cart.adminNote,
        payload:
          cart.status === CART_STATUS.OPEN
            ? serviceCartQrPayload(cart.token)
            : null,
      });
    }

    const now = new Date();
    const carts = await prisma.appServiceCart.findMany({
      where: {
        customerId: customer.id,
        OR: [
          { status: CART_STATUS.PENDING, expiresAt: { gt: now } },
          { status: CART_STATUS.OPEN, expiresAt: { gt: now } },
          {
            status: CART_STATUS.REJECTED,
            updatedAt: { gte: new Date(Date.now() - 48 * 3600_000) },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return NextResponse.json({
      ok: true,
      carts: carts.map((c) => ({
        ...c,
        payload:
          c.status === CART_STATUS.OPEN
            ? serviceCartQrPayload(c.token)
            : null,
      })),
    });
  } catch (e) {
    console.error("[me/cart GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
