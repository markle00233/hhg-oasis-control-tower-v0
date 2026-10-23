import { NextRequest, NextResponse } from "next/server";
import { createCustomerAccount, findCustomerByPhone } from "@/lib/account";
import { isValidPhone } from "@/lib/phone";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const fullName = String(body.fullName || "").trim().slice(0, 120);
    const phone = String(body.phone || "").trim();

    if (fullName.length < 2) {
      return NextResponse.json(
        { error: "Nhập họ tên." },
        { status: 400 }
      );
    }
    if (!isValidPhone(phone)) {
      return NextResponse.json(
        { error: "Số điện thoại không hợp lệ." },
        { status: 400 }
      );
    }

    const existing = await findCustomerByPhone(phone);
    if (existing) {
      return NextResponse.json(
        { error: "Số điện thoại này đã được gắn với tài khoản khác." },
        { status: 409 }
      );
    }

    const { customer } = await createCustomerAccount({ fullName, phone });
    return NextResponse.json({
      ok: true,
      created: true,
      customer: {
        id: customer.id,
        customerCode: customer.customerCode,
        username: customer.username,
        fullName: customer.fullName,
        createdAt: customer.createdAt,
      },
    });
  } catch (e) {
    console.error("[customer register]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Không tạo được tài khoản." },
      { status: 500 }
    );
  }
}
