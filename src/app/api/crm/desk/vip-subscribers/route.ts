import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Active VIP packages for the admin panel. */
export async function GET() {
  const gate = await requireSystemAdmin();
  if ("error" in gate) return gate.error;

  const now = new Date();
  const rows = await prisma.appCustomer.findMany({
    where: {
      segment: "VIP",
      OR: [{ vipExpiresAt: null }, { vipExpiresAt: { gt: now } }],
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      phoneNormalized: true,
      vipPlanLabel: true,
      vipStartedAt: true,
      vipExpiresAt: true,
    },
  });

  const subscribers = rows
    .map((row) => ({
      id: row.id,
      fullName: row.fullName?.trim() || "—",
      phone: row.phone || row.phoneNormalized || "—",
      planLabel: row.vipPlanLabel?.trim() || "Gói VIP",
      startedAt: row.vipStartedAt?.toISOString() || null,
      expiresAt: row.vipExpiresAt?.toISOString() || null,
    }))
    .sort((a, b) => {
      const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return tb - ta;
    });

  return NextResponse.json({ ok: true, count: subscribers.length, subscribers });
}
