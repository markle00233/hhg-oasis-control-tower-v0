/**
 * CRM V1 — HHG Oasis
 * 4 khu dịch vụ + 12 gói membership (Bơi / Pick / VIP)
 */

export const COMPLEX = {
  name: "HHGO CRM",
  shortName: "HHGO",
} as const;

export const GENDERS = [
  { value: "MALE", label: "Nam" },
  { value: "FEMALE", label: "Nữ" },
  { value: "OTHER", label: "Khác" },
] as const;

export const CUSTOMER_SOURCES = [
  { value: "WALK_IN", label: "Walk-in" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "WEBSITE", label: "Website" },
  { value: "GOOGLE", label: "Google" },
  { value: "HOTLINE", label: "Hotline" },
  { value: "REFERRAL", label: "Referral" },
  { value: "EVENT", label: "Event" },
  { value: "OTHER", label: "Other" },
] as const;

export const MEMBERSHIP_STATUSES = [
  { value: "PENDING", label: "Pending", color: "bg-slate-100 text-slate-700" },
  { value: "ACTIVE", label: "Active", color: "bg-emerald-100 text-emerald-800" },
  { value: "PAUSED", label: "Paused", color: "bg-amber-100 text-amber-800" },
  { value: "EXPIRED", label: "Expired", color: "bg-rose-100 text-rose-800" },
  { value: "CANCELLED", label: "Cancelled", color: "bg-slate-200 text-slate-600" },
] as const;

/** 4 khu check-in — seed vào bảng Service */
export const DEFAULT_SERVICES = [
  { code: "RESORT", name: "Resort" },
  { code: "SPA", name: "Spa" },
  { code: "OLYMPIC", name: "Olympic / Bơi" },
  { code: "PICKLEBALL", name: "Pickleball" },
] as const;

export type PackageAreaCode = (typeof DEFAULT_SERVICES)[number]["code"];

/**
 * 12 gói: Bơi thường · Pick thường · VIP Full
 * durationDays = đúng số tháng đăng ký (không cộng tháng tặng / ưu đãi)
 */
export const MEMBERSHIP_PACKAGES = [
  // —— Bơi (xanh dương) ——
  {
    code: "PKG_SWIM_1M",
    name: "Bơi · 1 tháng",
    group: "SWIM",
    durationDays: 30,
    priceMonth: 700_000,
    priceTotal: 700_000,
    description: "700.000đ/tháng · 700.000đ/gói",
    services: ["OLYMPIC"] as PackageAreaCode[],
  },
  {
    code: "PKG_SWIM_3M",
    name: "Bơi · 3 tháng",
    group: "SWIM",
    durationDays: 90,
    priceMonth: 600_000,
    priceTotal: 1_800_000,
    description: "600.000đ/tháng · 1.800.000đ/gói · Tặng 1 tháng",
    services: ["OLYMPIC"] as PackageAreaCode[],
  },
  {
    code: "PKG_SWIM_6M",
    name: "Bơi · 6 tháng",
    group: "SWIM",
    durationDays: 180,
    priceMonth: 500_000,
    priceTotal: 3_000_000,
    description: "500.000đ/tháng · 3.000.000đ/gói · Tặng 2 tháng",
    services: ["OLYMPIC"] as PackageAreaCode[],
  },
  {
    code: "PKG_SWIM_12M",
    name: "Bơi · 12 tháng",
    group: "SWIM",
    durationDays: 365,
    priceMonth: 450_000,
    priceTotal: 5_400_000,
    description: "450.000đ/tháng · 5.400.000đ/gói · Tặng 3 tháng",
    services: ["OLYMPIC"] as PackageAreaCode[],
  },
  // —— Pick (cam) ——
  {
    code: "PKG_PICK_1M",
    name: "Pick · 1 tháng",
    group: "PICK",
    durationDays: 30,
    priceMonth: 600_000,
    priceTotal: 600_000,
    description: "Giá gốc 800.000 · 600.000đ/tháng · Tặng 2 vé bơi",
    services: ["PICKLEBALL"] as PackageAreaCode[],
  },
  {
    code: "PKG_PICK_3M",
    name: "Pick · 3 tháng",
    group: "PICK",
    durationDays: 90,
    priceMonth: 550_000,
    priceTotal: 1_650_000,
    description: "Giá gốc 700.000 · 550.000đ/tháng · 1.650.000đ/gói · Tặng 6 vé bơi",
    services: ["PICKLEBALL"] as PackageAreaCode[],
  },
  {
    code: "PKG_PICK_6M",
    name: "Pick · 6 tháng",
    group: "PICK",
    durationDays: 180,
    priceMonth: 500_000,
    priceTotal: 3_000_000,
    description: "Giá gốc 600.000 · 500.000đ/tháng · 3.000.000đ/gói · Tặng 12 vé bơi",
    services: ["PICKLEBALL"] as PackageAreaCode[],
  },
  {
    code: "PKG_PICK_12M",
    name: "Pick · 12 tháng",
    group: "PICK",
    durationDays: 365,
    priceMonth: 450_000,
    priceTotal: 5_400_000,
    description: "Giá gốc 500.000 · 450.000đ/tháng · 5.400.000đ/gói · Tặng 24 vé bơi",
    services: ["PICKLEBALL"] as PackageAreaCode[],
  },
  // —— VIP Full (tím) ——
  {
    code: "PKG_VIP_1M",
    name: "VIP Full · 1 tháng",
    group: "VIP",
    durationDays: 30,
    priceMonth: 1_000_000,
    priceTotal: 1_000_000,
    description: "Giá gốc 1.200.000 · 1.000.000đ/tháng · Full dịch vụ",
    services: ["RESORT", "SPA", "OLYMPIC", "PICKLEBALL"] as PackageAreaCode[],
  },
  {
    code: "PKG_VIP_3M",
    name: "VIP Full · 3 tháng",
    group: "VIP",
    durationDays: 90,
    priceMonth: 900_000,
    priceTotal: 2_700_000,
    description: "Giá gốc 1.100.000 · 900.000đ/tháng · 2.700.000đ/gói · Tặng 1 tháng",
    services: ["RESORT", "SPA", "OLYMPIC", "PICKLEBALL"] as PackageAreaCode[],
  },
  {
    code: "PKG_VIP_6M",
    name: "VIP Full · 6 tháng",
    group: "VIP",
    durationDays: 180,
    priceMonth: 800_000,
    priceTotal: 4_800_000,
    description: "Giá gốc 1.000.000 · 800.000đ/tháng · 4.800.000đ/gói · Tặng 2 tháng",
    services: ["RESORT", "SPA", "OLYMPIC", "PICKLEBALL"] as PackageAreaCode[],
  },
  {
    code: "PKG_VIP_12M",
    name: "VIP Full · 12 tháng",
    group: "VIP",
    durationDays: 365,
    priceMonth: 650_000,
    priceTotal: 7_800_000,
    description: "Giá gốc 900.000 · 650.000đ/tháng · 7.800.000đ/gói · Tặng 3 tháng",
    services: ["RESORT", "SPA", "OLYMPIC", "PICKLEBALL"] as PackageAreaCode[],
  },
] as const;

/** Màu theo loại gói: Bơi xanh · Pick cam · VIP tím */
export const PACKAGE_GROUP_THEME = {
  SWIM: {
    bg: "#DBEAFE",
    text: "#1E40AF",
    border: "#93C5FD",
    label: "Gói Bơi thường",
  },
  PICK: {
    bg: "#FFEDD5",
    text: "#9A3412",
    border: "#FDBA74",
    label: "Gói Pick thường",
  },
  VIP: {
    bg: "#EDE9FE",
    text: "#5B21B6",
    border: "#C4B5FD",
    label: "Gói VIP Full",
  },
} as const;

export type PackageGroup = keyof typeof PACKAGE_GROUP_THEME;

/** Thứ tự nhóm trên bảng giá: I Bơi · II Pick · III VIP */
export const PACKAGE_GROUP_ORDER = ["SWIM", "PICK", "VIP"] as const;

/** Số STT 1–4 trong từng nhóm (giống bảng giá) */
export function getPackageNumberInGroup(
  planCode: string,
  group: PackageGroup
): number {
  const inGroup = MEMBERSHIP_PACKAGES.filter((p) => p.group === group);
  const i = inGroup.findIndex((p) => p.code === planCode);
  return i >= 0 ? i + 1 : 0;
}

export function getPackageByCode(planCode?: string | null) {
  if (!planCode) return null;
  const idx = MEMBERSHIP_PACKAGES.findIndex((p) => p.code === planCode);
  if (idx < 0) return null;
  const pkg = MEMBERSHIP_PACKAGES[idx];
  const group = pkg.group as PackageGroup;
  return {
    /** STT 1–4 trong nhóm Bơi / Pick / VIP */
    number: getPackageNumberInGroup(pkg.code, group),
    /** Thứ tự toàn cục — dùng sort danh sách */
    sortIndex: idx + 1,
    ...pkg,
    theme: PACKAGE_GROUP_THEME[group],
  };
}

/**
 * Màu nhận diện cố định từng khu — dùng thống nhất toàn hệ thống
 */
export const AREA_THEME: Record<
  string,
  { solid: string; soft: string; text: string; border: string; label: string }
> = {
  RESORT: {
    solid: "#0EA5E9",
    soft: "#E0F2FE",
    text: "#0369A1",
    border: "#BAE6FD",
    label: "Resort",
  },
  SPA: {
    solid: "#EC4899",
    soft: "#FCE7F3",
    text: "#BE185D",
    border: "#FBCFE8",
    label: "Spa",
  },
  OLYMPIC: {
    solid: "#10B981",
    soft: "#D1FAE5",
    text: "#047857",
    border: "#A7F3D0",
    label: "Olympic / Bơi",
  },
  PICKLEBALL: {
    solid: "#F59E0B",
    soft: "#FEF3C7",
    text: "#B45309",
    border: "#FDE68A",
    label: "Pickleball",
  },
};

/** @deprecated dùng AREA_THEME[code].solid */
export const AREA_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(AREA_THEME).map(([code, t]) => [code, t.solid])
);

export function getAreaTheme(code?: string | null) {
  if (!code) {
    return {
      solid: "#6B7280",
      soft: "#F3F4F6",
      text: "#374151",
      border: "#E5E7EB",
      label: code || "Service",
    };
  }
  return (
    AREA_THEME[code.toUpperCase()] || {
      solid: "#6B7280",
      soft: "#F3F4F6",
      text: "#374151",
      border: "#E5E7EB",
      label: code,
    }
  );
}

export function isFullAccessPlan(planCode?: string | null, planName?: string | null) {
  const code = (planCode || "").toUpperCase();
  const name = (planName || "").toLowerCase();
  return (
    code.startsWith("PKG_VIP_") ||
    code === "PKG_FULL" ||
    code === "ALL_ACCESS" ||
    code.includes("FULL") ||
    code.includes("VIP") ||
    name.includes("vip full") ||
    name.includes("gói full") ||
    name.includes("full access") ||
    name.includes("all access")
  );
}

export const ROLES = [
  { value: "ADMIN", label: "Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "STAFF", label: "Staff / User" },
  { value: "VIEWER", label: "Chỉ xem" },
] as const;

export const DEPARTMENTS = [
  { value: "ADMIN", label: "Quản trị" },
  { value: "OPS_A", label: "Vận hành A" },
  { value: "OPS_B", label: "Vận hành B" },
] as const;

/** 3 NV kinh doanh nội bộ — chọn khi tạo khách / đăng ký gói */
export const SALES_PEOPLE = [
  { code: "SALE_A", name: "Anh A" },
  { code: "SALE_B", name: "Anh B" },
  { code: "SALE_C", name: "Anh C" },
] as const;

export type SalesPersonCode = (typeof SALES_PEOPLE)[number]["code"];

export const INTERNAL_ACCESS_PASSWORD = "123";

export function departmentLabel(code: string | null | undefined) {
  return DEPARTMENTS.find((d) => d.value === code)?.label || code || "—";
}

export function salesPersonLabel(code: string | null | undefined) {
  return SALES_PEOPLE.find((s) => s.code === code)?.name || code || "—";
}

export const FAMILY_RELATIONS = [
  { value: "OWNER", label: "Chủ hộ" },
  { value: "SPOUSE", label: "Vợ/Chồng" },
  { value: "CHILD", label: "Con" },
  { value: "PARENT", label: "Bố/Mẹ" },
  { value: "OTHER", label: "Người nhà" },
] as const;

export const SHARED_CUSTOMER_FIELDS = [
  { key: "fullName", label: "Họ và tên", required: true },
  { key: "phone", label: "Số điện thoại", required: true },
  { key: "email", label: "Email", required: false },
  { key: "dateOfBirth", label: "Ngày sinh", required: false },
  { key: "gender", label: "Giới tính", required: false },
  { key: "source", label: "Nguồn khách", required: false },
  { key: "note", label: "Ghi chú", required: false },
] as const;
