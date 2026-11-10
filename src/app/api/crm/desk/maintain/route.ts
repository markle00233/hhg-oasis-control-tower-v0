import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { deskZoneAliases, getDeskZone } from "@/lib/desk-zones";
import { runDeskMaintenance } from "@/lib/desk-maintenance";

export const dynamic = "force-dynamic";

/** Writes that used to run on every desk poll. The screen calls this slowly. */
export async function POST(req: NextRequest) {
  let zone = "";
  try {
    const body = await req.json();
    zone = String(body?.zone || "")
      .trim()
      .toUpperCase();
  } catch {
    zone = "";
  }
  if (!zone || !getDeskZone(zone)) {
    return NextResponse.json({ error: "Khu vực không hợp lệ." }, { status: 400 });
  }
  const gate = await requireDeskZone(zone);
  if ("error" in gate) return gate.error;

  const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const cartSince =
    zone === "LONG_NUONG"
      ? new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      : since;

  try {
    await runDeskMaintenance({
      zone,
      aliases: deskZoneAliases(zone),
      since,
      cartSince,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[crm/desk/maintain]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Desk maintenance failed" },
      { status: 500 }
    );
  }
}
