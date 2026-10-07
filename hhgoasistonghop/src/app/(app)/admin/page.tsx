import { auth, isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveFeatureFlags } from "@/config/features";
import { AdminPermissionsBoard } from "@/components/admin-permissions-board";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdmin(session.user.role)) redirect("/");

  const users = await prisma.user.findMany({
    where: { isActive: true, role: { not: "ADMIN" } },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      department: true,
      featureFlags: true,
    },
  });

  const accounts = users.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    department: u.department,
    flags: resolveFeatureFlags(u.role, u.featureFlags),
  }));

  return <AdminPermissionsBoard accounts={accounts} />;
}
