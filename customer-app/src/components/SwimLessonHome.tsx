"use client";

import Link from "next/link";
import {
  SWIM_ANNOUNCEMENT,
  SWIM_COACH_NAME,
  SWIM_COACH_PHONE,
  SWIM_HOTLINE,
  SWIM_PACKAGES,
  formatSwimPrice,
} from "@/lib/swim-packages";

const HIGHLIGHT = SWIM_PACKAGES.filter((p) =>
  ["camket-nhom-12", "camket-1k1-12", "khong-camket-12", "be-3-5", "nang-cao"].includes(
    p.id
  )
);

export function SwimLessonHome({ showBanner = true }: { showBanner?: boolean }) {
  return (
    <section className="space-y-3">
      {showBanner ? (
        <Link
          href={SWIM_ANNOUNCEMENT.href}
          className="block overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0c4a6e] via-[#0369a1] to-[#38bdf8] p-4 text-white shadow-soft"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100/90">
            Thông báo · Hồ Olympic
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold leading-tight">
            {SWIM_ANNOUNCEMENT.title}
          </h2>
          <p className="mt-1 text-sm text-sky-50/90">{SWIM_ANNOUNCEMENT.subtitle}</p>
          <p className="mt-3 text-xs font-bold text-lime-200">
            Xem đầy đủ gói & liên hệ HLV →
          </p>
        </Link>
      ) : null}

      <div className="flex items-end justify-between px-0.5">
        <div>
          <h2 className="font-display text-xl font-semibold text-oasis-ink">
            Gói học bơi
          </h2>
          <p className="mt-0.5 text-xs text-oasis-mute">
            Cam kết · không cam kết · bé · nâng cao
          </p>
        </div>
        <Link
          href="/swim"
          className="text-xs font-semibold text-oasis-moss"
        >
          Tất cả
        </Link>
      </div>

      <div
        className="scrollbar-none flex gap-3 overflow-x-auto pb-1"
        style={{
          marginLeft: -16,
          marginRight: -16,
          paddingLeft: 16,
          paddingRight: 16,
          scrollSnapType: "x mandatory",
        }}
      >
        {HIGHLIGHT.map((p) => (
          <Link
            key={p.id}
            href="/swim"
            className="flex w-[72%] max-w-[260px] shrink-0 flex-col rounded-[22px] bg-white p-4"
            style={{ scrollSnapAlign: "center" }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#0369a1]">
              {p.programLabel}
            </p>
            <p className="mt-1 font-display text-lg font-semibold text-[#0c4a6e]">
              {p.name}
            </p>
            <p className="mt-2 font-display text-2xl font-semibold text-[#0c4a6e]">
              {formatSwimPrice(p)}
            </p>
            <p className="mt-2 text-[11px] leading-snug text-slate-600">
              {p.detail}
            </p>
            {p.bonusVisits > 0 ? (
              <p className="mt-2 rounded-2xl bg-[#fef08a] px-2.5 py-1.5 text-[11px] font-bold leading-snug text-[#0c4a6e]">
                {p.bonusNote || `+${p.bonusVisits} lượt tự chọn`}
              </p>
            ) : null}
            {p.extras?.length ? (
              <p className="mt-1 text-[11px] font-semibold text-[#0369a1]">
                {p.extras[0]}
              </p>
            ) : null}
          </Link>
        ))}
      </div>

      <p className="px-0.5 text-[11px] text-oasis-mute">
        Hotline {SWIM_HOTLINE} · {SWIM_COACH_NAME} {SWIM_COACH_PHONE}
      </p>
    </section>
  );
}
