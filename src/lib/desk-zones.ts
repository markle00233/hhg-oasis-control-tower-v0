/** Quầy laptop — 1 khu = 1 acc = chỉ thấy scan khu đó. */

export type DeskZone = {
  /** AppService.serviceCode */
  code: string;
  /** Tên hiển thị trên nút + "Dashboard …" */
  name: string;
  /** Username đăng nhập quầy */
  username: string;
};

export const DESK_ZONES: DeskZone[] = [
  { code: "MIA_OI", name: "Mía Ơi", username: "MIAOI" },
  { code: "VIP_RESORT", name: "VIP", username: "VIP" },
  { code: "PICKLEBALL", name: "Pickleball", username: "PICKLEBALL" },
  { code: "SAUNA", name: "HHG Oasis Spa", username: "SPA" },
  { code: "OLYMPIC_POOL", name: "Hồ Olympic", username: "GYM" },
  { code: "JACUZZI", name: "Jacuzzi", username: "JACUZZI" },
  { code: "LONG_NUONG", name: "Lòng Nướng Chí Phèo", username: "LONGNUONG" },
  { code: "SWIM_LESSON", name: "Khách học bơi", username: "HOCBOI" },
];

/** Quầy danh sách học viên — không dùng bảng duyệt QR thông thường. */
export function isSwimLessonDesk(code: string) {
  return code.trim().toUpperCase() === "SWIM_LESSON";
}

/** Zone uses resource grid (courts / tables / VIP). Spa = chỉ bán dịch vụ, không sơ đồ giường. */
export function zoneHasResources(code: string) {
  const c = code.toUpperCase();
  return c === "PICKLEBALL" || c === "LONG_NUONG" || c === "VIP_RESORT";
}

export function getDeskZone(code: string): DeskZone | null {
  const c = code.trim().toUpperCase();
  return DESK_ZONES.find((z) => z.code === c) || null;
}

/** Acc admin theo khu: ADMINISTRATION + username khu (vd. ADMINISTRATIONMIAOI). */
export function zoneAdminUsername(zoneUsername: string) {
  return `ADMINISTRATION${String(zoneUsername || "").trim().toUpperCase()}`;
}

export function parseZoneAdminUsername(username: string): DeskZone | null {
  const u = username.trim().toUpperCase();
  if (!u.startsWith("ADMINISTRATION")) return null;
  const rest = u.slice("ADMINISTRATION".length);
  if (!rest) return null;
  return DESK_ZONES.find((z) => z.username === rest) || null;
}

/** Acc admin khu (không phải ADMINISTRATION global). */
export function isZoneDeskAdmin(
  user: { username?: string | null; deskZone?: string | null },
  zoneCode?: string
) {
  const z = parseZoneAdminUsername(String(user.username || ""));
  if (!z) return false;
  if (zoneCode && !sameDeskSector(z.code, zoneCode)) return false;
  if (user.deskZone && !sameDeskSector(user.deskZone, z.code)) return false;
  return true;
}

export function deskZoneByUsername(username: string): DeskZone | null {
  const u = username.trim().toUpperCase();
  const direct = DESK_ZONES.find((z) => z.username === u);
  if (direct) return direct;
  return parseZoneAdminUsername(u);
}

export function dashboardTitle(zoneName: string) {
  return `Dashboard ${zoneName}`;
}

/** Mía Ơi và Hồ Olympic dùng chung một quầy: đổi chỗ không cần đăng xuất. */
export const MIA_OLYMPIC_SECTOR = ["MIA_OI", "OLYMPIC_POOL"] as const;
export const MIA_OLYMPIC_LABEL = "Mía Ơi · Hồ Olympic";

export function miaOlympicSector(code: string) {
  const z = code.trim().toUpperCase();
  return (MIA_OLYMPIC_SECTOR as readonly string[]).includes(z);
}

export function sameDeskSector(a: string, b: string) {
  const left = a.trim().toUpperCase();
  const right = b.trim().toUpperCase();
  if (left === right) return true;
  return miaOlympicSector(left) && miaOlympicSector(right);
}

/** Zone codes that map to the same desk counter (customer QR may use SPA vs SAUNA). */
export function deskZoneAliases(zone: string): string[] {
  const z = zone.trim().toUpperCase();
  const map: Record<string, string[]> = {
    SAUNA: ["SAUNA", "SPA"],
    SPA: ["SPA", "SAUNA"],
    OLYMPIC_POOL: ["OLYMPIC_POOL", "OLYMPIC"],
    OLYMPIC: ["OLYMPIC", "OLYMPIC_POOL"],
    VIP_RESORT: ["VIP_RESORT", "VIP"],
    VIP: ["VIP", "VIP_RESORT"],
    RESORT_POOL: ["RESORT_POOL", "RESORT"],
    RESORT: ["RESORT", "RESORT_POOL"],
  };
  return Array.from(new Set(map[z] || [z]));
}
