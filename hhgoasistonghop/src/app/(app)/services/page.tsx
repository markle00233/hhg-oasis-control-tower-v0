import { prisma } from "@/lib/prisma";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { toggleServiceStatus } from "@/app/actions";
import { auth } from "@/lib/auth";
import { ServiceAvatar, ServiceTag } from "@/components/service-tag";
import { requireFeature } from "@/lib/require-feature";

export default async function ServicesPage() {
  await requireFeature("services");
  const session = await auth();
  const services = await prisma.service.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { usages: true, planLinks: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Services"
        description="4 khu gói dịch vụ — Resort · Spa · Olympic · Pickleball"
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {services.map((s) => (
          <Card key={s.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <ServiceAvatar code={s.code} name={s.name} />
                <div>
                  <div className="text-lg font-semibold">{s.name}</div>
                  <div className="mt-1">
                    <ServiceTag code={s.code} name={s.name} />
                  </div>
                </div>
              </div>
              <Badge
                className={
                  s.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100"
                }
              >
                {s.status}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-lg bg-slate-50 py-2">
                <div className="text-sm font-semibold">{s._count.usages}</div>
                Usages
              </div>
              <div className="rounded-lg bg-slate-50 py-2">
                <div className="text-sm font-semibold">{s._count.planLinks}</div>
                Plans
              </div>
            </div>
            {session?.user.role === "ADMIN" && (
              <form
                className="mt-3"
                action={async () => {
                  "use server";
                  await toggleServiceStatus(s.id);
                }}
              >
                <Button type="submit" size="sm" variant="outline" className="w-full">
                  {s.status === "ACTIVE" ? "Tắt" : "Bật"}
                </Button>
              </form>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
