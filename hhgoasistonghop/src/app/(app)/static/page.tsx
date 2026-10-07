import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canViewStatic } from "@/lib/static-access";
import { getAccountDayStats } from "@/lib/static-stats";
import { StaticPasswordForm } from "@/components/static-password-form";
import { StaticDayDashboard } from "@/components/static-day-dashboard";
import { resolveActorIdForSession } from "@/lib/actor";
import { requireFeature } from "@/lib/require-feature";

export default async function StaticPage({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string }>;
}) {
  await requireFeature("static");
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { auth: authFlag } = await searchParams;
  if (!(await canViewStatic(authFlag))) {
    return <StaticPasswordForm redirectTo="/static?auth=1" />;
  }

  const actorId = await resolveActorIdForSession(session.user.id);
  if (!actorId) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        Không gắn được tài khoản với user trong DB. Đăng xuất rồi đăng nhập lại bằng{" "}
        <strong>27/56a</strong> hoặc <strong>55/62</strong>.
      </div>
    );
  }

  const stats = await getAccountDayStats(actorId);
  return <StaticDayDashboard stats={stats} />;
}
