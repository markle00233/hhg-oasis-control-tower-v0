import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createCustomerSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const login = String(body.username || body.customerCode || body.phone || "").trim();
    const password = String(body.password || "");

    if (!login || !password) {
      return NextResponse.json(
        { error: "Nhập SĐT / ID và mật khẩu." },
        { status: 400 }
      );
    }

    const digits = login.replace(/\D/g, "");
    const phoneNorm =
      digits.startsWith("84") && digits.length >= 11 ? `0${digits.slice(2)}` : digits;

    const customer = await prisma.appCustomer.findFirst({
      where: {
        OR: [
          { username: login },
          { customerCode: login },
          { shortId: login },
          ...(phoneNorm.length >= 9
            ? [{ phoneNormalized: phoneNorm }, { username: phoneNorm }]
            : []),
        ],
      },
    });

    if (!customer || customer.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "SĐT / ID hoặc mật khẩu không đúng." },
        { status: 401 }
      );
    }

    const ok = await verifyPassword(password, customer.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "SĐT / ID hoặc mật khẩu không đúng." },
        { status: 401 }
      );
    }

    await createCustomerSession(customer.id);

    return NextResponse.json({
      ok: true,
      customer: {
        id: customer.id,
        customerCode: customer.customerCode,
        username: customer.username,
        createdAt: customer.createdAt,
      },
    });
  } catch (e) {
    console.error("[customer login]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Login failed" },
      { status: 500 }
    );
  }
}
