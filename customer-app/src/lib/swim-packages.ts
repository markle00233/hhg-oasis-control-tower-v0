/** Gói bơi học viên HHG Oasis — catalog Home. */

export type SwimPackage = {
  id: string;
  program: "camket" | "khong-camket" | "be" | "nang-cao";
  programLabel: string;
  name: string;
  sessions: number | null;
  priceVnd: number;
  priceNote?: string;
  bonusVisits: number;
  bonusNote?: string;
  extras?: string[];
  detail: string;
};

export const SWIM_HOTLINE = "0828808080";
export const SWIM_COACH_PHONE = "0949131155";
export const SWIM_COACH_NAME = "HLV Phương";

export const SWIM_ANNOUNCEMENT = {
  title: "Gói bơi học viên",
  subtitle:
    "Cam kết 1 kiểu bơi · nhóm / 1 kèm 1 · bơi cho bé · nâng cao. Hotline 0828 808 080.",
  href: "/swim",
};

export const SWIM_PACKAGES: SwimPackage[] = [
  {
    id: "camket-nhom-12",
    program: "camket",
    programLabel: "Cam kết · Nhóm 5–10",
    name: "12 buổi nhóm",
    sessions: 12,
    priceVnd: 2_500_000,
    bonusVisits: 10,
    bonusNote: "10 lượt tự chọn / 30 ngày · bơi tự do hoặc gội 30'",
    detail: "Chương trình cam kết · học 1 kiểu bơi · nhóm 5–10 người",
  },
  {
    id: "camket-nhom-16",
    program: "camket",
    programLabel: "Cam kết · Nhóm 5–10",
    name: "16 buổi nhóm",
    sessions: 16,
    priceVnd: 3_200_000,
    bonusVisits: 15,
    bonusNote: "15 lượt tự chọn / 30 ngày · bơi tự do hoặc gội 30'",
    detail: "Chương trình cam kết · học 1 kiểu bơi · nhóm 5–10 người",
  },
  {
    id: "camket-1k1-12",
    program: "camket",
    programLabel: "Cam kết · 01 kèm 01",
    name: "12 buổi 1 kèm 1",
    sessions: 12,
    priceVnd: 5_000_000,
    bonusVisits: 10,
    bonusNote: "10 lượt tự chọn / 30 ngày",
    extras: ["01 voucher Body Massage 60'"],
    detail: "Cam kết · 1 kèm 1 HLV · học 1 kiểu bơi",
  },
  {
    id: "camket-1k1-16",
    program: "camket",
    programLabel: "Cam kết · 01 kèm 01",
    name: "16 buổi 1 kèm 1",
    sessions: 16,
    priceVnd: 7_000_000,
    bonusVisits: 15,
    bonusNote: "15 lượt tự chọn / 30 ngày",
    extras: ["01 voucher Body Massage 60'"],
    detail: "Cam kết · 1 kèm 1 HLV · học 1 kiểu bơi",
  },
  {
    id: "khong-camket-12",
    program: "khong-camket",
    programLabel: "Không cam kết",
    name: "12 buổi",
    sessions: 12,
    priceVnd: 2_000_000,
    bonusVisits: 0,
    detail: "Học 1 kiểu bơi · không cam kết",
  },
  {
    id: "be-3-5",
    program: "be",
    programLabel: "Bơi cho bé 3–5 tuổi",
    name: "Gói tháng bé",
    sessions: null,
    priceVnd: 2_000_000,
    priceNote: "/ tháng",
    bonusVisits: 0,
    detail: "3 buổi/tuần · Thứ 2–4–6",
  },
  {
    id: "nang-cao",
    program: "nang-cao",
    programLabel: "Bơi nâng cao",
    name: "Gói tháng nâng cao",
    sessions: null,
    priceVnd: 2_000_000,
    priceNote: "/ tháng",
    bonusVisits: 0,
    detail: "Đã biết 2 kiểu bơi · 5 buổi/tuần · Thứ 2–6",
  },
];

export function getSwimPackage(id: string) {
  return SWIM_PACKAGES.find((p) => p.id === id) || null;
}

export function formatSwimPrice(p: SwimPackage) {
  const n = new Intl.NumberFormat("vi-VN").format(p.priceVnd);
  return `${n}đ${p.priceNote || ""}`;
}
