import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import {
  applyReviseBooking,
  readReviseBooking,
  reviseZone,
} from "@/lib/revise-booking";

export const dynamic = "force-dynamic";

function errorStatus(e: unknown) {
  const status =
    e && typeof e === "object" && "status" in e
      ? Number((e as { status: number }).status) || 500
      : 500;
  return status >= 400 && status < 600 ? status : 500;
}

/** Đọc đặt chỗ Lòng Nướng / Pickleball còn sửa được trước khi chốt. */
export async function GET(req: NextRequest) {
  const zone = reviseZone(req.nextUrl.searchParams.get("zone") || "");
  if (!zone) {
    return NextResponse.json({ error: "Khu này không sửa đặt chỗ." }, { status: 400 });
  }
  const gate = await requireDeskZone(zone);
  if ("error" in gate) return gate.error;

  const token = String(req.nextUrl.searchParams.get("token") || "").trim();
  const bookingId = String(req.nextUrl.searchParams.get("bookingId") || "").trim();
  if (!token && !bookingId) {
    return NextResponse.json({ error: "Thiếu yêu cầu." }, { status: 400 });
  }

  try {
    const data = await readReviseBooking({ zone, token, bookingId });
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    console.error("[desk/revise-booking GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Không tải được đặt chỗ" },
      { status: errorStatus(e) }
    );
  }
}

/** Sửa trước khi chốt: Lòng Nướng = số khách + giờ đến; Pickleball = giờ đến + sân. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const zone = reviseZone(body.zone);
  if (!zone) {
    return NextResponse.json({ error: "Khu này không sửa đặt chỗ." }, { status: 400 });
  }
  const gate = await requireDeskZone(zone);
  if ("error" in gate) return gate.error;

  const token = String(body.token || "").trim();
  const bookingId = String(body.bookingId || "").trim();
  if (!token && !bookingId) {
    return NextResponse.json({ error: "Thiếu yêu cầu." }, { status: 400 });
  }

  try {
    const saved = await applyReviseBooking({
      zone,
      token,
      bookingId,
      startAt: new Date(body.startAt),
      partySize: body.partySize,
      resourceId: body.resourceId,
      staffId: gate.user.id,
    });
    return NextResponse.json(saved);
  } catch (e) {
    console.error("[desk/revise-booking PATCH]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Không sửa được" },
      { status: errorStatus(e) }
    );
  }
}
