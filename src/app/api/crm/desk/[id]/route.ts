import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Xác nhận tài khoản tại quầy + ghi dịch vụ sẽ dùng + Member/Khách lẻ. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const zone = String(body.zone || "").trim().toUpperCase();
    const gate = await requireDeskZone(zone);
    if ("error" in gate) return gate.error;
    const segmentRaw = String(body.segment || "").toUpperCase();
    const segment =
      segmentRaw === "MEMBER" || segmentRaw === "WALK_IN" ? segmentRaw : null;
    const services = Array.isArray(body.intendedServices)
      ? body.intendedServices.map((x: unknown) => String(x).trim()).filter(Boolean)
      : typeof body.intendedServices === "string"
        ? body.intendedServices
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : null;
    const adminNote =
      body.adminNote !== undefined ? String(body.adminNote || "").slice(0, 1000) : undefined;
    const confirm = body.confirm !== false;

    const existing = await prisma.appCustomer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const updated = await prisma.appCustomer.update({
      where: { id },
      data: {
        ...(segment ? { segment } : {}),
        ...(services ? { intendedServices: JSON.stringify(services) } : {}),
        ...(adminNote !== undefined ? { adminNote } : {}),
        ...(confirm ? { adminConfirmedAt: new Date() } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      customer: {
        id: updated.id,
        phone: updated.phone,
        shortId: updated.shortId,
        segment: updated.segment,
        segmentLabel: updated.segment === "MEMBER" ? "Member" : "Khách lẻ",
        intendedServices: updated.intendedServices
          ? JSON.parse(updated.intendedServices)
          : [],
        adminConfirmedAt: updated.adminConfirmedAt,
        adminNote: updated.adminNote,
      },
    });
  } catch (e) {
    console.error("[crm/desk/:id]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 }
    );
  }
}
