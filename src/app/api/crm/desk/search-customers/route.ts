import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
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
  try {
    const rows = await prisma.appCustomer.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { customerCode: { contains: q, mode: "insensitive" } },
          { shortId: { contains: q, mode: "insensitive" } },
          ...(digits.length >= 3
            ? [
                { phoneNormalized: { contains: digits } },
                { phoneLast4: { contains: digits.slice(-4) } },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        customerCode: true,
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

    const now = Date.now();
    return NextResponse.json({
      ok: true,
      customers: rows.map((c) => {
        const vip =
          String(c.segment || "").toUpperCase() === "VIP" &&
          (!c.vipExpiresAt || c.vipExpiresAt.getTime() > now);
        return {
          id: c.id,
          customerCode: c.customerCode,
          fullName: c.fullName || "",
          phone: c.phone || c.phoneNormalized || "",
          shortId: c.shortId || c.phoneLast4 || "",
          segment: vip ? "VIP" : "WALK_IN",
          segmentLabel: vip ? "VIP" : "Khách lẻ",
          vipPlanLabel: vip ? c.vipPlanLabel : null,
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
