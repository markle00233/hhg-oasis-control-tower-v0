import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.aiTaskDraft.deleteMany();
  await prisma.messageInbox.deleteMany();
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

  const units = [];
  for (let i = 0; i < unitNames.length; i++) {
    units.push(
      await prisma.unit.create({
        data: { name: unitNames[i], sortOrder: i + 1 },
      })
    );
  }
  const byName = Object.fromEntries(units.map((u) => [u.name, u]));
  const date = "2026-09-13";

  await prisma.dailyClose.createMany({
    data: [
      {
        unitId: byName["Lòng Nướng"].id,
        date,
        revenue: 42_600_000,
        cashCollected: 39_800_000,
        source: "MANUAL",
        status: "PROVISIONAL",
      },
      {
        unitId: byName["Spa"].id,
        date,
        revenue: 28_100_000,
        cashCollected: 26_900_000,
        source: "POS",
        status: "RECONCILED",
      },
      {
        unitId: byName["Hồ bơi"].id,
        date,
        revenue: 19_800_000,
        cashCollected: 19_800_000,
        source: "MANUAL",
        status: "LOCKED",
      },
      {
        unitId: byName["Gym"].id,
        date,
        revenue: 11_200_000,
        cashCollected: 10_700_000,
        source: "EXCEL",
        status: "PROVISIONAL",
      },
      {
        unitId: byName["Khác"].id,
        date,
        revenue: 15_000_000,
        cashCollected: 12_900_000,
        source: "FINANCE",
        status: "LOCKED",
      },
    ],
  });

  const longNuong = await prisma.project.create({
    data: {
      name: "Mở rộng Lòng Nướng",
      category: "Doanh thu / Mở rộng",
      owner: "Vận hành",
      budget: 350_000_000,
      deadline: "30/09",
      readiness: 68,
      status: "AT_RISK",
      unitId: byName["Lòng Nướng"].id,
    },
  });

  const bep = await prisma.project.create({
    data: {
      name: "Bếp trung tâm",
      category: "Vận hành / Hạ tầng",
      owner: "Vận hành chung",
      budget: 480_000_000,
      deadline: "24/09",
      readiness: 54,
      status: "BLOCKED",
    },
  });

  const pickle = await prisma.project.create({
    data: {
      name: "Tái vận hành Pickleball",
      category: "Cải tiến / Tái vận hành",
      owner: "Quản lý phân khu",
      budget: 120_000_000,
      deadline: "02/10",
      readiness: 61,
      status: "AT_RISK",
      unitId: byName["Pickleball"].id,
    },
  });

  await prisma.project.create({
    data: {
      name: "Tái vận hành khu Gym",
      category: "Doanh thu / Tái vận hành",
      owner: "Kinh doanh",
      budget: 95_000_000,
      deadline: "05/10",
      readiness: 77,
      status: "ON_TRACK",
      unitId: byName["Gym"].id,
    },
  });

  const kitchen = await prisma.task.create({
    data: {
      code: "CV-0228",
      title: "Duyệt danh sách thiết bị bếp",
      priority: "P1",
      owner: "Giám đốc vận hành",
      deadline: "13/09",
      status: "BLOCKED",
      cost: 68_000_000,
      blocker: "Cần quyết định",
      progress: 40,
      projectId: bep.id,
      events: {
        create: {
          label: "Seed",
          detail: "Chuyển vào Việc chờ quyết định",
        },
      },
    },
  });

  const lights = await prisma.task.create({
    data: {
      code: "CV-0241",
      title: "Thay 4 đèn khu hồ trẻ em",
      priority: "P2",
      owner: "Kỹ thuật",
      deadline: "13/09",
      status: "WAITING",
      cost: 1_800_000,
      progress: 65,
      unitId: byName["Hồ bơi"].id,
    },
  });

  const signage = await prisma.task.create({
    data: {
      code: "CV-0239",
      title: "Chụp ảnh Sau khu biển bảng",
      priority: "P2",
      owner: "Nhân viên phân khu",
      deadline: "14/09",
      status: "WAITING",
      cost: 3_200_000,
      progress: 90,
      unitId: byName["Pickleball"].id,
      projectId: pickle.id,
    },
  });

  await prisma.task.createMany({
    data: [
      {
        code: "CV-0231",
        title: "Chốt layout mở rộng khu nướng",
        priority: "P1",
        owner: "Vận hành",
        deadline: "14/09",
        status: "DOING",
        progress: 55,
        unitId: byName["Lòng Nướng"].id,
        projectId: longNuong.id,
      },
      {
        code: "CV-0245",
        title: "Chụp lại menu và giá mới",
        priority: "P2",
        owner: "Nội dung",
        deadline: "15/09",
        status: "DOING",
        progress: 45,
        unitId: byName["Lòng Nướng"].id,
      },
      {
        code: "CV-0219",
        title: "Xử lý vệ sinh kho phụ",
        priority: "P2",
        owner: "Vệ sinh",
        deadline: "13/09",
        status: "DONE",
        cost: 400_000,
        progress: 100,
        unitId: byName["Spa"].id,
      },
      {
        code: "CV-0247",
        title: "Kiểm tra ổ điện quầy phụ",
        priority: "P2",
        owner: "Kỹ thuật",
        deadline: "13/09",
        status: "TODO",
        progress: 10,
        unitId: byName["Lòng Nướng"].id,
      },
    ],
  });

  await prisma.decision.createMany({
    data: [
      {
        code: "QD-0007",
        title: "Duyệt thiết bị Bếp trung tâm",
        amountLabel: "68,0 triệu",
        proposer: "Vận hành chung",
        approver: "Giám đốc vận hành",
        deadline: "13/09",
        impact:
          "Nhà cung cấp chưa thể khóa lịch lắp đặt; mức sẵn sàng dự kiến trễ 3–4 ngày.",
        isBlocking: true,
        status: "PENDING",
        linkedTaskId: kitchen.id,
        linkedProjectId: bep.id,
      },
      {
        code: "QD-0008",
        title: "Chọn phương án cải tạo Pickleball",
        amountLabel: "42–79 triệu",
        proposer: "Quản lý phân khu",
        approver: "Giám đốc vận hành",
        deadline: "15/09",
        impact: "Cần chốt phương án để giữ lịch nhà thầu.",
        isBlocking: true,
        status: "PENDING",
        linkedProjectId: pickle.id,
      },
      {
        code: "QD-0009",
        title: "Xác nhận quy tắc phân chia Spa",
        amountLabel: "Quy tắc hợp đồng",
        proposer: "Tài chính",
        approver: "Lãnh đạo cấp cao",
        deadline: "16/09",
        impact: "Phần đóng góp thuộc HHG chỉ tính sau khi quy tắc được xác nhận.",
        isBlocking: false,
        status: "PENDING",
      },
    ],
  });

  await prisma.expense.createMany({
    data: [
      {
        code: "CP-0124",
        unitId: byName["Lòng Nướng"].id,
        category: "OPERATING",
        categoryLabel: "Vận hành thường xuyên",
        amount: 2_500_000,
        content: "Mua bổ sung vật tư phục vụ",
        source: "Ảnh hóa đơn",
        status: "PROVISIONAL",
        aiSuggestion: "Vận hành thường xuyên",
        aiConfidence: 93,
        humanConfirmed: true,
      },
      {
        code: "CP-0123",
        unitId: byName["Hồ bơi"].id,
        category: "MAINTENANCE",
        categoryLabel: "Sửa chữa / bảo trì",
        amount: 1_800_000,
        content: "Đèn và vật tư điện",
        source: "Gắn CV-0241",
        status: "RECONCILED",
        linkedTaskId: lights.id,
        aiSuggestion: "Sửa chữa / bảo trì",
        aiConfidence: 91,
        humanConfirmed: true,
      },
      {
        code: "CP-0122",
        unitId: byName["Dùng chung"].id,
        category: "OPERATING",
        categoryLabel: "Vận hành thường xuyên",
        amount: 1_600_000,
        content: "Vật tư vệ sinh",
        source: "Chứng từ",
        status: "LOCKED",
        aiConfidence: 96,
        humanConfirmed: true,
      },
      {
        code: "CP-0121",
        unitId: byName["Pickleball"].id,
        category: "IMPROVEMENT",
        categoryLabel: "Cải tạo / nâng cấp",
        amount: 2_500_000,
        content: "Biển bảng khu sân",
        source: "Gắn CV-0239",
        status: "RECONCILED",
        linkedTaskId: signage.id,
        aiConfidence: 78,
        humanConfirmed: true,
      },
    ],
  });

  console.log("Seed OK — units:", units.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
