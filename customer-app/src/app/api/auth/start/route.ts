import { NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

/** Cold open: existing session only. New guests must register with name + phone. */
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
    console.error("[customer start]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Startup failed" },
      { status: 500 }
    );
  }
}
