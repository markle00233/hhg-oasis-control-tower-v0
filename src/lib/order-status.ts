/** Staff-confirmed / paid — no customer reverse, history not "in progress". */
export const FINALIZED_ORDER_STATUSES = [
  "ACCEPTED",
  "READY",
  "SERVED",
  "DONE",
  "CONFIRMED",
] as const;

export function isFinalizedOrderStatus(status: string) {
  return (FINALIZED_ORDER_STATUSES as readonly string[]).includes(status);
}

export function deskOrderStatusLabel(status: string) {
  if (status === "CANCELLED") return "CANCELLED";
  if (isFinalizedOrderStatus(status)) return "Hoàn tất";
  return status;
}
