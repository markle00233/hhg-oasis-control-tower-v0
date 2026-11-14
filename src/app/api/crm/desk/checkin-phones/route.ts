import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireSystemAdmin } from "@/lib/auth";
import { normalizePhone, phoneShortId } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Phones captured on customers who already checked in. */
export async function GET() {
  const gate = await requireSystemAdmin();
  if ("error" in gate) return gate.error;

  const events = await prisma.appServiceEvent.findMany({
    where: { eventType: "SERVICE_USE" },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      createdAt: true,
      customer: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          phoneNormalized: true,
        },
      },
      service: { select: { serviceName: true } },
    },
  });

  const byCustomer = new Map<
    string,
    {
      id: string;
      fullName: string;
      phone: string;
      lastAt: string;
      zone: string;
      visits: number;
    }
  >();
  for (const event of events) {
    const customer = event.customer;
    const slot = byCustomer.get(customer.id);
    if (!slot) {
      byCustomer.set(customer.id, {
        id: customer.id,
        fullName: customer.fullName?.trim() || "Khách",
        phone: customer.phone || customer.phoneNormalized || "",
        lastAt: event.createdAt.toISOString(),
        zone: event.service.serviceName,
        visits: 1,
      });
    } else {
      slot.visits += 1;
    }
  }

  const phones = [...byCustomer.values()];
  return NextResponse.json({ ok: true, count: phones.length, phones });
}

/** Keep a check-in phone on the customer so later screens can reuse it. */
export async function PATCH(req: NextRequest) {
  const gate = await requireSystemAdmin();
  if ("error" in gate) return gate.error;

  const body = await req.json().catch(() => ({}));
  const customerId = String(body.customerId || "").trim();
  const raw = String(body.phone || "").trim();
  if (!customerId) {
    return NextResponse.json({ error: "Thiếu khách." }, { status: 400 });
  }
  const normalized = normalizePhone(raw);
  if (normalized.length < 9 || normalized.length > 11) {
    return NextResponse.json(
      { error: "SĐT không hợp lệ (9–11 số)." },
      { status: 400 }
    );
  }
  const phone = normalized.startsWith("0") ? normalized : `0${normalized}`;

  const taken = await prisma.appCustomer.findFirst({
    where: {
      id: { not: customerId },
      OR: [{ phoneNormalized: phone }, { phone }, { username: phone }],
    },
    select: { fullName: true },
  });
  if (taken) {
    return NextResponse.json(
      { error: `Số này đang của ${taken.fullName || "khách khác"}.` },
      { status: 409 }
    );
  }

  const current = await prisma.appCustomer.findUnique({
    where: { id: customerId },
    select: { username: true, phoneNormalized: true },
  });
  if (!current) {
    return NextResponse.json({ error: "Không thấy khách." }, { status: 404 });
  }

  const username =
    !current.username ||
    current.username === current.phoneNormalized ||
    current.username === phone
      ? phone
      : current.username;

  try {
    const updated = await prisma.appCustomer.update({
      where: { id: customerId },
      data: {
        phone,
        phoneNormalized: phone,
        phoneLast4: phoneShortId(phone),
        shortId: phoneShortId(phone),
        username,
      },
      select: { phone: true },
    });
    return NextResponse.json({ ok: true, phone: updated.phone || phone });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Số này đã có trên tài khoản khác." },
        { status: 409 }
      );
    }
    console.error("[checkin-phones]", err);
    return NextResponse.json({ error: "Không lưu được số." }, { status: 500 });
  }
}
