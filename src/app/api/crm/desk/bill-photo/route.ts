import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { BILL_PHOTO_LOCKED, billEvidenceFrozen, parseBillPhoto } from "@/lib/bill-photo";
import { deskZoneAliases } from "@/lib/desk-zones";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET ?token= → ảnh bill của đơn. */
export async function GET(req: NextRequest) {
  const token = String(req.nextUrl.searchParams.get("token") || "").trim();
  const zone = String(req.nextUrl.searchParams.get("zone") || "").trim().toUpperCase();
  if (!token || !zone) {
    return NextResponse.json({ error: "Thiếu zone / token." }, { status: 400 });
  }
  const gate = await requireDeskZone(zone);
  if ("error" in gate) return gate.error;

  const cart = await prisma.appServiceCart.findUnique({
    where: { token },
    select: { zoneCode: true, billPhoto: true },
  });
  if (!cart || !deskZoneAliases(zone).includes(cart.zoneCode.toUpperCase())) {
    return NextResponse.json({ error: "Không thấy đơn." }, { status: 404 });
  }
  if (!cart.billPhoto) {
    return NextResponse.json({ error: "Chưa có ảnh bill." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, billPhoto: cart.billPhoto });
}

/** POST { zone, token, billPhoto } lưu ảnh bill giấy của đơn. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const zone = String(body.zone || "").trim().toUpperCase();
    const token = String(body.token || "").trim();
    const billPhoto = parseBillPhoto(body.billPhoto);
    if (!zone || !token) {
      return NextResponse.json({ error: "Thiếu zone / token." }, { status: 400 });
    }
    if (!billPhoto) {
      return NextResponse.json({ error: "Ảnh bill không hợp lệ." }, { status: 400 });
    }
    const gate = await requireDeskZone(zone);
    if ("error" in gate) return gate.error;

    const cart = await prisma.appServiceCart.findUnique({
      where: { token },
      select: { id: true, zoneCode: true, status: true, adminNote: true },
    });
    if (!cart || !deskZoneAliases(zone).includes(cart.zoneCode.toUpperCase())) {
      return NextResponse.json({ error: "Không thấy đơn." }, { status: 404 });
    }
    if (billEvidenceFrozen(cart)) {
      return NextResponse.json({ error: BILL_PHOTO_LOCKED }, { status: 409 });
    }
    await prisma.appServiceCart.update({
      where: { id: cart.id },
      data: { billPhoto, billPhotoAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[desk/bill-photo]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Không lưu được ảnh bill." },
      { status: 500 }
    );
  }
}
