/**
 * OPTIONAL one-shot: copy legacy HHGO CRM web DB → Control Tower DATABASE_URL (crm_*).
 *
 * App runtime does NOT use CRM_DATABASE_URL — only this script does.
 * Requires: CRM_DATABASE_URL + `npm run db:crm-generate`
 *
 * Usage:
 *   CRM_DATABASE_URL="postgres://..." npm run db:crm-generate
 *   CRM_DATABASE_URL="postgres://..." npm run db:migrate-crm
 */
import { PrismaClient as TowerPrisma } from "@prisma/client";
import { PrismaClient as CrmPrisma } from "../node_modules/.prisma/crm-client";

const sourceUrl = process.env.CRM_DATABASE_URL;
if (!sourceUrl) {
  console.error(
    "CRM_DATABASE_URL is required for this one-shot import only.\n" +
      "Runtime app already uses DATABASE_URL (crm_* tables)."
  );
  process.exit(1);
}

const source = new CrmPrisma({
  datasources: { db: { url: sourceUrl } },
});
const dest = new TowerPrisma();

async function clearDest() {
  await dest.crmOpsNoticeRead.deleteMany();
  await dest.crmOpsNotice.deleteMany();
  await dest.crmActivityLog.deleteMany();
  await dest.crmServiceUsage.deleteMany();
  await dest.crmVisit.deleteMany();
  await dest.crmCustomerPromotion.deleteMany();
  await dest.crmPromotion.deleteMany();
  await dest.crmServiceContract.deleteMany();
  await dest.crmMembership.deleteMany();
  await dest.crmMembershipPlanService.deleteMany();
  await dest.crmCustomer.updateMany({ data: { familyGroupId: null } });
  await dest.crmFamilyGroup.deleteMany();
  await dest.crmCustomerNote.deleteMany();
  await dest.crmCustomer.deleteMany();
  await dest.crmMembershipPlan.deleteMany();
  await dest.crmService.deleteMany();
  await dest.crmUser.deleteMany();
}

async function main() {
  console.log("Reading legacy CRM source…");
  const [
    users,
    services,
    plans,
    planServices,
    customers,
    notes,
    memberships,
    contracts,
    familyGroups,
    promotions,
    customerPromotions,
    visits,
    usages,
    activities,
    notices,
    noticeReads,
  ] = await Promise.all([
    source.user.findMany(),
    source.service.findMany(),
    source.membershipPlan.findMany(),
    source.membershipPlanService.findMany(),
    source.customer.findMany(),
    source.customerNote.findMany(),
    source.membership.findMany(),
    source.serviceContract.findMany(),
    source.familyGroup.findMany(),
    source.promotion.findMany(),
    source.customerPromotion.findMany(),
    source.visit.findMany(),
    source.serviceUsage.findMany(),
    source.activityLog.findMany(),
    source.opsNotice.findMany(),
    source.opsNoticeRead.findMany(),
  ]);

  console.log({
    users: users.length,
    services: services.length,
    plans: plans.length,
    customers: customers.length,
    memberships: memberships.length,
    contracts: contracts.length,
    visits: visits.length,
    activities: activities.length,
  });

  console.log("Clearing destination crm_* …");
  await clearDest();

  if (users.length) await dest.crmUser.createMany({ data: users });
  if (services.length) await dest.crmService.createMany({ data: services });
  if (plans.length) await dest.crmMembershipPlan.createMany({ data: plans });
  if (planServices.length) {
    await dest.crmMembershipPlanService.createMany({ data: planServices });
  }

  const customersClean = customers.map((c) => ({
    ...c,
    familyGroupId: null as string | null,
  }));
  if (customersClean.length) {
    await dest.crmCustomer.createMany({ data: customersClean });
  }

  if (familyGroups.length) {
    await dest.crmFamilyGroup.createMany({ data: familyGroups });
    for (const c of customers) {
      if (c.familyGroupId) {
        await dest.crmCustomer.update({
          where: { id: c.id },
          data: { familyGroupId: c.familyGroupId },
        });
      }
    }
  }

  if (notes.length) await dest.crmCustomerNote.createMany({ data: notes });

  const memsClean = memberships.map((m) => ({
    ...m,
    renewedFromId: null as string | null,
  }));
  if (memsClean.length) await dest.crmMembership.createMany({ data: memsClean });
  for (const m of memberships) {
    if (m.renewedFromId) {
      await dest.crmMembership.update({
        where: { id: m.id },
        data: { renewedFromId: m.renewedFromId },
      });
    }
  }

  if (contracts.length) await dest.crmServiceContract.createMany({ data: contracts });
  if (promotions.length) await dest.crmPromotion.createMany({ data: promotions });
  if (customerPromotions.length) {
    await dest.crmCustomerPromotion.createMany({ data: customerPromotions });
  }
  if (visits.length) await dest.crmVisit.createMany({ data: visits });
  if (usages.length) await dest.crmServiceUsage.createMany({ data: usages });
  if (activities.length) await dest.crmActivityLog.createMany({ data: activities });
  if (notices.length) await dest.crmOpsNotice.createMany({ data: notices });
  if (noticeReads.length) await dest.crmOpsNoticeRead.createMany({ data: noticeReads });

  console.log("✅ Migrated into Control Tower DATABASE_URL. crm_customers =", await dest.crmCustomer.count());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await source.$disconnect();
    await dest.$disconnect();
  });
