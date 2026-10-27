/** Gói bơi học viên HHG Oasis — catalog + helper. */

export type SwimPackage = {
  id: string;
  program: "camket" | "khong-camket" | "be" | "nang-cao";
  programLabel: string;
  name: string;
  sessions: number | null;
  /** null = theo tháng */
  priceVnd: number;
  priceNote?: string;
  bonusVisits: number;
  bonusNote?: string;
  extras?: string[];
  detail: string;
};

/** Lượt tự chọn được dùng cho một trong hai việc này. */
export const SWIM_BONUS_PURPOSES = ["Bơi tự do", "Gội 30'"] as const;

export type SwimBonusPurpose = (typeof SWIM_BONUS_PURPOSES)[number];

export function isSwimBonusPurpose(value: string): value is SwimBonusPurpose {
  return (SWIM_BONUS_PURPOSES as readonly string[]).includes(value);
}

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
    bonusNote: "10 lượt tự chọn / 30 ngày · bơi tự do hoặc gội 30'",
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
    bonusNote: "15 lượt tự chọn / 30 ngày · bơi tự do hoặc gội 30'",
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

/** Lượt tự chọn trên gói cam kết có hạn 30 ngày kể từ ngày đăng ký. */
export const SWIM_BONUS_WINDOW_DAYS = 30;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Add calendar months on the Vietnam wall clock. Day 31 clamps to the last day. */
function addMonthsVn(date: Date, months: number): Date {
  const vn = new Date(date.getTime() + VN_OFFSET_MS);
  const day = vn.getUTCDate();
  const shifted = new Date(
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + months, 1)
  );
  const dim = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)
  ).getUTCDate();
  shifted.setUTCDate(Math.min(day, dim));
  shifted.setUTCHours(
    vn.getUTCHours(),
    vn.getUTCMinutes(),
    vn.getUTCSeconds(),
    vn.getUTCMilliseconds()
  );
  return new Date(shifted.getTime() - VN_OFFSET_MS);
}

/** Self-choice visits end 30 days after signup. The lesson package itself does not. */
export function swimBonusExpiresAt(startedAt: Date): Date {
  return new Date(
    startedAt.getTime() + SWIM_BONUS_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
}

export function isSwimBonusOpen(startedAt: Date, now = new Date()): boolean {
  return swimBonusExpiresAt(startedAt).getTime() > now.getTime();
}

/** Students registered after this instant still have lượt tự chọn. */
export function swimBonusStartedAfter(now = new Date()): Date {
  return new Date(now.getTime() - SWIM_BONUS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Package end shown on the swim list.
 * Session courses stay open until the lessons are used.
 * Bé / nâng cao last one calendar month.
 */
export function swimPackageExpiresAt(pkg: SwimPackage, startedAt: Date): Date | null {
  if (pkg.sessions == null) return addMonthsVn(startedAt, 1);
  return null;
}

export function getSwimPackage(id: string) {
  return SWIM_PACKAGES.find((p) => p.id === id) || null;
}

export function formatSwimPrice(p: SwimPackage) {
  const n = new Intl.NumberFormat("vi-VN").format(p.priceVnd);
  return `${n}đ${p.priceNote || ""}`;
}
