import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCustomerSession } from "@/lib/session";
import { maskedIdentityLabel } from "@/lib/names";
import { normalizePhone } from "@/lib/phone";

function phoneKeys(raw: string) {
  const d = normalizePhone(raw);
  if (d.length < 9) return [];
  const with0 = d.startsWith("0") ? d : `0${d}`;
  const no0 = with0.startsWith("0") ? with0.slice(1) : with0;
  const last9 = with0.slice(-9);
  return [...new Set([d, with0, no0, last9])].filter((k) => k.length >= 9);
}

function phonesMatch(
  entered: string,
  customer: {
    phoneNormalized?: string | null;
    phone?: string | null;
    username?: string | null;
  }
) {
  const enteredKeys = new Set(phoneKeys(entered));
  if (!enteredKeys.size) return false;
  const stored = [
    customer.phoneNormalized,
    customer.phone,
    customer.username,
  ]
    .flatMap((v) => (v ? phoneKeys(String(v)) : []))
    .filter(Boolean);
  return stored.some((k) => enteredKeys.has(k));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = String(body.password || "");
    const keys = phoneKeys(password);
    const lookupOnly = body.lookup === true;

    if (!password) {
      return NextResponse.json({ error: "Nhập số điện thoại." }, { status: 400 });
    }

    const matches = keys.length
      ? (
          await prisma.appCustomer.findMany({
            where: {
              status: "ACTIVE",
              OR: [
                ...keys.flatMap((k) => [
                  { phoneNormalized: k },
                  { username: k },
                  { phone: k },
                ]),
                { phoneNormalized: { endsWith: keys[0]!.slice(-9) } },
                { phone: { contains: keys[0]!.slice(-9) } },
              ],
            },
            take: 10,
          })
        ).filter((row) => phonesMatch(password, row))
      : [];

    if (matches.length > 1) {
      return NextResponse.json(
        { error: "Số điện thoại này gắn với nhiều tài khoản." },
        { status: 409 }
      );
    }
    const only = matches[0];
    if (!only) {
      return NextResponse.json(
        { error: "Không thấy tài khoản với số này." },
        { status: 401 }
      );
    }
    if (lookupOnly) {
      return NextResponse.json({
        ok: true,
        maskedLabel: maskedIdentityLabel(
          only.phone || only.phoneNormalized || password,
          only.fullName
        ),
      });
    }
    await createCustomerSession(only.id);
    return NextResponse.json({
      ok: true,
      customer: {
        id: only.id,
        customerCode: only.customerCode,
        username: only.username,
        fullName: only.fullName,
        createdAt: only.createdAt,
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
