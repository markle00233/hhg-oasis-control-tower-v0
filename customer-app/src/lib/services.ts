export const SERVICE_CATALOG = [
  { serviceCode: "ENTRANCE", serviceName: "Entrance" },
  { serviceCode: "OLYMPIC_POOL", serviceName: "Olympic Pool" },
  { serviceCode: "RESORT_POOL", serviceName: "Resort Pool" },
  { serviceCode: "VIP_RESORT", serviceName: "VIP Resort" },
  { serviceCode: "SAUNA", serviceName: "Sauna" },
  { serviceCode: "JACUZZI", serviceName: "Jacuzzi" },
  { serviceCode: "MIA_OI", serviceName: "Mía Ơi" },
  { serviceCode: "PICKLEBALL", serviceName: "Pickleball" },
  { serviceCode: "EXIT", serviceName: "Exit" },
] as const;

export type ServiceCode = (typeof SERVICE_CATALOG)[number]["serviceCode"];

export function publicAppUrl() {
  const explicit = process.env.NEXT_PUBLIC_CUSTOMER_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
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
