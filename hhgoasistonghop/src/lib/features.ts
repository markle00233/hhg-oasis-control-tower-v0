import { prisma } from "@/lib/prisma";
import {
  CRM_FEATURES,
  hasFeature,
  resolveFeatureFlags,
  type FeatureCode,
  type FeatureFlags,
} from "@/config/features";

export async function getUserFeatureFlags(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, featureFlags: true, email: true, fullName: true },
  });
  if (!user) return null;
  return {
    user,
    flags: resolveFeatureFlags(user.role, user.featureFlags),
  };
}

export async function userCanFeature(userId: string, code: FeatureCode) {
  const row = await getUserFeatureFlags(userId);
  if (!row) return false;
  return hasFeature(row.user.role, row.flags, code);
}

export { CRM_FEATURES, hasFeature, resolveFeatureFlags };
export type { FeatureCode, FeatureFlags };
