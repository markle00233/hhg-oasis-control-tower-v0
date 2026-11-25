import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { activeCrmMemberships } from "@/lib/crm-membership";
import {
  customerHasLoginAccount,
  deskSegmentOf,
} from "@/lib/desk-segment";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Tìm khách đã có tài khoản theo họ tên hoặc SĐT. */
export async function GET(req: NextRequest) {
  const zone = String(req.nextUrl.searchParams.get("zone") || "")
    .trim()
    .toUpperCase();
  const gate = await requireDeskZone(zone);
  if ("error" in gate) return gate.error;

  const q = String(req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ ok: true, customers: [] });
  }

  const digits = q.replace(/\D/g, "");
  const phoneNorm = normalizePhone(digits);
  const phoneKeys = new Set<string>();
  if (phoneNorm.length >= 3) {
    phoneKeys.add(phoneNorm);
    if (phoneNorm.startsWith("0") && phoneNorm.length > 1) {
      phoneKeys.add(`84${phoneNorm.slice(1)}`);
    }
    if (phoneNorm.startsWith("84") && phoneNorm.length > 2) {
      phoneKeys.add(`0${phoneNorm.slice(2)}`);
    }
  }
  const phoneOr = [
    ...[...phoneKeys].map((key) => ({
      phoneNormalized: { startsWith: key },
    })),
    ...(phoneNorm.length === 4 || phoneNorm.length >= 9
      ? [{ phoneLast4: phoneNorm.slice(-4) }]
      : []),
  ];
  const textOr =
    digits.length >= 3 && digits.length >= q.replace(/\s/g, "").length
      ? []
      : [
          { fullName: { contains: q, mode: "insensitive" as const } },
          { customerCode: { startsWith: q, mode: "insensitive" as const } },
          { shortId: { startsWith: q, mode: "insensitive" as const } },
        ];
  const or = [...textOr, ...phoneOr];
  if (or.length === 0) {
    return NextResponse.json({ ok: true, customers: [] });
  }
  try {
    const rows = await prisma.appCustomer.findMany({
      where: {
        status: "ACTIVE",
        phone: { not: null },
        NOT: { username: { startsWith: "anon-" } },
        OR: or,
      },
      select: {
        id: true,
        customerCode: true,
        username: true,
        fullName: true,
        phone: true,
        phoneNormalized: true,
        shortId: true,
        phoneLast4: true,
        segment: true,
        vipExpiresAt: true,
        vipPlanLabel: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
    });

    const crm = await activeCrmMemberships(
      rows.map((c) => c.phoneNormalized || "").filter(Boolean)
    );
    return NextResponse.json({
      ok: true,
      customers: rows
        .filter((c) => customerHasLoginAccount(c))
        .map((c) => {
          const marked = deskSegmentOf({
            segment: c.segment,
            vipExpiresAt: c.vipExpiresAt,
            vipPlanLabel: c.vipPlanLabel,
            hasAccount: true,
            crmMember: !!(c.phoneNormalized && crm.has(c.phoneNormalized)),
          });
          return {
            id: c.id,
            customerCode: c.customerCode,
            fullName: c.fullName || "",
            phone: c.phone || c.phoneNormalized || "",
            shortId: c.shortId || c.phoneLast4 || "",
            segment: marked.segment,
            segmentLabel: marked.segmentLabel,
            vipPlanLabel: marked.segment === "VIP" ? c.vipPlanLabel : null,
          };
        }),
    });
  } catch (e) {
    console.error("[desk/search-customers]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Không tìm được khách." },
      { status: 500 }
    );
  }
}
