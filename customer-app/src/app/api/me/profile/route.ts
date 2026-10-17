import { NextRequest, NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isValidPhone, normalizePhone, phoneShortId } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** Cập nhật họ tên + SĐT cho tài khoản đang đăng nhập (bắt buộc trước Upgrade). */
export async function PATCH(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const fullName = String(body.fullName || "")
      .trim()
      .slice(0, 120);
    const phoneRaw = String(body.phone || "").trim();

    if (fullName.length < 2) {
      return NextResponse.json(
        { error: "Nhập họ tên (tối thiểu 2 ký tự)." },
        { status: 400 }
      );
    }
    if (!isValidPhone(phoneRaw)) {
      return NextResponse.json(
        { error: "Số điện thoại không hợp lệ." },
        { status: 400 }
      );
    }
    const phoneNormalized = normalizePhone(phoneRaw);
    const phoneLast4 = phoneShortId(phoneNormalized);

    const clash = await prisma.appCustomer.findFirst({
      where: {
        phoneNormalized,
        id: { not: customer.id },
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json(
        {
          error:
            "SĐT này đã gắn tài khoản khác. Đăng nhập đúng SĐT hoặc dùng số khác.",
        },
        { status: 409 }
      );
    }

    const updated = await prisma.appCustomer.update({
      where: { id: customer.id },
      data: {
        fullName,
        phone: phoneRaw,
        phoneNormalized,
        phoneLast4,
        shortId: phoneLast4,
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        phoneNormalized: true,
        phoneLast4: true,
        shortId: true,
        customerCode: true,
      },
    });

    return NextResponse.json({ ok: true, customer: updated });
  } catch (e) {
    console.error("[me/profile PATCH]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
