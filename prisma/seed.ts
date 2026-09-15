import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.taskEvent.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.dailyClose.deleteMany();
  await prisma.task.deleteMany();
  await prisma.decision.deleteMany();
  await prisma.project.deleteMany();
  await prisma.unit.deleteMany();

  const unitNames = [
    "Lòng Nướng",
    "Spa",
    "Hồ bơi",
    "Gym",
    "Pickleball",
    "Khác",
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

  await prisma.project.create({
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

  await prisma.task.createMany({
    data: [
      {
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
        title: "Duyệt danh sách thiết bị bếp",
        priority: "P1",
        owner: "Giám đốc vận hành",
        deadline: "13/09",
        status: "BLOCKED",
        cost: 68_000_000,
        blocker: "Cần quyết định",
        progress: 40,
        projectId: bep.id,
      },
      {
        title: "Thay 4 đèn khu hồ trẻ em",
        priority: "P2",
        owner: "Kỹ thuật",
        deadline: "13/09",
        status: "WAITING",
        cost: 1_800_000,
        progress: 65,
        unitId: byName["Hồ bơi"].id,
      },
      {
        title: "Chụp lại menu và giá mới",
        priority: "P2",
        owner: "Nội dung",
        deadline: "15/09",
        status: "DOING",
        progress: 45,
        unitId: byName["Lòng Nướng"].id,
      },
      {
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
        title: "Kiểm tra ổ điện quầy phụ",
        priority: "P2",
        owner: "Kỹ thuật",
        deadline: "13/09",
        status: "TODO",
        progress: 10,
        unitId: byName["Lòng Nướng"].id,
      },
      {
        title: "Chụp ảnh Sau khu biển bảng",
        priority: "P2",
        owner: "Nhân viên phân khu",
        deadline: "14/09",
        status: "WAITING",
        cost: 3_200_000,
        progress: 90,
        unitId: byName["Pickleball"].id,
      },
    ],
  });

  const allTasks = await prisma.task.findMany();
  for (const t of allTasks) {
    await prisma.taskEvent.create({
      data: {
        taskId: t.id,
        label: "Seed demo",
        detail: `Trạng thái ban đầu: ${t.status} · ${t.progress}%`,
      },
    });
  }

  await prisma.decision.createMany({
    data: [
      {
        title: "Duyệt thiết bị Bếp trung tâm",
        amountLabel: "68,0 triệu",
        proposer: "Vận hành chung",
        approver: "Giám đốc vận hành",
        deadline: "13/09",
        impact:
          "Nhà cung cấp chưa thể khóa lịch lắp đặt; mức sẵn sàng dự kiến trễ 3–4 ngày.",
        status: "PENDING",
      },
      {
        title: "Chọn phương án cải tạo Pickleball",
        amountLabel: "42–79 triệu",
        proposer: "Quản lý phân khu",
        approver: "Giám đốc vận hành",
        deadline: "15/09",
        impact:
          "Phương án A: sửa tối thiểu · Phương án B: làm lại đồng bộ nhưng cần thêm thời gian.",
        status: "PENDING",
      },
      {
        title: "Xác nhận quy tắc phân chia Spa",
        amountLabel: "Quy tắc hợp đồng",
        proposer: "Tài chính",
        approver: "Lãnh đạo cấp cao",
        deadline: "16/09",
        impact:
          "Phần đóng góp thuộc HHG chỉ tính sau khi quy tắc được xác nhận.",
        status: "PENDING",
      },
    ],
  });

  await prisma.expense.createMany({
    data: [
      {
        unitId: byName["Lòng Nướng"].id,
        category: "OPEX",
        amount: 2_500_000,
        content: "Mua bổ sung vật tư phục vụ",
        source: "Ảnh hóa đơn",
        status: "PROVISIONAL",
      },
      {
        unitId: byName["Hồ bơi"].id,
        category: "MAINTENANCE",
        amount: 1_800_000,
        content: "Đèn và vật tư điện",
        source: "Gắn CV-0241",
        status: "RECONCILED",
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
