import { PrismaClient } from "@prisma/client";
import { seedUsers } from "./seed-users";

const prisma = new PrismaClient();

/**
 * Seed sạch: chỉ giữ Units + Users.
 * Xóa hết dữ liệu vận hành / mock (Task, Decision, Expense, AI, Documents…).
 */
async function main() {
  console.log("Wiping all operational / mock data…");

  // Order: children first where FKs may not cascade from every parent
  await prisma.aiTaskDraft.deleteMany();
  await prisma.messageInbox.deleteMany();
  await prisma.documentLink.deleteMany();
  await prisma.document.deleteMany();
  await prisma.projectEvent.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.taskEvent.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.dailyClose.deleteMany();
  await prisma.decision.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.unit.deleteMany();

  const unitNames = [
    "Lòng Nướng",
    "Spa",
    "Hồ bơi",
    "Gym",
    "Pickleball",
    "Khác",
    "Bếp Trung Tâm",
    "Mía Ơi",
    "Dùng chung",
  ];

  for (let i = 0; i < unitNames.length; i++) {
    await prisma.unit.create({
      data: { name: unitNames[i], sortOrder: i + 1 },
    });
  }

  await seedUsers(prisma);

  const counts = {
    units: await prisma.unit.count(),
    users: await prisma.user.count(),
    projects: await prisma.project.count(),
    tasks: await prisma.task.count(),
    decisions: await prisma.decision.count(),
    expenses: await prisma.expense.count(),
    dailyCloses: await prisma.dailyClose.count(),
    documents: await prisma.document.count(),
    issues: await prisma.issue.count(),
    messages: await prisma.messageInbox.count(),
  };
  console.log("Wipe OK — kept Units + Users only:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
