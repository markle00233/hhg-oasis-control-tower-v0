/** Shared helpers for desk "Tạo đơn" / empty SERVICE_USE shells. */

export function deskEventMeta(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

export function deskScanAlreadyFinalized(meta: Record<string, unknown>) {
  return (
    meta.ticketVerified === true ||
    typeof meta.orderId === "string" ||
    meta.walkInConsumed === true
  );
}

/** Lần quét trống (chưa món / chưa xác thực) — có thể gắn finalize vào. */
export function isOpenEmptyDeskShell(scan: {
  eventType: string;
  operationalStatus: string | null;
  metadata: unknown;
}) {
  if (scan.eventType !== "SERVICE_USE") return false;
  if ((scan.operationalStatus || "NEW") !== "NEW") return false;
  const meta = deskEventMeta(scan.metadata);
  if (deskScanAlreadyFinalized(meta)) return false;
  if (Array.isArray(meta.items) && meta.items.length > 0) return false;
  return true;
}
