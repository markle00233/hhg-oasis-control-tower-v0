import { auth, sessionHasFeature } from "@/lib/auth";
import type { FeatureCode } from "@/config/features";
import { redirect } from "next/navigation";

/** Chặn trang nếu tài khoản không được Admin tick chức năng tương ứng. */
export async function requireFeature(code: FeatureCode) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!sessionHasFeature(session, code)) redirect("/");
  return session;
}

export async function sessionCanFeature(
  session: { user: { id: string; role: string; features?: Record<string, boolean> } },
  code: FeatureCode
) {
  return sessionHasFeature(
    { user: { role: session.user.role, features: session.user.features } },
    code
  );
}
