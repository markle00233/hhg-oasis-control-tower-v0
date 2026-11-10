import { NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { listWalletTournamentVouchers } from "@/lib/tournament-roster";

export const dynamic = "force-dynamic";

/** Tournament vouchers for the account wallet, same list the other vouchers use. */
export async function GET() {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const wallet = await listWalletTournamentVouchers(customer.id);
    return NextResponse.json({ ok: true, wallet });
  } catch (e) {
    console.error("[me/tournament-vouchers]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
