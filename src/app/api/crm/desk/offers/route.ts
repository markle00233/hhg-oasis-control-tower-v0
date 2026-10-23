import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  canAccessDeskZone,
  isSystemAdmin,
  requireDeskZone,
} from "@/lib/auth";
import {
  getDeskHhgVoucher,
  offerMatchesDeskZone,
  vouchersUsableAtZone,
} from "@/lib/hhg-vouchers";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function deskZoneAliases(zone: string) {
  const z = zone.toUpperCase();
  if (z === "SAUNA" || z === "SPA") return ["SAUNA", "SPA"];
  return [z];
}

/**
 * Tra SĐT → voucher COLLECTED + lịch sử claim.
 * GET ?phone=…&zone=SAUNA|LONG_NUONG
 * GET ?history=1&zone=…  → log theo khu (hoặc all nếu admin + không zone)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const history = url.searchParams.get("history") === "1";
  const zone = String(url.searchParams.get("zone") || "").trim().toUpperCase();
  const phoneRaw = String(url.searchParams.get("phone") || "").trim();

  if (history) {
    if (zone) {
      const gate = await requireDeskZone(zone);
      if ("error" in gate) return gate.error;
    } else if (!isSystemAdmin(auth.user)) {
      return NextResponse.json(
        { error: "Cần zone để xem lịch sử claim." },
        { status: 400 }
      );
    }

    const aliases = zone ? deskZoneAliases(zone) : undefined;
    const logs = await prisma.appOfferClaimLog.findMany({
      where: {
        ...(aliases ? { zoneCode: { in: aliases } } : {}),
        note: { startsWith: "Quét QR voucher" },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        customer: {
          select: { fullName: true, phone: true, customerCode: true },
        },
      },
    });
    return NextResponse.json({
      ok: true,
      zone: zone || "ALL",
      logs: logs.map((l) => ({
        id: l.id,
        at: l.createdAt,
        offerId: l.offerId,
        offerTitle: l.offerTitle,
        zoneCode: l.zoneCode,
        claimedByName: l.claimedByName,
        phone: l.phoneSnapshot || l.customer.phone,
        customerName: l.customer.fullName,
        customerCode: l.customer.customerCode,
        note: l.note,
      })),
    });
  }

  const customerId = String(url.searchParams.get("customerId") || "").trim();
  if (!phoneRaw && !customerId) {
    return NextResponse.json(
      { error: "Thiếu số điện thoại hoặc customerId." },
      { status: 400 }
    );
  }
  if (!zone) {
    return NextResponse.json({ error: "Thiếu zone." }, { status: 400 });
  }
  const gate = await requireDeskZone(zone);
  if ("error" in gate) return gate.error;

  const phoneNormalized = phoneRaw ? normalizePhone(phoneRaw) : "";
  if (phoneRaw && phoneNormalized.length < 9) {
    return NextResponse.json(
      { error: "Số điện thoại không hợp lệ." },
      { status: 400 }
    );
  }

  const customerSelect = {
    id: true,
    fullName: true,
    phone: true,
    phoneNormalized: true,
    customerCode: true,
    segment: true,
    pointsBalance: true,
    vipPlanLabel: true,
    vipExpiresAt: true,
  } as const;

  const customer = customerId
    ? await prisma.appCustomer.findFirst({
        where: { id: customerId, status: "ACTIVE" },
        select: customerSelect,
      })
    : await prisma.appCustomer.findFirst({
        where: {
          OR: [
            { phoneNormalized },
            { phone: phoneRaw },
            { phone: { contains: phoneNormalized.slice(-9) } },
          ],
          status: "ACTIVE",
        },
        select: customerSelect,
      });
  if (!customer) {
    return NextResponse.json(
      { error: "Không tìm thấy khách với SĐT này." },
      { status: 404 }
    );
  }

  const claimable = vouchersUsableAtZone(zone);
  const claimableIds = claimable.map((v) => v.id);
  const rows =
    claimableIds.length === 0
      ? []
      : await prisma.appCollectedOffer.findMany({
          where: {
            customerId: customer.id,
            status: "COLLECTED",
            offerId: { in: claimableIds },
          },
          orderBy: { collectedAt: "desc" },
        });

  const wallet = rows.map((r) => {
    const meta = getDeskHhgVoucher(r.offerId);
    const qtyTotal = r.qtyTotal ?? null;
    const qtyRemaining = r.qtyRemaining ?? null;
    const exhausted =
      qtyTotal != null && (qtyRemaining == null || qtyRemaining <= 0);
    return {
      claimId: r.id,
      offerId: r.offerId,
      title: meta?.title || r.offerId,
      subtitle: meta?.subtitle || "",
      zoneCode: meta?.zoneCode || "",
      zoneLabel: meta?.zoneLabel || "",
      discountType: meta?.discountType || "perk",
      discountVnd: meta?.discountVnd,
      discountPercent: meta?.discountPercent,
      collectedAt: r.collectedAt,
      qtyTotal,
      qtyRemaining,
      exhausted,
      canClaim: !exhausted,
    };
  });

  const recentClaims = await prisma.appOfferClaimLog.findMany({
    where: {
      customerId: customer.id,
      zoneCode: { in: deskZoneAliases(zone) },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    ok: true,
    zone,
    customer: {
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone,
      customerCode: customer.customerCode,
      segment: customer.segment,
      pointsBalance: customer.pointsBalance,
      vipPlanLabel: customer.vipPlanLabel,
      vipExpiresAt: customer.vipExpiresAt,
    },
    wallet,
    recentClaims: recentClaims.map((l) => ({
      id: l.id,
      at: l.createdAt,
      offerId: l.offerId,
      offerTitle: l.offerTitle,
      claimedByName: l.claimedByName,
    })),
  });
}

/**
 * Claim voucher tại quầy Spa / Lòng Nướng.
 * Body: { phone?, customerId?, offerId, zone, note? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const zone = String(body.zone || "").trim().toUpperCase();
    const offerId = String(body.offerId || "").trim();
    const note = String(body.note || "").trim().slice(0, 200);
    let customerId = String(body.customerId || "").trim();
    const phoneRaw = String(body.phone || "").trim();

    if (!zone || !offerId) {
      return NextResponse.json(
        { error: "Thiếu zone hoặc offerId." },
        { status: 400 }
      );
    }
    if (!offerMatchesDeskZone(offerId, zone)) {
      return NextResponse.json(
        { error: "Voucher này không claim được tại khu này." },
        { status: 400 }
      );
    }
    if (
      !isSystemAdmin(auth.user) &&
      !canAccessDeskZone(auth.user, zone)
    ) {
      return NextResponse.json(
        { error: "Tài khoản không thuộc khu này." },
        { status: 403 }
      );
    }

    if (!customerId && phoneRaw) {
      const phoneNormalized = normalizePhone(phoneRaw);
      const found = await prisma.appCustomer.findFirst({
        where: {
          OR: [{ phoneNormalized }, { phone: phoneRaw }],
          status: "ACTIVE",
        },
        select: { id: true },
      });
      customerId = found?.id || "";
    }
    if (!customerId) {
      return NextResponse.json(
        { error: "Thiếu khách (customerId hoặc phone)." },
        { status: 400 }
      );
    }

    const customer = await prisma.appCustomer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        status: true,
        fullName: true,
        phone: true,
      },
    });
    if (!customer || customer.status !== "ACTIVE") {
      return NextResponse.json({ error: "Khách không hợp lệ." }, { status: 404 });
    }

    const meta = getDeskHhgVoucher(offerId);
    const { isDurationMembershipVoucher } = await import("@/lib/hhg-vouchers");
    const { consumeMembershipVoucherUse } = await import(
      "@/lib/membership-voucher-qty"
    );

    const row = await prisma.appCollectedOffer.findUnique({
      where: {
        customerId_offerId: { customerId: customer.id, offerId },
      },
    });
    if (!row || row.status !== "COLLECTED") {
      return NextResponse.json(
        { error: "Khách không có voucher này (chưa thu thập hoặc đã dùng)." },
        { status: 404 }
      );
    }

    const logZone =
      zone === "SPA" ? "SAUNA" : zone === "SAUNA" ? "SAUNA" : zone;

    let qtyTotal: number | null = row.qtyTotal;
    let qtyRemaining: number | null = row.qtyRemaining;

    if (isDurationMembershipVoucher(offerId)) {
      try {
        const used = await consumeMembershipVoucherUse(prisma, {
          customerId: customer.id,
          offerId,
        });
        qtyTotal = used.qtyTotal;
        qtyRemaining = used.qtyRemaining;
      } catch (err) {
        const status =
          err && typeof err === "object" && "status" in err
            ? Number((err as { status: number }).status) || 500
            : 500;
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Claim failed" },
          { status }
        );
      }
      const log = await prisma.appOfferClaimLog.create({
        data: {
          customerId: customer.id,
          offerId,
          offerTitle: meta?.title || offerId,
          zoneCode: logZone,
          claimedByUserId: auth.user.id,
          claimedByName: auth.user.displayName || auth.user.username,
          phoneSnapshot: customer.phone,
          note: note || null,
        },
      });
      return NextResponse.json({
        ok: true,
        claimed: true,
        offerId,
        offerTitle: meta?.title || offerId,
        zone: logZone,
        logId: log.id,
        qtyTotal,
        qtyRemaining,
        customer: {
          id: customer.id,
          fullName: customer.fullName,
          phone: customer.phone,
        },
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.appCollectedOffer.update({
        where: { id: row.id },
        data: { status: "USED", usedAt: new Date() },
      });
      const log = await tx.appOfferClaimLog.create({
        data: {
          customerId: customer.id,
          offerId,
          offerTitle: meta?.title || offerId,
          zoneCode: logZone,
          claimedByUserId: auth.user.id,
          claimedByName: auth.user.displayName || auth.user.username,
          phoneSnapshot: customer.phone,
          note: note || null,
        },
      });
      return log;
    });

    return NextResponse.json({
      ok: true,
      claimed: true,
      offerId,
      offerTitle: meta?.title || offerId,
      zone: logZone,
      logId: result.id,
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
      },
    });
  } catch (e) {
    console.error("[desk/offers POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Claim failed" },
      { status: 500 }
    );
  }
}
