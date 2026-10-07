import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDuration(checkIn: Date, checkOut: Date | null | undefined): string {
  if (!checkOut) return "Đang ở";
  const mins = Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60000));
  if (mins < 60) return `${mins} phút`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}giờ ${m}phút` : `${h} giờ`;
}

/** Ví dụ: 09:15 → 11:20 · 2 giờ 5 phút */
export function formatTimeRange(
  start: Date | string,
  end?: Date | string | null
): string {
  const from = formatTime(start);
  if (!end) return `${from} → đang dùng`;
  const to = formatTime(end);
  const duration = formatDuration(
    typeof start === "string" ? new Date(start) : start,
    typeof end === "string" ? new Date(end) : end
  );
  return `${from} → ${to} · ${duration}`;
}

export function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export {
  CUSTOMER_SOURCES,
  GENDERS,
  MEMBERSHIP_STATUSES,
  DEFAULT_SERVICES,
} from "@/config/crm.config";
