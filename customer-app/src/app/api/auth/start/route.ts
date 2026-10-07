import { NextResponse } from "next/server";
import { createCustomerAccount } from "@/lib/account";
import { getSessionCustomer } from "@/lib/session";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

/**
 * Single round-trip for cold open:
 * - existing session → home
 * - no session → create account + session
 */
export async function POST() {
  try {
    const existing = await getSessionCustomer();
    if (existing) {
      return NextResponse.json({
        ok: true,
        created: false,
        customer: {
          id: existing.id,
          customerCode: existing.customerCode,
          username: existing.username,
          createdAt: existing.createdAt,
        },
      });
    }

    const { customer, tempPassword } = await createCustomerAccount();
    return NextResponse.json({
      ok: true,
      created: true,
      message: "Your Oasis Account has been created.",
      customer: {
        id: customer.id,
        customerCode: customer.customerCode,
        username: customer.username,
        createdAt: customer.createdAt,
      },
      temporaryPassword: tempPassword,
    });
  } catch (e) {
    console.error("[customer start]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Startup failed" },
      { status: 500 }
    );
  }
}
