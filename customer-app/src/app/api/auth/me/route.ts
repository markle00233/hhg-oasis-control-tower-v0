import { NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  packageIdFromTier,
  tierFromPlanLabel,
} from "@/lib/membership-theme";
import { isSameDayMembershipEligible } from "@/lib/same-day-membership";
import {
  findActiveVipPackageLabel,
  isMemberSubscriptionActive,
  isVipActive,
  vipExpiryLabel,
} from "@/lib/vip";

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

  const seg = String(segment || "").toUpperCase();
  /** Gói Olympic (VIP) hoặc hội viên — hiện trên trang Account */
  const packageLabel = vip
    ? vipPlanLabel || "Gói VIP HHG Oasis"
    : seg === "MEMBER"
      ? vipPlanLabel || "Hội viên"
      : vipPlanLabel || null;
  const packageExpiresLabel = vip
    ? vipExpiryLabel(vipExpiresAt)
    : vipPlanLabel && vipExpiresAt
      ? vipExpiryLabel(vipExpiresAt)
      : null;
  const member = isMemberSubscriptionActive({ segment, vipExpiresAt });
  const [vipPackageLabel, sameDayMembershipDiscount] = await Promise.all([
    vip || member ? null : findActiveVipPackageLabel(customer.id),
    vip
      ? false
      : isSameDayMembershipEligible(prisma, { id: customer.id }),
  ]);
  /** Member package and Gói VIP share one black-gold name card. */
  const nameCardGold = vip || member || Boolean(vipPackageLabel);
  const nameCardPlan =
    (vip ? vipPlanLabel : member ? packageLabel : vipPackageLabel) || null;
  const membershipTier = vip ? tierFromPlanLabel(vipPlanLabel) : null;
  const membershipPackageId = membershipTier
    ? packageIdFromTier(membershipTier)
    : null;

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
      packageLabel,
      packageExpiresLabel,
      membershipTier,
      membershipPackageId,
      /** Còn hạn gói → khoá upgrade / downgrade */
      membershipLocked: vip,
      nameCardGold,
      nameCardPlan,
      /** −10% gói tháng nếu đã có đơn vé bơi hôm nay */
      sameDayMembershipDiscount,
    },
  });
}
