import { auth, isAdmin } from "@/lib/auth";
import { userCanFeature } from "@/lib/features";
import type { FeatureCode } from "@/config/features";
import { redirect } from "next/navigation";

/** Chặn trang nếu tài khoản không được Admin tick chức năng tương ứng. */
export async function requireFeature(code: FeatureCode) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (isAdmin(session.user.role)) return session;
  const ok = await userCanFeature(session.user.id, code);
  if (!ok) redirect("/");
  return session;
}

export async function sessionCanFeature(
  session: { user: { id: string; role: string; features?: Record<string, boolean> } },
  code: FeatureCode
) {
  if (isAdmin(session.user.role)) return true;
  return userCanFeature(session.user.id, code);
}
