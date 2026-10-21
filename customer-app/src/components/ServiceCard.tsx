"use client";

import Link from "next/link";
import type { ServiceCardViewModel } from "@/lib/service-cards";

const TONE: Record<
  NonNullable<ServiceCardViewModel["statusTone"]>,
  { bg: string; fg: string }
> = {
  ok: { bg: "#dcfce7", fg: "#047857" },
  warn: { bg: "#ffedd5", fg: "#c2410c" },
  bad: { bg: "#fee2e2", fg: "#b91c1c" },
  mute: { bg: "#f1f5f9", fg: "#475569" },
};

export function ServiceCard({
  card,
  cancelling,
  onCancel,
}: {
  card: ServiceCardViewModel;
  cancelling?: boolean;
  onCancel?: (card: ServiceCardViewModel) => void;
}) {
  const tone = TONE[card.statusTone || "mute"];
  const clickable = card.href && card.href !== "/activity";

  const body = (
    <>
      <div
        className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-[11px] font-black tracking-wide text-white"
        style={{ background: card.accent }}
      >
        {(card.resourceName || card.zoneCode)
          .replace(/^Sân\s*/i, "")
          .slice(0, 4)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-oasis-mute">
          {card.zoneName}
        </p>
        <h3 className="mt-0.5 font-display text-lg font-semibold text-oasis-ink">
          {card.totalLabel || card.subtitle || card.title}
        </h3>
        <p className="mt-1 text-sm text-oasis-mute">
          {card.dateLabel}
          {card.timeLabel ? ` · ${card.timeLabel}` : ""}
          {card.partySize ? ` · ${card.partySize} khách` : ""}
        </p>

        {card.detailLines && card.detailLines.length > 0 ? (
          <ul className="mt-2 space-y-0.5 text-xs text-oasis-ink/80">
            {card.detailLines.slice(0, 5).map((line) => (
              <li key={line}>· {line}</li>
            ))}
            {card.detailLines.length > 5 ? (
              <li>· … +{card.detailLines.length - 5} mục</li>
            ) : null}
          </ul>
        ) : card.subtitle && card.totalLabel ? (
          <p className="mt-2 text-xs text-oasis-mute line-clamp-2">
            {card.subtitle}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ background: tone.bg, color: tone.fg }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: tone.fg }}
            />
            {card.statusLabel}
          </span>
          {card.promoLabel ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
              {card.promoLabel}
            </span>
          ) : null}
          {card.remainingLabel ? (
            <span className="text-[11px] font-semibold text-oasis-mute">
              {card.remainingLabel}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  return (
    <article className="overflow-hidden rounded-[24px] bg-white shadow-soft">
      {clickable ? (
        <Link
          href={card.href}
          className="flex gap-3 p-4 transition active:bg-black/[0.02]"
        >
          {body}
        </Link>
      ) : (
        <div className="flex gap-3 p-4">{body}</div>
      )}
      {card.canCancel && onCancel ? (
        <div className="flex justify-end border-t border-oasis-line/60 px-4 py-3">
          <button
            type="button"
            disabled={cancelling}
            onClick={() => onCancel(card)}
            className="h-9 rounded-xl border border-oasis-line bg-white px-3 text-[13px] font-extrabold text-oasis-ink disabled:opacity-40"
          >
            {cancelling ? "Đang huỷ…" : "Huỷ đơn"}
          </button>
        </div>
      ) : null}
      {card.showQrHint ? (
        <Link
          href={
            card.type === "TICKET" && card.referenceId
              ? `/q/${encodeURIComponent(card.referenceId)}`
              : card.qrToken
                ? `/q/${encodeURIComponent(card.qrToken)}`
                : "/qr"
          }
          className="flex items-center justify-between border-t border-oasis-line/60 px-4 py-3 text-xs font-semibold text-oasis-mute"
        >
          <span>
            {card.status === "PENDING_APPROVAL"
              ? "Chờ quầy duyệt — mở mã yêu cầu"
              : "Đưa QR cho nhân viên xác nhận"}
          </span>
          <span className="text-oasis-moss">Hiện QR →</span>
        </Link>
      ) : null}
    </article>
  );
}
