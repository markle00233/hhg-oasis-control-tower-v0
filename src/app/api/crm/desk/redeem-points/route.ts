import { NextRequest, NextResponse } from "next/server";
import { requireAuth, canAccessDeskZone, isSystemAdmin } from "@/lib/auth";
import { getMiaOiItem, MIAOI_MENU } from "@/lib/miaoi-menu";
import { getPoolItem } from "@/lib/olympic-pool-menu";
import {
  REDEEM_DRINK_MAX_VND,
  REDEEM_TIER_DRINK,
  REDEEM_TIER_SWIM,
  redeemPoints,
} from "@/lib/points";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Đổi điểm tại quầy.
 * Body: { customerId, tier: 50|100, itemId, zone? }
 * 50 → đồ uống Mía Ơi ≤50k · 100 → vé bơi (ticket pool).
 * Luôn trừ đủ tier điểm dù món rẻ hơn.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const customerId = String(body.customerId || "").trim();
    const itemId = String(body.itemId || "").trim();
    const tier = Math.round(Number(body.tier) || 0);
    const zoneHint = String(body.zone || "").trim().toUpperCase();

    if (!customerId || !itemId) {
      return NextResponse.json(
        { error: "Thiếu customerId hoặc món đổi." },
        { status: 400 }
      );
    }
    if (tier !== REDEEM_TIER_DRINK && tier !== REDEEM_TIER_SWIM) {
      return NextResponse.json(
        { error: "Chỉ hỗ trợ đổi 50 hoặc 100 điểm." },
        { status: 400 }
      );
    }

    const needZone =
      tier === REDEEM_TIER_DRINK ? "MIA_OI" : "OLYMPIC_POOL";
    if (
      !isSystemAdmin(auth.user) &&
      !canAccessDeskZone(auth.user, needZone) &&
      !(zoneHint && canAccessDeskZone(auth.user, zoneHint))
    ) {
      return NextResponse.json(
        {
          error:
            tier === REDEEM_TIER_DRINK
              ? "Đổi 50 điểm (đồ uống) tại quầy Mía Ơi hoặc admin."
              : "Đổi 100 điểm (vé bơi) tại quầy Hồ Olympic hoặc admin.",
        },
        { status: 403 }
      );
    }

    let itemName = "";
    let itemPrice = 0;
    let serviceCode = needZone;
    let redeemNote = "";

    if (tier === REDEEM_TIER_DRINK) {
      const item = getMiaOiItem(itemId);
      if (!item || item.priceVnd > REDEEM_DRINK_MAX_VND) {
        return NextResponse.json(
          {
            error: `Món đổi 50 điểm phải ≤ ${REDEEM_DRINK_MAX_VND.toLocaleString("vi-VN")}đ.`,
          },
          { status: 400 }
        );
      }
      itemName = item.nameVi;
      itemPrice = item.priceVnd;
      serviceCode = "MIA_OI";
      redeemNote = `Đổi 50 điểm → ${item.nameVi} (${item.priceVnd}đ)`;
    } else {
      const item = getPoolItem(itemId);
      if (
        !item ||
        (item.category !== "tre-em" && item.category !== "nguoi-lon")
      ) {
        return NextResponse.json(
          { error: "100 điểm chỉ đổi vé bơi (không phải gói tháng / phụ kiện)." },
          { status: 400 }
        );
      }
      itemName = item.nameVi;
      itemPrice = item.priceVnd;
      serviceCode = "OLYMPIC_POOL";
      redeemNote = `Đổi 100 điểm → ${item.nameVi} (${item.priceVnd}đ)`;
    }

    const customer = await prisma.appCustomer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        status: true,
        fullName: true,
        phone: true,
        pointsBalance: true,
      },
    });
    if (!customer || customer.status !== "ACTIVE") {
      return NextResponse.json({ error: "Khách không hợp lệ." }, { status: 404 });
    }
    if (customer.pointsBalance < tier) {
      return NextResponse.json(
        {
          error: `Không đủ điểm (cần ${tier}, đang có ${customer.pointsBalance}).`,
        },
        { status: 400 }
      );
    }

    const service = await prisma.appService.findUnique({
      where: { serviceCode },
      select: { id: true },
    });
    if (!service) {
      return NextResponse.json(
        { error: `Chưa cấu hình dịch vụ ${serviceCode}.` },
        { status: 500 }
      );
    }

    const order = await prisma.appOrder.create({
      data: {
        customerId: customer.id,
        serviceId: service.id,
        status: "CONFIRMED",
        totalVnd: 0,
        note: `${redeemNote} · staff ${auth.user.username}`,
        items: {
          create: [
            {
              itemId,
              nameVi: itemName,
              nameEn: null,
              unitPriceVnd: itemPrice,
              qty: 1,
            },
          ],
        },
      },
    });

    const pts = await redeemPoints({
      customerId: customer.id,
      cost: tier,
      refType: "APP_ORDER",
      refId: `redeem:${order.id}`,
      note: redeemNote,
    });

    if (!pts.redeemed && pts.delta === 0) {
      // Race / already redeemed — keep order as record if balance was ok
      const refreshed = await prisma.appCustomer.findUnique({
        where: { id: customer.id },
        select: { pointsBalance: true },
      });
      return NextResponse.json({
        ok: true,
        already: true,
        tier,
        itemId,
        itemName,
        catalogPriceVnd: itemPrice,
        chargedVnd: 0,
        pointsBurned: tier,
        pointsBalance: refreshed?.pointsBalance ?? pts.balance,
        orderId: order.id,
      });
    }

    return NextResponse.json({
      ok: true,
      tier,
      itemId,
      itemName,
      catalogPriceVnd: itemPrice,
      chargedVnd: 0,
      pointsBurned: tier,
      pointsBalance: pts.balance,
      orderId: order.id,
      note: redeemNote,
    });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e
        ? Number((e as { status: number }).status) || 500
        : 500;
    if (status < 500) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Redeem failed" },
        { status }
      );
    }
    console.error("[desk/redeem-points]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Redeem failed" },
      { status: 500 }
    );
  }
}

/** Catalog món đổi điểm theo tier. */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const tier = Math.round(
    Number(new URL(req.url).searchParams.get("tier") || 0)
  );
  if (tier === REDEEM_TIER_DRINK) {
    const items = MIAOI_MENU.filter((i) => i.priceVnd <= REDEEM_DRINK_MAX_VND).map(
      (i) => ({
        id: i.id,
        nameVi: i.nameVi,
        priceVnd: i.priceVnd,
        category: i.category,
      })
    );
    return NextResponse.json({
      ok: true,
      tier,
      cost: REDEEM_TIER_DRINK,
      maxItemVnd: REDEEM_DRINK_MAX_VND,
      items,
    });
  }
  if (tier === REDEEM_TIER_SWIM) {
    const { POOL_MENU } = await import("@/lib/olympic-pool-menu");
    const items = POOL_MENU.filter(
      (i) => i.category === "tre-em" || i.category === "nguoi-lon"
    ).map((i) => ({
      id: i.id,
      nameVi: i.nameVi,
      priceVnd: i.priceVnd,
      category: i.category,
    }));
    return NextResponse.json({
      ok: true,
      tier,
      cost: REDEEM_TIER_SWIM,
      items,
    });
  }
  return NextResponse.json(
    { error: "tier phải là 50 hoặc 100." },
    { status: 400 }
  );
}
