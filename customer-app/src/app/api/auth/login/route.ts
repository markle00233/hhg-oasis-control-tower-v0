import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createCustomerSession } from "@/lib/session";
import { maskedIdentityLabel } from "@/lib/names";
import { normalizePhone } from "@/lib/phone";

function foldName(raw: string) {
  return raw
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("vi");
}

function stripMarks(raw: string) {
  return foldName(raw)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d");
}

function namesMatch(entered: string, stored: string | null | undefined) {
  const a = foldName(entered);
  const b = foldName(String(stored || ""));
  if (!a || !b) return false;
  return a === b || stripMarks(a) === stripMarks(b);
}

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
    const login = foldName(
      String(body.fullName || body.username || body.customerCode || "")
    );
    const password = String(body.password || "");
    const keys = phoneKeys(password);
    const confirmExisting = body.confirmExisting === true;
    const lookupOnly = body.lookup === true;

    if (!password) {
      return NextResponse.json({ error: "Nhập mật khẩu." }, { status: 400 });
    }

    if (confirmExisting) {
      const existing = keys.length
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
              take: 5,
            })
          ).find((row) => phonesMatch(password, row))
        : null;
      if (!existing) {
        return NextResponse.json(
          { error: "Họ tên hoặc số điện thoại không đúng." },
          { status: 401 }
        );
      }
      await createCustomerSession(existing.id);
      return NextResponse.json({
        ok: true,
        customer: {
          id: existing.id,
          customerCode: existing.customerCode,
          username: existing.username,
          fullName: existing.fullName,
          createdAt: existing.createdAt,
        },
      });
    }

    if (!login) {
      const byPhoneOnly = keys.length
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
      if (byPhoneOnly.length > 1) {
        return NextResponse.json(
          { error: "Số điện thoại này gắn với nhiều tài khoản." },
          { status: 409 }
        );
      }
      const only = byPhoneOnly[0];
      if (!only) {
        return NextResponse.json(
          { error: "Mật khẩu không đúng." },
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
    }

    const last9 = keys[0] ? keys[0].slice(-9) : "";
    const orPhone =
      keys.length > 0
        ? [
            ...keys.flatMap((k) => [
              { phoneNormalized: k },
              { username: k },
              { phone: k },
            ]),
            { phoneNormalized: { endsWith: last9 } },
            { phone: { contains: last9 } },
            { username: { endsWith: last9 } },
          ]
        : [];

    const [byPhone, byName] = await Promise.all([
      orPhone.length
        ? prisma.appCustomer.findMany({
            where: { status: "ACTIVE", OR: orPhone },
            take: 10,
          })
        : Promise.resolve([]),
      prisma.appCustomer.findMany({
        where: {
          status: "ACTIVE",
          fullName: { equals: login, mode: "insensitive" },
        },
        take: 20,
      }),
    ]);

    const seen = new Set<string>();
    const pool = [...byPhone, ...byName].filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

    let customer =
      pool.find(
        (row) => namesMatch(login, row.fullName) && phonesMatch(password, row)
      ) || null;

    if (!customer) {
      for (const row of pool) {
        if (
          namesMatch(login, row.fullName) &&
          (await verifyPassword(password, row.passwordHash))
        ) {
          customer = row;
          break;
        }
      }
    }

    if (!customer) {
      return NextResponse.json(
        { error: "Họ tên hoặc số điện thoại không đúng." },
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
        fullName: customer.fullName,
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
