/**
 * Wipe all login users and create the two ops accounts.
 * Run: node --env-file=.env scripts/reset-ops-users.mjs
 * (or rely on DATABASE_URL in env)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD_BY_EMAIL = {
  "27/56a": "hhgoasis27",
  "55/62": "hhgoasis55",
};

const ACCOUNTS = [
  { email: "27/56a", fullName: "HHGOASIS - 27/56", role: "STAFF", department: "OPS_A" },
  { email: "55/62", fullName: "HHGOASIS - 55/62", role: "STAFF", department: "OPS_B" },
];

async function main() {
  console.log("Clearing FK refs to User…");
  await prisma.opsNoticeRead.deleteMany({});
  await prisma.opsNotice.updateMany({ data: { actorId: null } });
  await prisma.visit.updateMany({ data: { staffId: null } });
  await prisma.activityLog.updateMany({ data: { staffId: null } });
  await prisma.membership.updateMany({ data: { createdById: null } });
  await prisma.promotion.updateMany({ data: { createdById: null } });
  await prisma.customerPromotion.updateMany({ data: { assignedById: null } });
  await prisma.customerNote.updateMany({ data: { authorId: null } });

  console.log("Deleting all users…");
  const deleted = await prisma.user.deleteMany({});
  console.log(`Deleted ${deleted.count} users`);

  for (const a of ACCOUNTS) {
    const passwordHash = await bcrypt.hash(PASSWORD_BY_EMAIL[a.email], 10);
    const u = await prisma.user.create({
      data: { ...a, passwordHash, isActive: true },
    });
    console.log(`Created ${u.email} (${u.fullName}) · ${u.department}`);
  }

  console.log("Done.");
  console.log("27/56a → hhgoasis27");
  console.log("55/62 → hhgoasis55");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
