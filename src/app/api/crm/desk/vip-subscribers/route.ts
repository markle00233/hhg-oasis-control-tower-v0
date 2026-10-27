import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/auth";
import {
  reconcileOlympicMembership,
  vipStartedAtFromExpiry,
} from "@/lib/olympic-membership";
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

  const subscribers = (
    await Promise.all(
      rows.map(async (row) => {
        let started = row.vipStartedAt;
        if (!started && row.vipExpiresAt) {
          started = vipStartedAtFromExpiry(row.vipExpiresAt, row.vipPlanLabel);
          if (started) {
            await prisma.appCustomer
              .update({
                where: { id: row.id },
                data: { vipStartedAt: started },
              })
              .catch((err) => {
                console.error("[vip-subscribers] start backfill", err);
              });
          }
        }
        const aligned = await reconcileOlympicMembership(prisma, {
          id: row.id,
          vipPlanLabel: row.vipPlanLabel,
          vipStartedAt: started,
          vipExpiresAt: row.vipExpiresAt,
        });
        return {
          id: row.id,
          fullName: row.fullName?.trim() || "—",
          phone: row.phone || row.phoneNormalized || "—",
          planLabel: aligned.vipPlanLabel?.trim() || "Gói VIP",
          startedAt: aligned.vipStartedAt?.toISOString() || null,
          expiresAt: aligned.vipExpiresAt?.toISOString() || null,
        };
      })
    )
  )
    .sort((a, b) => {
      const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return tb - ta;
    });

  return NextResponse.json({ ok: true, count: subscribers.length, subscribers });
}
