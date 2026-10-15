import { NextRequest, NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { getOfferById, HOME_OFFERS } from "@/lib/home-services";
import { prisma } from "@/lib/prisma";
import { isVipActive } from "@/lib/vip";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

function isHhgVipOffer(offerId: string) {
  return offerId.startsWith("hhg-");
}

/** List catalog + collected status for this customer. */
export async function GET() {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const vip = isVipActive({
      segment: customer.segment,
      vipExpiresAt: customer.vipExpiresAt,
    });

    const rows = await prisma.appCollectedOffer.findMany({
      where: {
        customerId: customer.id,
        status: { in: ["COLLECTED", "USED"] },
      },
      orderBy: { collectedAt: "desc" },
    });
    const byId = new Map(rows.map((r) => [r.offerId, r]));
    const offers = HOME_OFFERS.map((o) => {
      const row = byId.get(o.id);
      return {
        ...o,
        collected: !!row,
        status: row?.status || null,
        collectedAt: row?.collectedAt || null,
      };
    });
    // Đặc quyền VIP chỉ còn khi gói còn hạn; hết hạn → không trả wallet VIP
    const wallet = rows
      .filter((r) => r.status === "COLLECTED")
      .map((r) => {
        const o = getOfferById(r.offerId);
        if (!o) return null;
        if (isHhgVipOffer(r.offerId) && !vip) return null;
        return {
          ...o,
          status: r.status,
          collectedAt: r.collectedAt,
          claimId: r.id,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, vip, offers, wallet });
  } catch (e) {
    console.error("[me/offers GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** Collect an offer. Body: { offerId } */
export async function POST(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const offerId = String(body.offerId || "").trim();
    const offer = getOfferById(offerId);
    if (!offer) {
      return NextResponse.json({ error: "Ưu đãi không hợp lệ." }, { status: 404 });
    }

    const existing = await prisma.appCollectedOffer.findUnique({
      where: {
        customerId_offerId: { customerId: customer.id, offerId },
      },
    });
    if (existing?.status === "COLLECTED") {
      return NextResponse.json({
        ok: true,
        already: true,
        status: "COLLECTED",
        offer,
      });
    }
    if (existing?.status === "USED") {
      return NextResponse.json(
        { error: "Ưu đãi này đã dùng rồi." },
        { status: 409 }
      );
    }

    const row = existing
      ? await prisma.appCollectedOffer.update({
          where: { id: existing.id },
          data: { status: "COLLECTED", collectedAt: new Date(), usedAt: null },
        })
      : await prisma.appCollectedOffer.create({
          data: {
            customerId: customer.id,
            offerId,
            status: "COLLECTED",
          },
        });

    return NextResponse.json({
      ok: true,
      status: row.status,
      offer,
    });
  } catch (e) {
    console.error("[me/offers POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** Mark voucher used. Body: { offerId } */
export async function PATCH(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const offerId = String(body.offerId || "").trim();
    if (!offerId) {
      return NextResponse.json({ error: "Thiếu offerId" }, { status: 400 });
    }
    const row = await prisma.appCollectedOffer.findUnique({
      where: {
        customerId_offerId: { customerId: customer.id, offerId },
      },
    });
    if (!row || row.status !== "COLLECTED") {
      return NextResponse.json(
        { error: "Không có voucher để dùng." },
        { status: 404 }
      );
    }
    await prisma.appCollectedOffer.update({
      where: { id: row.id },
      data: { status: "USED", usedAt: new Date() },
    });
    return NextResponse.json({ ok: true, status: "USED" });
  } catch (e) {
    console.error("[me/offers PATCH]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
