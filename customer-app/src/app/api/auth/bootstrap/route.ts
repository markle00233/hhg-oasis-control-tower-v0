import { NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";

/** No anonymous accounts. Signup is họ tên + SĐT at /login?mode=signup. */
export async function POST() {
  try {
    const existing = await getSessionCustomer();
    if (existing) {
      return NextResponse.json({
        ok: true,
        created: false,
        customer: {
          id: existing.id,
          customerCode: existing.customerCode,
          username: existing.username,
          createdAt: existing.createdAt,
        },
      });
    }

    return NextResponse.json(
      {
        error: "Nhập họ tên và số điện thoại để tạo tài khoản.",
        needRegister: true,
      },
      { status: 400 }
    );
  } catch (e) {
    console.error("[customer bootstrap]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bootstrap failed" },
      { status: 500 }
    );
  }
}
