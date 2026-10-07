import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_SERVICES, MEMBERSHIP_PACKAGES } from "../src/config/crm.config";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding CRM V1 — HHG Oasis 12 gói...");

  const passwordByEmail: Record<string, string> = {
    "27/56a": await bcrypt.hash("hhgoasis27", 10),
    "55/62": await bcrypt.hash("hhgoasis55", 10),
    viewer1: await bcrypt.hash("hhgoasis-view1", 10),
    viewer2: await bcrypt.hash("hhgoasis-view2", 10),
    namanhadministrattion: await bcrypt.hash("namanhadmin123", 10),
  };

  const users = [
    { email: "27/56a", fullName: "HHGOASIS - 27/56", role: "STAFF", department: "OPS_A" },
    { email: "55/62", fullName: "HHGOASIS - 55/62", role: "STAFF", department: "OPS_B" },
    { email: "viewer1", fullName: "Chỉ xem 1", role: "VIEWER", department: "OPS_A" },
    { email: "viewer2", fullName: "Chỉ xem 2", role: "VIEWER", department: "OPS_B" },
    {
      email: "namanhadministrattion",
      fullName: "Nam Anh Administration",
      role: "ADMIN",
      department: "ADMIN",
    },
  ];

  // Giữ đúng danh sách acc vận hành / xem / admin — xóa user cũ nếu còn
  await prisma.opsNoticeRead.deleteMany({});
  await prisma.opsNotice.updateMany({ data: { actorId: null } });
  await prisma.visit.updateMany({ data: { staffId: null } });
  await prisma.activityLog.updateMany({ data: { staffId: null } });
  await prisma.membership.updateMany({ data: { createdById: null } });
  await prisma.promotion.updateMany({ data: { createdById: null } });
  await prisma.customerPromotion.updateMany({ data: { assignedById: null } });
  await prisma.customerNote.updateMany({ data: { authorId: null } });
  await prisma.user.deleteMany({
    where: { email: { notIn: users.map((u) => u.email) } },
  });

  const userIds: Record<string, string> = {};
  for (const u of users) {
    const passwordHash = passwordByEmail[u.email];
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        fullName: u.fullName,
        passwordHash,
        role: u.role,
        department: u.department,
        isActive: true,
      },
      create: { ...u, passwordHash },
    });
    userIds[u.email] = user.id;
  }

  // staffId dùng cho seed visits
  const seedStaffId = userIds["27/56a"] || Object.values(userIds)[0];
  if (seedStaffId) {
    userIds["staff@hhgo.local"] = seedStaffId;
  }

  // Xóa dữ liệu phụ thuộc service cũ trước khi đổi catalog
  await prisma.customerPromotion.deleteMany({});
  await prisma.promotion.deleteMany({});
  await prisma.customer.updateMany({ data: { familyGroupId: null } });
  await prisma.familyGroup.deleteMany({});
  await prisma.serviceUsage.deleteMany({});
  await prisma.visit.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.membershipPlanService.deleteMany({});
  await prisma.activityLog.deleteMany({});

  const activeCodes = DEFAULT_SERVICES.map((s) => s.code);

  // Ngừng các khu cũ không còn trong ma trận gói
  await prisma.service.updateMany({
    where: { code: { notIn: [...activeCodes] } },
    data: { status: "INACTIVE" },
  });

  // Ngừng plan cũ không nằm trong 12 gói
  const packageCodes = MEMBERSHIP_PACKAGES.map((p) => p.code);
  await prisma.membershipPlan.updateMany({
    where: { planCode: { notIn: [...packageCodes] } },
    data: { status: "INACTIVE" },
  });

  const serviceIds: Record<string, string> = {};
  for (let i = 0; i < DEFAULT_SERVICES.length; i++) {
    const s = DEFAULT_SERVICES[i];
    const row = await prisma.service.upsert({
      where: { code: s.code },
      update: { name: s.name, status: "ACTIVE", sortOrder: i + 1 },
      create: { code: s.code, name: s.name, status: "ACTIVE", sortOrder: i + 1 },
    });
    serviceIds[s.code] = row.id;
  }

  const planIds: Record<string, string> = {};
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
    planIds[p.code] = plan.id;
    await prisma.membershipPlanService.deleteMany({ where: { planId: plan.id } });
    await prisma.membershipPlanService.createMany({
      data: p.services.map((code) => ({
        planId: plan.id,
        serviceId: serviceIds[code],
      })),
    });
  }

  const staffId = userIds["staff@hhgo.local"];
  const now = new Date();

  const demoCustomers = [
    {
      code: "CUS-000001",
      fullName: "Nguyen Van Minh",
      phone: "0912345678",
      email: "minh@demo.vn",
      gender: "MALE",
      source: "FACEBOOK",
      note: "Gói Full — dùng đủ 4 khu",
      visits: 12,
      lastDaysAgo: 1,
    },
    {
      code: "CUS-000002",
      fullName: "Tran Thi Lan",
      phone: "0923456789",
      email: "lan@demo.vn",
      gender: "FEMALE",
      source: "WALK_IN",
      note: "Gói Pickleball",
      visits: 8,
      lastDaysAgo: 2,
    },
    {
      code: "CUS-000003",
      fullName: "Pham Hung",
      phone: "0934567890",
      email: "hung@demo.vn",
      gender: "MALE",
      source: "REFERRAL",
      note: "Gói Resort + Olympic",
      visits: 5,
      lastDaysAgo: 0,
    },
    {
      code: "CUS-000004",
      fullName: "Le Thi Hoa",
      phone: "0945678901",
      email: "hoa@demo.vn",
      gender: "FEMALE",
      source: "TIKTOK",
      note: "Gói Spa đã hết hạn",
      visits: 3,
      lastDaysAgo: 10,
    },
    {
      code: "CUS-000005",
      fullName: "Vo Tuan",
      phone: "0956789012",
      email: null,
      gender: "MALE",
      source: "GOOGLE",
      note: "Khách mới — Gói Olympic",
      visits: 1,
      lastDaysAgo: 0,
    },
  ];

  const customerIds: Record<string, string> = {};

  for (const c of demoCustomers) {
    const lastVisit = new Date(now);
    lastVisit.setDate(lastVisit.getDate() - c.lastDaysAgo);
    const firstVisit = new Date(now);
    firstVisit.setDate(firstVisit.getDate() - Math.max(c.visits * 3, 7));

    const customer = await prisma.customer.upsert({
      where: { customerCode: c.code },
      update: {
        fullName: c.fullName,
        phone: c.phone,
        phoneNormalized: c.phone.replace(/\D/g, ""),
        note: c.note,
        totalVisits: c.visits,
        lastVisitAt: lastVisit,
        firstVisitAt: firstVisit,
      },
      create: {
        customerCode: c.code,
        fullName: c.fullName,
        phone: c.phone,
        phoneNormalized: c.phone.replace(/\D/g, ""),
        email: c.email,
        gender: c.gender,
        source: c.source,
        note: c.note,
        dateOfBirth: new Date("1995-05-15"),
        totalVisits: c.visits,
        lastVisitAt: lastVisit,
        firstVisitAt: firstVisit,
        status: "ACTIVE",
      },
    });
    customerIds[c.code] = customer.id;

    await prisma.activityLog.create({
      data: {
        customerId: customer.id,
        activityType: "CUSTOMER_CREATED",
        title: "Customer Created",
        staffId,
        occurredAt: firstVisit,
      },
    });
  }

  const memDefs = [
    {
      code: "MEM-000001",
      customer: "CUS-000001",
      plan: "PKG_VIP_1M",
      daysLeft: 20,
      status: "ACTIVE",
    },
    {
      code: "MEM-000002",
      customer: "CUS-000002",
      plan: "PKG_PICK_1M",
      daysLeft: 5,
      status: "ACTIVE",
    },
    {
      code: "MEM-000003",
      customer: "CUS-000003",
      plan: "PKG_SWIM_3M",
      daysLeft: 15,
      status: "ACTIVE",
    },
    {
      code: "MEM-000004",
      customer: "CUS-000004",
      plan: "PKG_PICK_3M",
      daysLeft: -5,
      status: "EXPIRED",
    },
    {
      code: "MEM-000005",
      customer: "CUS-000005",
      plan: "PKG_SWIM_1M",
      daysLeft: 25,
      status: "ACTIVE",
    },
  ];

  for (const m of memDefs) {
    const start = new Date(now);
    start.setDate(start.getDate() - (30 - m.daysLeft));
    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + m.daysLeft);
    const planName = MEMBERSHIP_PACKAGES.find((p) => p.code === m.plan)?.name || m.plan;

    await prisma.membership.create({
      data: {
        membershipCode: m.code,
        contractCode: m.code.replace("MEM-", "HD-"),
        customerId: customerIds[m.customer],
        planId: planIds[m.plan],
        startDate: start,
        expiryDate: expiry,
        status: m.status,
        createdById: staffId,
      },
    });

    await prisma.activityLog.create({
      data: {
        customerId: customerIds[m.customer],
        activityType: "MEMBERSHIP_REGISTERED",
        title: `Membership Registered – ${planName}`,
        staffId,
        occurredAt: start,
      },
    });
  }

  const visitSamples = [
    { customer: "CUS-000001", services: ["RESORT", "SPA"], daysAgo: 1 },
    { customer: "CUS-000001", services: ["OLYMPIC", "PICKLEBALL"], daysAgo: 3 },
    { customer: "CUS-000001", services: ["SPA", "RESORT"], daysAgo: 7 },
    { customer: "CUS-000002", services: ["PICKLEBALL"], daysAgo: 2 },
    { customer: "CUS-000002", services: ["PICKLEBALL"], daysAgo: 5 },
    { customer: "CUS-000003", services: ["OLYMPIC"], daysAgo: 0 },
    { customer: "CUS-000003", services: ["RESORT", "OLYMPIC"], daysAgo: 4 },
    { customer: "CUS-000004", services: ["SPA"], daysAgo: 10 },
    { customer: "CUS-000005", services: ["OLYMPIC"], daysAgo: 0 },
  ];

  let seq = 1;
  for (const v of visitSamples) {
    const checkIn = new Date(now);
    checkIn.setDate(checkIn.getDate() - v.daysAgo);
    checkIn.setHours(9 + (seq % 8), 15, 0, 0);
    const checkOut = new Date(checkIn);
    checkOut.setHours(checkOut.getHours() + 2);
    const visitDate = new Date(checkIn);
    visitDate.setHours(0, 0, 0, 0);

    const visit = await prisma.visit.create({
      data: {
        visitCode: `VIS-${String(seq).padStart(6, "0")}`,
        customerId: customerIds[v.customer],
        checkInAt: checkIn,
        checkOutAt: v.daysAgo === 0 ? null : checkOut,
        visitDate,
        staffId,
      },
    });

    for (let i = 0; i < v.services.length; i++) {
      const svc = v.services[i];
      const startedAt = new Date(checkIn);
      startedAt.setMinutes(startedAt.getMinutes() + i * 50);
      const endedAt =
        v.daysAgo === 0 && i === v.services.length - 1
          ? null
          : new Date(startedAt.getTime() + (40 + (i % 3) * 15) * 60000);

      const svcName = DEFAULT_SERVICES.find((s) => s.code === svc)?.name || svc;

      await prisma.serviceUsage.create({
        data: {
          visitId: visit.id,
          customerId: customerIds[v.customer],
          serviceId: serviceIds[svc],
          startedAt,
          endedAt,
          status: endedAt ? "COMPLETED" : "ACTIVE",
        },
      });

      await prisma.activityLog.create({
        data: {
          customerId: customerIds[v.customer],
          activityType: "CHECK_IN",
          serviceId: serviceIds[svc],
          title: `${svcName} Check-in`,
          note: endedAt
            ? `${startedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} → ${endedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
            : `${startedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} → đang dùng`,
          staffId,
          occurredAt: startedAt,
        },
      });
    }
    seq++;
  }

  const olympicId = serviceIds["OLYMPIC"];
  if (olympicId) {
    await prisma.promotion.upsert({
      where: { code: "BOI-FREE" },
      update: { name: "Bơi miễn phí", serviceId: olympicId, status: "ACTIVE" },
      create: {
        code: "BOI-FREE",
        name: "Bơi miễn phí",
        type: "VOUCHER",
        description: "Khách được check-in khu Olympic (bơi) không cần gói membership",
        serviceId: olympicId,
        status: "ACTIVE",
        createdById: staffId,
      },
    });
  }

  console.log("✅ Seed xong: 4 khu · 12 gói membership · 2 acc vận hành");
  console.log("Login Admin: 1 / 123");
  console.log("Vận hành A: a / 123 · Vận hành B: b / 123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
