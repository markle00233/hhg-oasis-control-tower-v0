import { NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getSessionCustomer();
  if (!customer) {
    return NextResponse.json({ authenticated: false, customer: null });
  }
  return NextResponse.json({
    authenticated: true,
    customer: {
      id: customer.id,
      customerCode: customer.customerCode,
      username: customer.username,
      createdAt: customer.createdAt,
      status: customer.status,
      fullName: customer.fullName,
      phone: customer.phone,
      phoneLast4: customer.phoneLast4 || customer.shortId || null,
      shortId: customer.phoneLast4 || customer.shortId || null,
      segment: customer.segment,
    },
  });
}
