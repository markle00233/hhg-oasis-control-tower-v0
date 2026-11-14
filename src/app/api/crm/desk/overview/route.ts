import { NextRequest, NextResponse } from "next/server";
import { canAccessDeskZone, isSystemAdmin, requireAuth } from "@/lib/auth";
import { deskZoneAliases } from "@/lib/desk-zones";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const BUCKETS = [
  { id: "LONG_NUONG", label: "Lòng nướng", codes: ["LONG_NUONG"] },
  { id: "SPA", label: "Spa", codes: ["SPA", "SAUNA"] },
  { id: "MIA_OI", label: "Nước", codes: ["MIA_OI"] },
  { id: "OLYMPIC_POOL", label: "Hồ bơi", codes: ["OLYMPIC_POOL", "OLYMPIC", "MIA_OLYMPIC", "VIP", "VIP_RESORT", "GYM"] },
  { id: "PICKLEBALL", label: "Pickleball", codes: ["PICKLEBALL"] },
] as const;

type BucketId = (typeof BUCKETS)[number]["id"];

const BUCKET_BY_CODE = new Map<string, BucketId>(
  BUCKETS.flatMap((bucket) => bucket.codes.map((code) => [code, bucket.id] as const))
);

function vnStart(now: Date, withDay: boolean) {
  const parts = VN_DAY.format(now);
  const day = withDay ? parts : `${parts.slice(0, 7)}-01`;
  return new Date(`${day}T00:00:00+07:00`);
}

function bucketFor(code: string | null | undefined): BucketId | null {
  return BUCKET_BY_CODE.get(String(code || "").trim().toUpperCase()) || null;
}

function orderIdFromRef(refId: string | null) {
  const match = String(refId || "").match(/^(?:redeem|mia-extra):(.+)$/);
  return match?.[1] || null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const requested = new URL(req.url).searchParams.get("zone")?.trim().toUpperCase() || "";
  if (requested && !canAccessDeskZone(auth.user, requested)) {
    return NextResponse.json(
      { error: "Tài khoản này không thuộc khu vực đã chọn." },
      { status: 403 }
    );
  }
  const zone = requested || (!isSystemAdmin(auth.user) ? auth.user.deskZone || "" : "");
  if (!isSystemAdmin(auth.user) && !zone) {
    return NextResponse.json({ error: "Không có quyền xem thống kê." }, { status: 403 });
  }

  const allowed = zone
    ? new Set(deskZoneAliases(zone).map((code) => code.toUpperCase()))
    : null;
  const visible = BUCKETS.filter(
    (bucket) =>
      !allowed || bucket.codes.some((code) => allowed.has(code))
  );
  const visibleIds = new Set(visible.map((bucket) => bucket.id));

  const now = new Date();
  const dayStart = vnStart(now, true);
  const monthStart = vnStart(now, false);
  const serviceCodes = allowed
    ? Array.from(new Set(visible.flatMap((bucket) => [...bucket.codes])))
    : null;
  if (serviceCodes && serviceCodes.length === 0) {
    return NextResponse.json({
      ok: true,
      todayRevenueVnd: 0,
      todayOrders: 0,
      todayGuests: 0,
      pointsRedeemed: 0,
      voucherClaims: 0,
      zones: [],
    });
  }
  const serviceWhere = serviceCodes
    ? { service: { serviceCode: { in: serviceCodes } } }
    : {};

  const [orders, redeems, claims] = await Promise.all([
    prisma.appOrder.findMany({
      where: {
        createdAt: { gte: dayStart },
        NOT: { status: "CANCELLED" },
        ...serviceWhere,
      },
      select: {
        totalVnd: true,
        customerId: true,
        service: { select: { serviceCode: true } },
      },
    }),
    prisma.appPointLedger.findMany({
      where: { reason: "REDEEM", createdAt: { gte: monthStart }, delta: { lt: 0 } },
      select: { delta: true, refId: true },
    }),
    prisma.appOfferClaimLog.groupBy({
      by: ["zoneCode"],
      where: {
        createdAt: { gte: monthStart },
        ...(serviceCodes ? { zoneCode: { in: serviceCodes } } : {}),
      },
      _count: { _all: true },
    }),
  ]);

  const redeemOrderIds = Array.from(
    new Set(redeems.map((row) => orderIdFromRef(row.refId)).filter((id): id is string => !!id))
  );
  const redeemOrders = redeemOrderIds.length
    ? await prisma.appOrder.findMany({
        where: { id: { in: redeemOrderIds }, ...serviceWhere },
        select: { id: true, service: { select: { serviceCode: true } } },
      })
    : [];
  const serviceByOrder = new Map(
    redeemOrders.map((order) => [order.id, order.service?.serviceCode || ""])
  );

  const points = new Map<BucketId, number>();
  const voucherClaims = new Map<BucketId, number>();
  for (const bucket of visible) {
    points.set(bucket.id, 0);
    voucherClaims.set(bucket.id, 0);
  }

  let todayRevenueVnd = 0;
  let todayOrders = 0;
  const guests = new Set<string>();
  for (const order of orders) {
    const bucket = bucketFor(order.service?.serviceCode);
    if (bucket && !visibleIds.has(bucket)) continue;
    if (!bucket && allowed) continue;
    todayRevenueVnd += order.totalVnd || 0;
    todayOrders += 1;
    if (order.customerId) guests.add(order.customerId);
  }

  for (const row of redeems) {
    const bucket = bucketFor(serviceByOrder.get(orderIdFromRef(row.refId) || "") || "");
    if (!bucket || !visibleIds.has(bucket)) continue;
    points.set(bucket, (points.get(bucket) || 0) + Math.abs(row.delta));
  }

  for (const row of claims) {
    const bucket = bucketFor(row.zoneCode);
    if (!bucket || !visibleIds.has(bucket)) continue;
    voucherClaims.set(bucket, (voucherClaims.get(bucket) || 0) + row._count._all);
  }

  const zones = visible.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    points: points.get(bucket.id) || 0,
    claims: voucherClaims.get(bucket.id) || 0,
  }));

  return NextResponse.json({
    ok: true,
    todayRevenueVnd,
    todayOrders,
    todayGuests: guests.size,
    pointsRedeemed: zones.reduce((sum, zoneRow) => sum + zoneRow.points, 0),
    voucherClaims: zones.reduce((sum, zoneRow) => sum + zoneRow.claims, 0),
    zones,
  });
}
