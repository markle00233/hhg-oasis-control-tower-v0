import { NextResponse } from "next/server";
import { createCustomerAccount } from "@/lib/account";
import { getSessionCustomer } from "@/lib/session";

/** Auto-create account when device has no session. */
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
    console.error("[customer bootstrap]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bootstrap failed" },
      { status: 500 }
    );
  }
}
