import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["PENDING", "PREPARING", "DONE", "CANCELLED"]);

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireDeskZone("MIA_OI");
  if ("error" in gate) return gate.error;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = String(body.status || "").toUpperCase();
  if (!ALLOWED.has(status)) {
    return NextResponse.json({ error: "Trạng thái không hợp lệ." }, { status: 400 });
  }

  const order = await prisma.appOrder.update({
    where: { id },
    data: { status },
    include: {
      items: true,
      customer: {
        select: {
          fullName: true,
          phone: true,
          customerCode: true,
        },
      },
    },
  });

  return NextResponse.json({ ok: true, order });
}
