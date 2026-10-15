"use client";

import Link from "next/link";
import type { ServiceCardViewModel } from "@/lib/service-cards";

export function ServiceCard({ card }: { card: ServiceCardViewModel }) {
  return (
    <article className="overflow-hidden rounded-[24px] bg-white shadow-soft">
      <Link
        href={card.href}
        className="flex gap-3 p-4 transition active:bg-black/[0.02]"
      >
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-[11px] font-black tracking-wide text-white"
          style={{ background: card.accent }}
        >
          {(card.resourceName || card.zoneCode).replace(/^Sân\s*/i, "").slice(0, 4)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-oasis-mute">
            {card.zoneName}
          </p>
          <h3 className="mt-0.5 truncate font-display text-lg font-semibold text-oasis-ink">
            {card.subtitle || card.title}
          </h3>
          <p className="mt-1 text-sm text-oasis-mute">
            {card.dateLabel}
            {card.timeLabel ? ` · ${card.timeLabel}` : ""}
            {card.partySize ? ` · ${card.partySize} khách` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{
                background: `${card.accent}18`,
                color: card.accent,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: card.accent }}
              />
              {card.statusLabel}
            </span>
            {card.remainingLabel ? (
              <span className="text-[11px] font-semibold text-oasis-mute">
                {card.remainingLabel}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
      {card.showQrHint ? (
        <Link
          href="/qr"
          className="flex items-center justify-between border-t border-oasis-line/60 px-4 py-3 text-xs font-semibold text-oasis-mute"
        >
          <span>Đưa My Oasis QR cho nhân viên khi đến</span>
          <span className="text-oasis-moss">Hiện QR →</span>
        </Link>
      ) : null}
    </article>
  );
}
