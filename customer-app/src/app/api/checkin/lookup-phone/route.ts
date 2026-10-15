import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { maskedIdentityLabel } from "@/lib/names";
import { isValidPhone, normalizePhone, phoneShortId } from "@/lib/phone";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

/** Tra SĐT: mới hay đã có (trả tên che để xác nhận). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const phoneRaw = String(body.phone || "").trim();
    if (!isValidPhone(phoneRaw)) {
      return NextResponse.json(
        { error: "Số điện thoại không hợp lệ." },
        { status: 400 }
      );
    }
    const phoneNormalized = normalizePhone(phoneRaw);
    const customer = await prisma.appCustomer.findFirst({
      where: {
        status: "ACTIVE",
        phoneNormalized,
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        phoneNormalized: true,
        phoneLast4: true,
        shortId: true,
      },
    });

    if (!customer) {
      return NextResponse.json({
        ok: true,
        exists: false,
        phoneNormalized,
      });
    }

    const displayPhone = customer.phone || phoneNormalized;
    return NextResponse.json({
      ok: true,
      exists: true,
      hasName: !!(customer.fullName && customer.fullName.trim().length >= 2),
      maskedLabel: maskedIdentityLabel(displayPhone, customer.fullName),
      phoneLast4: customer.phoneLast4 || customer.shortId || phoneShortId(phoneNormalized),
    });
  } catch (e) {
    console.error("[checkin/lookup-phone]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lookup failed" },
      { status: 500 }
    );
  }
}
