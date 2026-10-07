import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionProvider } from "@/components/session-provider";
import { BackgroundJobsProvider } from "@/components/background-jobs";
import { AppShell } from "@/components/app-shell";
import { getUserFeatureFlags } from "@/lib/features";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const live = await getUserFeatureFlags(session.user.id);
  const features = live?.flags || session.user.features;

  return (
    <SessionProvider>
      <BackgroundJobsProvider>
        <AppShell
          user={{
            name: session.user.name,
            role: session.user.role,
            email: session.user.email,
            department: session.user.department,
            features,
          }}
        >
          {children}
        </AppShell>
      </BackgroundJobsProvider>
    </SessionProvider>
  );
}
