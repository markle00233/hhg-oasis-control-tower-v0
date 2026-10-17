/** Guest / physical zone catalog for QR generation + seeding. */

export const SERVICE_CATALOG = [
  { serviceCode: "ENTRANCE", serviceName: "Entrance" },
  { serviceCode: "OLYMPIC_POOL", serviceName: "Olympic Pool" },
  { serviceCode: "SPA", serviceName: "Spa" },
  { serviceCode: "SAUNA", serviceName: "Sauna" },
  { serviceCode: "MIA_OI", serviceName: "Mía Ơi" },
  { serviceCode: "PICKLEBALL", serviceName: "Pickleball" },
  { serviceCode: "LONG_NUONG", serviceName: "Lòng Nướng" },
  { serviceCode: "RESORT_POOL", serviceName: "Resort Pool" },
  { serviceCode: "JACUZZI", serviceName: "Jacuzzi" },
  { serviceCode: "EXIT", serviceName: "Exit" },
] as const;

/** Zones shown on /dev/qr gallery (active guest + physical). */
export const ACTIVE_ZONE_QR_CODES: readonly string[] = SERVICE_CATALOG.map(
  (s) => s.serviceCode
);

/** Hidden from Home / không in QR mới. */
export const DEPRECATED_ZONE_CODES = ["VIP_RESORT", "GYM"] as const;

export type ServiceCode = (typeof SERVICE_CATALOG)[number]["serviceCode"];

export function publicAppUrl() {
  const explicit = process.env.NEXT_PUBLIC_CUSTOMER_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3001";
}

/** Preferred QR path: /s/{qrToken|serviceCode} — no customer id. */
export function scanPathForService(serviceCode: string) {
  return `/s/${encodeURIComponent(serviceCode)}`;
}

/** Legacy path kept for older printed QRs. */
export function legacyScanPathForService(serviceCode: string) {
  return `/scan/${encodeURIComponent(serviceCode)}`;
}

export function scanUrlForService(serviceCode: string) {
  return `${publicAppUrl()}${scanPathForService(serviceCode)}`;
}
