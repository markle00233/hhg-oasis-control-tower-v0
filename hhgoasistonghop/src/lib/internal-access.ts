import { cookies } from "next/headers";
import { auth, canAccessInternal, isAdmin } from "@/lib/auth";
import { userCanFeature } from "@/lib/features";

export async function hasInternalAccess() {
  const jar = await cookies();
  return jar.get("hhgo_internal")?.value === "1";
}

async function mayAccessInternal(
  user: { id: string; role: string } | undefined
) {
  if (!user) return false;
  if (isAdmin(user.role) || canAccessInternal(user.role)) return true;
  return userCanFeature(user.id, "internal");
}

/** Admin / được tick Internal + đã nhập mật khẩu nội bộ (?auth=1). */
export async function canViewInternal(authFlag: string | undefined) {
  const session = await auth();
  if (!(await mayAccessInternal(session?.user))) return false;
  return authFlag === "1" && (await hasInternalAccess());
}

/** Guard trang Internal — cần Admin hoặc được tick chức năng Internal. */
export async function requireInternalAdmin() {
  const session = await auth();
  if (!session?.user) return { ok: false as const, reason: "auth" as const };
  if (!(await mayAccessInternal(session.user))) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  return { ok: true as const, session };
}
