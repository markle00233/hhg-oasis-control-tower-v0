/**
 * Bổ sung hạng mục: Trang trí Trung Thu – HHG Oasis (cập nhật 17/09/2026)
 * Chạy riêng: npx tsx prisma/seed-trungthu.ts
 * Idempotent: xóa project/tasks Trung Thu cũ rồi tạo lại.
 */
import { PrismaClient } from "@prisma/client";

type Row = {
  group: string;
  title: string;
  qty: string;
  owner: string;
  deadline: string;
  priority?: string;
};

export const TRUNG_THU_ROWS: Row[] = [
  {
    group: "Hạ tầng & An toàn",
    title: "Kiểm tra mặt bằng, khu vực setup",
    qty: "Toàn khu",
    owner: "Nhóm Hậu cần",
    deadline: "18/09/2026",
    priority: "P1",
  },
  {
    group: "Hạ tầng & An toàn",
    title: "Lối đi Trung Thu (tạo lối đi, dọn cỏ, vệ sinh, đảm bảo di chuyển)",
    qty: "1 khu",
    owner: "Nhóm Hậu cần",
    deadline: "19/09/2026",
    priority: "P1",
  },
  {
    group: "Hạ tầng & An toàn",
    title: "Bàn ghế",
    qty: "Theo thực tế",
    owner: "Nhóm Hậu cần",
    deadline: "21/09/2026",
  },
  {
    group: "Hạ tầng & An toàn",
    title: "Điện & dây dẫn (đường điện, đi dây, cố định, an toàn)",
    qty: "1 hệ thống",
    owner: "Nhóm Kỹ thuật",
    deadline: "23/09/2026",
    priority: "P0",
  },
  {
    group: "Hạ tầng & An toàn",
    title: "An toàn tổng thể (khung, đèn, vật dụng, trang trí)",
    qty: "Toàn khu",
    owner: "Nhóm An toàn",
    deadline: "25/09/2026",
    priority: "P0",
  },
  {
    group: "Hạ tầng & An toàn",
    title: "Vệ sinh mặt bằng (dọn cỏ, rác, lối đi, đảm bảo sạch sẽ)",
    qty: "Toàn khu",
    owner: "Nhóm Vệ sinh",
    deadline: "25/09/2026",
  },
  {
    group: "Cảnh quan & Ánh sáng",
    title: "Cổng / điểm bắt đầu (treo lồng đèn, bảng tên, trang trí)",
    qty: "1 bộ",
    owner: "Nhóm Trang trí",
    deadline: "18/09/2026",
    priority: "P1",
  },
  {
    group: "Cảnh quan & Ánh sáng",
    title: "Trang trí cây (đèn, dây, tiểu cảnh, quấn dây)",
    qty: "Theo thực tế",
    owner: "Nhóm Trang trí",
    deadline: "19/09/2026",
  },
  {
    group: "Cảnh quan & Ánh sáng",
    title: "Đèn thả từ trên xuống (thả dây đèn)",
    qty: "10–20 bóng",
    owner: "Nhóm Trang trí",
    deadline: "20/09/2026",
  },
  {
    group: "Cảnh quan & Ánh sáng",
    title: "Đèn dọc lối đi (đèn LED, tạo ánh sáng dẫn đường)",
    qty: "10–20 cái",
    owner: "Nhóm Trang trí",
    deadline: "20/09/2026",
  },
  {
    group: "Cảnh quan & Ánh sáng",
    title: "Đèn ông sao / lồng đèn (treo dọc cây, lối đi)",
    qty: "5–10 cái",
    owner: "Nhóm Trang trí",
    deadline: "24/09/2026",
  },
  {
    group: "Cảnh quan & Ánh sáng",
    title: "Thử nghiệm & test ánh sáng",
    qty: "Toàn khu",
    owner: "Nhóm Kỹ thuật",
    deadline: "25/09/2026",
    priority: "P1",
  },
  {
    group: "Check-in & Backdrop",
    title: "Khu check-in (xác định vị trí, trang trí)",
    qty: "1 khu",
    owner: "Nhóm Trang trí",
    deadline: "20/09/2026",
  },
  {
    group: "Check-in & Backdrop",
    title: "Backdrop check-in (dựng khung, nền, trang trí)",
    qty: "1 bộ",
    owner: "Nhóm Trang trí",
    deadline: "20/09/2026",
  },
  {
    group: "Check-in & Backdrop",
    title: "Mặt trăng – Thỏ Ngọc (trang trí, tiểu cảnh)",
    qty: "1 bộ",
    owner: "Nhóm Trang trí",
    deadline: "24/09/2026",
  },
  {
    group: "Check-in & Backdrop",
    title: "Tiểu cảnh hoa (vườn, cây xanh)",
    qty: "10–15 chậu",
    owner: "Nhóm Trang trí",
    deadline: "24/09/2026",
  },
  {
    group: "Check-in & Backdrop",
    title: "Bảng chỉ dẫn (Trung Thu – Ánh Trăng – Kết Nối – Yêu Thương)",
    qty: "2–3 bảng",
    owner: "Nhóm Trang trí",
    deadline: "24/09/2026",
  },
  {
    group: "Check-in & Backdrop",
    title: "Test check-in (kiểm tra góc chụp, ánh sáng)",
    qty: "1 lần",
    owner: "Nhóm Media + Kỹ thuật",
    deadline: "25/09/2026",
    priority: "P1",
  },
  {
    group: "Khu gian hàng hội chợ",
    title: "Bố trí gian hàng (vị trí, bàn, booth, trang trí)",
    qty: "2–4 booth",
    owner: "Nhóm Hậu cần",
    deadline: "21/09/2026",
  },
  {
    group: "Khu gian hàng hội chợ",
    title: "Trang trí gian hàng (theo concept Trung Thu)",
    qty: "2–4 booth",
    owner: "Nhóm Trang trí",
    deadline: "22/09/2026",
  },
  {
    group: "Khu gian hàng hội chợ",
    title: "Tiểu cảnh rơm (bó rơm, giỏ mây, thúng gỗ)",
    qty: "Theo concept",
    owner: "Nhóm Trang trí",
    deadline: "23/09/2026",
  },
  {
    group: "Khu gian hàng hội chợ",
    title: "Bánh Trung Thu (chuẩn bị bánh mẫu, sắp xếp)",
    qty: "Theo số lượng",
    owner: "Nhóm Hậu cần",
    deadline: "24/09/2026",
  },
  {
    group: "Khu gian hàng hội chợ",
    title: "Quà tặng (lồng đèn, voucher, quà nhỏ)",
    qty: "Theo khách",
    owner: "Nhóm Hậu cần",
    deadline: "24/09/2026",
  },
  {
    group: "Khu gian hàng hội chợ",
    title: "Kiểm tra gian hàng (bàn ghế, điện, an toàn)",
    qty: "Toàn khu",
    owner: "Trưởng khu gian hàng",
    deadline: "25/09/2026",
    priority: "P1",
  },
  {
    group: "Sân khấu",
    title: "Bố trí sân khấu (kích thước, vị trí)",
    qty: "1 sân khấu",
    owner: "Nhóm Sân khấu",
    deadline: "21/09/2026",
  },
  {
    group: "Sân khấu",
    title: "Trang trí sân khấu (backdrop, cây xanh)",
    qty: "1 bộ",
    owner: "Nhóm Trang trí",
    deadline: "22/09/2026",
  },
  {
    group: "Sân khấu",
    title: "Ghế sân khấu (xếp ghế, không chắn tầm nhìn)",
    qty: "Theo thực tế",
    owner: "Nhóm Hậu cần",
    deadline: "23/09/2026",
  },
  {
    group: "Sân khấu",
    title: "Chiếu sáng sân khấu (đèn LED, spotlight)",
    qty: "Theo sân khấu",
    owner: "Nhóm Kỹ thuật",
    deadline: "25/09/2026",
    priority: "P1",
  },
  {
    group: "Sân khấu",
    title: "Âm thanh (loa, micro, mixer)",
    qty: "1 hệ thống",
    owner: "Nhóm Kỹ thuật",
    deadline: "25/09/2026",
    priority: "P1",
  },
  {
    group: "Sân khấu",
    title: "Test sân khấu (tổng duyệt)",
    qty: "1 lần",
    owner: "Trưởng BTC + Kỹ thuật",
    deadline: "26/09/2026",
    priority: "P1",
  },
  {
    group: "Vận hành & Tháo gỡ",
    title: "Khu đón khách (bố trí, sắp xếp)",
    qty: "1 khu",
    owner: "Nhóm Lễ tân",
    deadline: "26/09/2026",
  },
  {
    group: "Vận hành & Tháo gỡ",
    title: "Check-in đón khách (nhân sự, hướng dẫn)",
    qty: "Theo thực tế",
    owner: "Nhóm Lễ tân",
    deadline: "26/09/2026",
  },
  {
    group: "Vận hành & Tháo gỡ",
    title: "Tổng kiểm tra (check-in, sân khấu, ghế, quà tặng, vệ sinh)",
    qty: "1 lần",
    owner: "Trưởng BTC",
    deadline: "26/09/2026",
    priority: "P1",
  },
  {
    group: "Vận hành & Tháo gỡ",
    title: "Giám sát sự kiện (ánh sáng, âm thanh, phát sinh)",
    qty: "1 nhóm",
    owner: "Trưởng BTC",
    deadline: "26/09/2026",
    priority: "P1",
  },
  {
    group: "Vận hành & Tháo gỡ",
    title: "Chụp ảnh / quay video (ghi hình hoạt động)",
    qty: "1 ekip",
    owner: "Nhóm Media",
    deadline: "26/09/2026",
  },
  {
    group: "Vận hành & Tháo gỡ",
    title: "Tháo dỡ (backdrop, đèn, lồng đèn, bàn ghế)",
    qty: "1 đợt",
    owner: "Nhóm Hậu cần",
    deadline: "27/09/2026",
  },
  {
    group: "Vận hành & Tháo gỡ",
    title: "Tận dụng & hoàn trả thiết bị (phân loại, lưu kho)",
    qty: "Theo thực tế",
    owner: "Nhóm Hậu cần",
    deadline: "27/09/2026",
  },
  {
    group: "Vận hành & Tháo gỡ",
    title: "Vệ sinh sau tháo dỡ (thu gom rác, dọn sạch)",
    qty: "Toàn khu",
    owner: "Nhóm Vệ sinh",
    deadline: "27/09/2026",
  },
];

export async function seedTrungThu(prisma: PrismaClient) {
  const unit =
    (await prisma.unit.findUnique({ where: { name: "Dùng chung" } })) ||
    (await prisma.unit.create({
      data: { name: "Dùng chung", sortOrder: 99 },
    }));

  const existing = await prisma.project.findMany({
    where: {
      OR: [
        { name: "Trang trí Trung Thu – HHG Oasis" },
        { name: { contains: "Trung Thu" } },
      ],
    },
    include: { tasks: true },
  });

  for (const p of existing) {
    await prisma.taskEvent.deleteMany({
      where: { taskId: { in: p.tasks.map((t) => t.id) } },
    });
    await prisma.decision.updateMany({
      where: { linkedProjectId: p.id },
      data: { linkedProjectId: null },
    });
    await prisma.task.deleteMany({ where: { projectId: p.id } });
    await prisma.project.delete({ where: { id: p.id } });
  }

  const project = await prisma.project.create({
    data: {
      name: "Trang trí Trung Thu – HHG Oasis",
      category: "Sự kiện / Trang trí · Trung Thu 2026",
      owner: "Trưởng BTC",
      budget: null,
      deadline: "27/09/2026",
      readiness: 0,
      status: "ON_TRACK",
      unitId: unit.id,
    },
  });

  let i = 0;
  for (const row of TRUNG_THU_ROWS) {
    i += 1;
    const code = `TT-${String(i).padStart(2, "0")}`;
    await prisma.task.create({
      data: {
        code,
        title: row.title,
        priority: row.priority || "P2",
        owner: row.owner,
        deadline: row.deadline,
        status: "TODO",
        progress: 0,
        note: `[${row.group}] SL dự kiến: ${row.qty}`,
        unitId: unit.id,
        projectId: project.id,
        events: {
          create: {
            label: "Nhập từ bảng hạng mục",
            detail: `${row.group} · ${row.qty} · cập nhật 17/09/2026`,
          },
        },
      },
    });
  }

  return {
    projectId: project.id,
    projectName: project.name,
    tasks: TRUNG_THU_ROWS.length,
    groups: [...new Set(TRUNG_THU_ROWS.map((r) => r.group))],
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await seedTrungThu(prisma);
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  /seed-trungthu\.(ts|js)$/.test(process.argv[1].replace(/\\/g, "/"));

if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
