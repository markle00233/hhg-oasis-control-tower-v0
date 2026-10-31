import { NextRequest, NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { getOfferById, HOME_OFFERS } from "@/lib/home-services";
import { prisma } from "@/lib/prisma";
import { isVipActive, vipExpiryLabel } from "@/lib/vip";
import {
  isDurationMembershipVoucher,
  isLimitedMembershipVoucher,
  isMiaOiMembershipVoucher,
} from "@/lib/hhg-vouchers";
import {
  consumeMembershipVoucherUse,
  ensureMembershipVoucherQty,
} from "@/lib/membership-voucher-qty";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

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

    const missingQty = vip
      ? rows.filter(
          (r) =>
            isDurationMembershipVoucher(r.offerId) &&
            isLimitedMembershipVoucher(r.offerId) &&
            (r.qtyTotal == null || r.qtyRemaining == null)
        )
      : [];
    if (missingQty.length) {
      await Promise.all(
        missingQty.map((r) =>
          ensureMembershipVoucherQty(prisma, {
            customerId: customer.id,
            offerId: r.offerId,
          }).catch(() => undefined)
        )
      );
    }

    const fresh = missingQty.length
      ? await prisma.appCollectedOffer.findMany({
          where: {
            customerId: customer.id,
            status: { in: ["COLLECTED", "USED"] },
          },
          orderBy: { collectedAt: "desc" },
        })
      : rows;

    const byId = new Map(fresh.map((r) => [r.offerId, r]));
    const offers = HOME_OFFERS.map((o) => {
      const row = byId.get(o.id);
      return {
        ...o,
        collected: !!row,
        status: row?.status || null,
        collectedAt: row?.collectedAt || null,
        qtyTotal: row?.qtyTotal ?? null,
        qtyRemaining: row?.qtyRemaining ?? null,
      };
    });

    const vipExpiresLabel = vip
      ? vipExpiryLabel(customer.vipExpiresAt)
      : null;

    // Ví = COLLECTED (kể cả hết lượt 0/N — thẻ vẫn hiện)
    // Voucher hội viên: hiệu lực từ ngày nâng cấp → hết hạn gói
    const wallet = fresh
      .filter((r) => r.status === "COLLECTED")
      // Mía % là quyền gói VIP, không còn thẻ voucher trong ví.
      .filter((r) => !isMiaOiMembershipVoucher(r.offerId))
      .map((r) => {
        const o = getOfferById(r.offerId);
        if (!o) return null;
        const qtyTotal = r.qtyTotal ?? null;
        const qtyRemaining = r.qtyRemaining ?? null;
        const exhausted =
          qtyTotal != null && (qtyRemaining == null || qtyRemaining <= 0);
        const membership = isDurationMembershipVoucher(r.offerId);
        const membershipExpired = membership && !vip;
        const unlimitedInTerm =
          membership && !isLimitedMembershipVoucher(r.offerId);
        return {
          ...o,
          status: r.status,
          collectedAt: r.collectedAt,
          claimId: r.id,
          qtyTotal,
          qtyRemaining,
          exhausted,
          membership,
          membershipExpired,
          unlimitedInTerm,
          validUntilLabel: membership ? vipExpiresLabel : null,
          canUse: !exhausted && !membershipExpired,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      ok: true,
      vip,
      vipExpiresLabel,
      offers,
      wallet,
    });
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
        qtyTotal: existing.qtyTotal,
        qtyRemaining: existing.qtyRemaining,
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
      qtyTotal: row.qtyTotal,
      qtyRemaining: row.qtyRemaining,
    });
  } catch (e) {
    console.error("[me/offers POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** Mark voucher used / trừ 1 lần hội viên. Body: { offerId } */
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

    if (isDurationMembershipVoucher(offerId)) {
      try {
        const used = await consumeMembershipVoucherUse(prisma, {
          customerId: customer.id,
          offerId,
        });
        return NextResponse.json({
          ok: true,
          status: "COLLECTED",
          duration: true,
          ...used,
        });
      } catch (err) {
        const status =
          err && typeof err === "object" && "status" in err
            ? Number((err as { status: number }).status) || 500
            : 500;
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Failed" },
          { status }
        );
      }
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
