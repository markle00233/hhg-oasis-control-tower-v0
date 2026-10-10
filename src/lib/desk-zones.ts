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
];

export function getDeskZone(code: string): DeskZone | null {
  const c = code.trim().toUpperCase();
  return DESK_ZONES.find((z) => z.code === c) || null;
}

export function deskZoneByUsername(username: string): DeskZone | null {
  const u = username.trim().toUpperCase();
  return DESK_ZONES.find((z) => z.username === u) || null;
}

export function dashboardTitle(zoneName: string) {
  return `Dashboard ${zoneName}`;
}
