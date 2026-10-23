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
  /** 1 quầy · 1 QR · menu order 2 section (Mía + Hồ) */
  {
    code: "MIA_OLYMPIC",
    name: "Mía Ơi · Hồ Olympic",
    username: "MIAOI",
  },
  { code: "VIP_RESORT", name: "VIP", username: "VIP" },
  { code: "PICKLEBALL", name: "Pickleball", username: "PICKLEBALL" },
  { code: "SAUNA", name: "HHG Oasis Spa", username: "SPA" },
  { code: "LONG_NUONG", name: "Lòng Nướng Chí Phèo", username: "LONGNUONG" },
  { code: "SWIM_LESSON", name: "Khách học bơi", username: "HOCBOI" },
];

/** Acc GYM vẫn vào cùng quầy Mía·Olympic (không hiện ô riêng). */
export const LEGACY_DESK_USERNAMES: Record<string, string> = {
  GYM: "MIA_OLYMPIC",
  MIAOI: "MIA_OLYMPIC",
};

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
  if (c === "MIA_OI" || c === "OLYMPIC_POOL" || c === "OLYMPIC") {
    return DESK_ZONES.find((z) => z.code === "MIA_OLYMPIC") || null;
  }
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
  if (rest === "GYM" || rest === "MIAOI") return getDeskZone("MIA_OLYMPIC");
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
  const legacyCode = LEGACY_DESK_USERNAMES[u];
  if (legacyCode) return getDeskZone(legacyCode);
  const direct = DESK_ZONES.find((z) => z.username === u);
  if (direct) return direct;
  return parseZoneAdminUsername(u);
}

/** Resolve old MIA_OI / OLYMPIC_POOL codes to the merged desk tile. */
export function resolveDeskZone(code: string): DeskZone | null {
  const c = code.trim().toUpperCase();
  if (miaOlympicSector(c)) return getDeskZone("MIA_OLYMPIC");
  return getDeskZone(c);
}

export function dashboardTitle(zoneName: string) {
  return `Dashboard ${zoneName}`;
}

/** Mía Ơi + Hồ Olympic = 1 quầy / 1 dashboard / 1 QR. */
export const MIA_OLYMPIC_SECTOR = [
  "MIA_OLYMPIC",
  "MIA_OI",
  "OLYMPIC_POOL",
  "OLYMPIC",
] as const;
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
  if (miaOlympicSector(z)) {
    return ["MIA_OLYMPIC", "MIA_OI", "OLYMPIC_POOL", "OLYMPIC"];
  }
  const map: Record<string, string[]> = {
    SAUNA: ["SAUNA", "SPA"],
    SPA: ["SPA", "SAUNA"],
    VIP_RESORT: ["VIP_RESORT", "VIP"],
    VIP: ["VIP", "VIP_RESORT"],
    RESORT_POOL: ["RESORT_POOL", "RESORT"],
    RESORT: ["RESORT", "RESORT_POOL"],
  };
  return Array.from(new Set(map[z] || [z]));
}
