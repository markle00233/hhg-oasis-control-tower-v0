"use client";

export type JourneyItem = {
  type: string;
  id: string;
  zoneCode: string | null;
  zoneName: string | null;
  occurredAt: string;
  status: string;
  summary: string;
  detail?: {
    items?: { nameVi: string; qty: number; unitPriceVnd: number }[];
    totalVnd?: number;
  };
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

export function JourneyCard({
  item,
  expanded,
  onToggle,
}: {
  item: JourneyItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const typeLabel =
    item.type === "SERVICE_USE"
      ? "Check-in"
      : item.type === "ORDER"
        ? "Order"
        : item.type === "BOOKING"
          ? "Booking"
          : item.type;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full rounded-[22px] bg-white/90 p-4 text-left shadow-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-oasis-mute">
            {formatTime(item.occurredAt)} · {typeLabel}
          </p>
          <p className="mt-1 font-display text-lg font-semibold text-oasis-ink">
            {item.zoneName || item.zoneCode || "—"}
          </p>
          <p className="mt-1 text-sm text-oasis-mute">{item.summary}</p>
        </div>
        <span className="rounded-full bg-oasis-sand px-2 py-1 text-[11px] font-bold text-oasis-deep">
          {item.status}
        </span>
      </div>
      {expanded && item.detail?.items?.length ? (
        <ul className="mt-3 space-y-1 border-t border-oasis-line/60 pt-3 text-sm">
          {item.detail.items.map((line, idx) => (
            <li key={idx} className="flex justify-between gap-2">
              <span>
                {line.qty} × {line.nameVi}
              </span>
              <span className="font-mono">
                {formatVnd(line.unitPriceVnd * line.qty)}
              </span>
            </li>
          ))}
          {typeof item.detail.totalVnd === "number" ? (
            <li className="flex justify-between border-t border-oasis-line/50 pt-2 font-bold">
              <span>Tổng</span>
              <span>{formatVnd(item.detail.totalVnd)}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </button>
  );
}

export function JourneyEmpty({ text }: { text: string }) {
  return (
    <p className="rounded-[22px] bg-white/70 p-4 text-sm text-oasis-mute shadow-soft">
      {text}
    </p>
  );
}
