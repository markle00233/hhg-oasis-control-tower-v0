/**
 * Sync 12 gói Bơi/Pick/VIP lên DB, tắt gói cũ.
 * npx tsx --env-file=.env scripts/sync-membership-packages.ts
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_SERVICES, MEMBERSHIP_PACKAGES } from "../src/config/crm.config";

const prisma = new PrismaClient();

async function main() {
  const serviceIds: Record<string, string> = {};
  for (let i = 0; i < DEFAULT_SERVICES.length; i++) {
    const s = DEFAULT_SERVICES[i];
    const row = await prisma.service.upsert({
      where: { code: s.code },
      update: { name: s.name, status: "ACTIVE", sortOrder: i + 1 },
      create: { code: s.code, name: s.name, status: "ACTIVE", sortOrder: i + 1 },
    });
    serviceIds[s.code] = row.id;
    console.log("Service", s.code, s.name);
  }

  const activeCodes = MEMBERSHIP_PACKAGES.map((p) => p.code);

  for (const p of MEMBERSHIP_PACKAGES) {
    const plan = await prisma.membershipPlan.upsert({
      where: { planCode: p.code },
      update: {
        name: p.name,
        durationDays: p.durationDays,
        description: p.description,
        status: "ACTIVE",
      },
      create: {
        planCode: p.code,
        name: p.name,
        durationDays: p.durationDays,
        description: p.description,
        status: "ACTIVE",
      },
    });
    await prisma.membershipPlanService.deleteMany({ where: { planId: plan.id } });
    await prisma.membershipPlanService.createMany({
      data: p.services.map((code) => ({
        planId: plan.id,
        serviceId: serviceIds[code],
      })),
    });
    console.log("Plan", p.code, p.name, `${p.durationDays}d`);
  }

  const deactivated = await prisma.membershipPlan.updateMany({
    where: { planCode: { notIn: [...activeCodes] } },
    data: { status: "INACTIVE" },
  });
  console.log("Deactivated old plans:", deactivated.count);

  // Sửa hạn membership đã lưu sai (trước đây cộng tháng tặng)
  let fixed = 0;
  for (const p of MEMBERSHIP_PACKAGES) {
    const plan = await prisma.membershipPlan.findUnique({ where: { planCode: p.code } });
    if (!plan) continue;
    const memberships = await prisma.membership.findMany({
      where: { planId: plan.id, status: { in: ["ACTIVE", "PENDING", "PAUSED"] } },
    });
    for (const m of memberships) {
      const expiry = new Date(m.startDate);
      expiry.setDate(expiry.getDate() + p.durationDays);
      // Chỉ sửa nếu lệch (tránh đụng custom endDate cố ý)
      const diffMs = Math.abs(expiry.getTime() - m.expiryDate.getTime());
      const diffDays = diffMs / (24 * 60 * 60 * 1000);
      if (diffDays >= 1) {
        await prisma.membership.update({
          where: { id: m.id },
          data: { expiryDate: expiry },
        });
        fixed += 1;
        console.log("Fixed expiry", m.membershipCode, "→", expiry.toISOString().slice(0, 10));
      }
    }
  }
  console.log("Fixed memberships:", fixed);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
