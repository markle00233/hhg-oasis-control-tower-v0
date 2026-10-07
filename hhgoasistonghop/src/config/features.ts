/**
 * Catalog chức năng CRM — Admin tick bật/tắt theo từng tài khoản.
 * `href` dùng để ẩn menu / chặn vào trang tương ứng.
 */
export const CRM_FEATURES = [
  {
    code: "dashboard",
    label: "Dashboard",
    description: "Xem trang tổng quan",
    href: "/",
    group: "Chính",
  },
  {
    code: "customers",
    label: "Customers · xem",
    description: "Xem danh sách và chi tiết khách",
    href: "/customers",
    group: "Chính",
  },
  {
    code: "customers_write",
    label: "Customers · tạo / sửa",
    description: "Tạo khách, đăng ký gói, ghi chú",
    href: "/customers/new",
    group: "Chính",
  },
  {
    code: "checkin",
    label: "Check-in",
    description: "Check-in khách theo khu",
    href: "/checkin",
    group: "Chính",
  },
  {
    code: "receipts",
    label: "Receipt · xem / in",
    description: "Xem và in hợp đồng",
    href: "/receipts",
    group: "Database",
  },
  {
    code: "receipts_write",
    label: "Receipt · chỉnh sửa",
    description: "Tạo / lưu form hợp đồng",
    href: "/receipts",
    group: "Database",
  },
  {
    code: "services",
    label: "Services",
    description: "Xem danh mục khu dịch vụ",
    href: "/services",
    group: "Database",
  },
  {
    code: "settings",
    label: "Settings",
    description: "Cấu hình gói / tài khoản",
    href: "/settings",
    group: "Database",
  },
  {
    code: "internal",
    label: "Nội bộ (Internal)",
    description: "Doanh số theo NV kinh doanh",
    href: "/internal",
    group: "Internal",
  },
  {
    code: "static",
    label: "Static",
    description: "Thống kê theo ngày của acc",
    href: "/static",
    group: "Internal",
  },
] as const;

export type FeatureCode = (typeof CRM_FEATURES)[number]["code"];

export type FeatureFlags = Partial<Record<FeatureCode, boolean>>;

/** Mặc định theo role khi chưa có tick từ Admin */
export function defaultFeatureFlags(role: string): FeatureFlags {
  if (role === "ADMIN") {
    return Object.fromEntries(CRM_FEATURES.map((f) => [f.code, true])) as FeatureFlags;
  }
  if (role === "STAFF") {
    return {
      dashboard: true,
      customers: true,
      customers_write: true,
      checkin: true,
      receipts: true,
      receipts_write: true,
      services: true,
      settings: true,
      internal: false,
      static: true,
    };
  }
  // VIEWER / MANAGER — chỉ xem
  return {
    dashboard: true,
    customers: true,
    customers_write: false,
    checkin: true,
    receipts: true,
    receipts_write: false,
    services: true,
    settings: false,
    internal: false,
    static: true,
  };
}

export function resolveFeatureFlags(
  role: string,
  stored: unknown
): Record<FeatureCode, boolean> {
  const base = defaultFeatureFlags(role);
  const overrides =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as FeatureFlags)
      : {};
  const out = {} as Record<FeatureCode, boolean>;
  for (const f of CRM_FEATURES) {
    if (role === "ADMIN") {
      out[f.code] = true;
      continue;
    }
    out[f.code] =
      typeof overrides[f.code] === "boolean" ? Boolean(overrides[f.code]) : Boolean(base[f.code]);
  }
  return out;
}

export function hasFeature(
  role: string,
  flags: FeatureFlags | Record<string, boolean> | null | undefined,
  code: FeatureCode
): boolean {
  if (role === "ADMIN") return true;
  const resolved = resolveFeatureFlags(role, flags);
  return !!resolved[code];
}

/** Map đường dẫn → feature cần có để vào trang */
export function featureForPath(pathname: string): FeatureCode | null {
  if (pathname === "/" || pathname.startsWith("/areas/")) return "dashboard";
  if (pathname.startsWith("/customers/new")) return "customers_write";
  if (pathname.startsWith("/customers")) return "customers";
  if (pathname.startsWith("/checkin")) return "checkin";
  if (pathname.startsWith("/receipts")) return "receipts";
  if (pathname.startsWith("/services")) return "services";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/internal")) return "internal";
  if (pathname.startsWith("/static")) return "static";
  if (pathname.startsWith("/admin")) return null; // chỉ ADMIN — check riêng
  return null;
}
