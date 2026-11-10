import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  parseVoucherZone,
  VOUCHER_STATUS,
  voucherTitle,
  ZONE_LABEL,
} from "@/lib/tournament";

export const dynamic = "force-dynamic";

/** Drop a "Dời giờ" tag. The event name itself stays. */
function tournamentDisplayName(name: string) {
  const parts = name
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);
  const kept = parts.filter((part) => {
    const folded = part
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase();
    return folded !== "doi gio";
  });
  return (kept.length ? kept : parts).join(" · ");
}

/** Redeemed athlete vouchers for the admin panel. */
export async function GET() {
  const gate = await requireSystemAdmin();
  if ("error" in gate) return gate.error;

  const rows = await prisma.appTournamentVoucher.findMany({
    where: { status: VOUCHER_STATUS.REDEEMED },
    orderBy: { redeemedAt: "desc" },
    take: 200,
    select: {
      id: true,
      redeemedAt: true,
      redeemedVnd: true,
      redeemedZone: true,
      scannedByName: true,
      tournament: { select: { name: true, discountVnd: true } },
      customer: { select: { fullName: true, phone: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    logs: rows.map((row) => {
      const zone = row.redeemedZone ? parseVoucherZone(row.redeemedZone) : null;
      const amount = row.redeemedVnd ?? row.tournament.discountVnd;
      return {
        id: row.id,
        at: row.redeemedAt,
        offerTitle: voucherTitle(amount),
        tournamentName: tournamentDisplayName(row.tournament.name),
        placeLabel: zone ? ZONE_LABEL[zone] : null,
        claimedByName: row.scannedByName,
        phone: row.customer.phone,
        customerName: row.customer.fullName,
      };
    }),
  });
}
