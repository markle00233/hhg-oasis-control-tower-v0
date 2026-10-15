import { NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isVipActive, vipExpiryLabel } from "@/lib/vip";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getSessionCustomer();
  if (!customer) {
    return NextResponse.json({ authenticated: false, customer: null });
  }
  let segment = customer.segment;
  let vipExpiresAt = customer.vipExpiresAt;
  let vipPlanLabel = customer.vipPlanLabel;

  const vip = isVipActive({
    segment,
    vipExpiresAt,
  });

  // Hết hạn / không gia hạn → hạ về khách thường, mất đặc quyền VIP
  if (
    String(segment || "").toUpperCase() === "VIP" &&
    !vip &&
    vipExpiresAt
  ) {
    await prisma.appCustomer
      .update({
        where: { id: customer.id },
        data: {
          segment: "WALK_IN",
          vipExpiresAt: null,
          vipPlanLabel: null,
        },
      })
      .catch(() => undefined);
    segment = "WALK_IN";
    vipExpiresAt = null;
    vipPlanLabel = null;
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
      segment,
      pointsBalance: customer.pointsBalance ?? 0,
      vip,
      vipPlanLabel: vip ? vipPlanLabel || null : null,
      vipExpiresAt: vip ? vipExpiresAt || null : null,
      vipExpiresLabel: vip ? vipExpiryLabel(vipExpiresAt) : null,
    },
  });
}
