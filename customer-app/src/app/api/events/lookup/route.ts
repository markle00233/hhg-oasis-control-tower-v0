import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCustomer } from "@/lib/session";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

function maskPhone(phone: string | null | undefined): string {
  const d = (phone || "").replace(/\D/g, "");
  if (d.length < 4) return "****";
  return `${"*".repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

/** Dò ngược ID 4 số → đã có SĐT trong hệ thống chưa. */
export async function GET(req: NextRequest) {
  const customer = await getSessionCustomer();
  if (!customer) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const shortId = (req.nextUrl.searchParams.get("shortId") || "")
    .replace(/\D/g, "")
    .slice(0, 4);

  if (shortId.length !== 4) {
    return NextResponse.json({
      ok: true,
      shortId,
      found: false,
      matches: [],
      message: "Nhập đủ 4 số ID để kiểm tra.",
    });
  }

  try {
    const rows = await prisma.appCustomer.findMany({
      where: {
        OR: [
          { phoneLast4: shortId },
          { shortId },
          { phoneNormalized: { endsWith: shortId } },
        ],
        status: "ACTIVE",
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        phoneLast4: true,
        shortId: true,
        segment: true,
      },
      take: 20,
      orderBy: { updatedAt: "desc" },
    });

    // Deduplicate by id
    const seen = new Set<string>();
    const matches = rows
      .filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      })
      .map((r) => ({
        id: r.id,
        fullName: r.fullName || "",
        phoneMasked: maskPhone(r.phone),
        segment: r.segment,
      }));

    return NextResponse.json({
      ok: true,
      shortId,
      found: matches.length > 0,
      matches,
      message:
        matches.length > 0
          ? `Đã có ${matches.length} tài khoản với ID ${shortId}. Nhập đúng họ tên để vào.`
          : `ID ${shortId} chưa có trong hệ thống. Vui lòng nhập số điện thoại.`,
    });
  } catch (e) {
    console.error("[events/lookup]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lookup failed" },
      { status: 500 }
    );
  }
}
