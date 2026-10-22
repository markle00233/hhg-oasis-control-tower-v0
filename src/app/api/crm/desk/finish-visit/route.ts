import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { deskZoneAliases } from "@/lib/desk-zones";
import {
  LONG_NUONG_DONE_NOTE,
  finishLongNuongVisit,
} from "@/lib/long-nuong-activate";
import { finishSpaVisit, SPA_DONE_NOTE } from "@/lib/spa-visit";
import { BILL_PHOTO_REQUIRED, zoneRequiresBillPhoto } from "@/lib/bill-photo";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Staff bấm «Đã dùng» — kết thúc lượt Lòng Nướng đang dùng. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const zone = String(body.zone || "").trim().toUpperCase();
    const token = String(body.token || body.cartToken || "")
      .trim()
      .replace(/^.*\/q\//, "");
    if (!zone || !token) {
      return NextResponse.json({ error: "Thiếu zone / token" }, { status: 400 });
    }
    const spaDesk = zone === "SAUNA" || zone === "SPA";
    if (zone !== "LONG_NUONG" && !spaDesk) {
      return NextResponse.json(
        { error: "Khu này không kết thúc lượt bằng Đã dùng." },
        { status: 400 }
      );
    }

    const gate = await requireDeskZone(zone);
    if ("error" in gate) return gate.error;

    const cart = await prisma.appServiceCart.findUnique({
      where: { token },
      select: {
        id: true,
        status: true,
        zoneCode: true,
        customerId: true,
        items: true,
        adminNote: true,
        billPhotoAt: true,
      },
    });
    if (!cart || !deskZoneAliases(zone).includes(cart.zoneCode.toUpperCase())) {
      return NextResponse.json({ error: "Không thấy yêu cầu này." }, { status: 404 });
    }
    const doneNote = spaDesk ? SPA_DONE_NOTE : LONG_NUONG_DONE_NOTE;
    if ((cart.adminNote || "").trim() === doneNote) {
      return NextResponse.json({ ok: true, already: true });
    }
    if (zoneRequiresBillPhoto(cart.zoneCode) && !cart.billPhotoAt) {
      return NextResponse.json({ error: BILL_PHOTO_REQUIRED }, { status: 409 });
    }
    if (cart.status !== "USED") {
      return NextResponse.json(
        {
          error: spaDesk
            ? "Xác nhận hoặc quét QR để chuyển sang Đang dùng trước."
            : "Quét QR để chuyển sang Đang dùng trước.",
        },
        { status: 409 }
      );
    }

    if (spaDesk) {
      await finishSpaVisit(cart.id);
    } else {
      await finishLongNuongVisit({
        cartId: cart.id,
        customerId: cart.customerId,
        items: cart.items,
      });
    }
    return NextResponse.json({ ok: true, already: false });
  } catch (e) {
    console.error("[desk/finish-visit]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Không kết thúc được" },
      { status: 500 }
    );
  }
}
