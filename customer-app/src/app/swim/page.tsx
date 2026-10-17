"use client";

import Link from "next/link";
import { Shell } from "@/components/Shell";
import {
  SWIM_COACH_NAME,
  SWIM_COACH_PHONE,
  SWIM_HOTLINE,
  SWIM_PACKAGES,
  formatSwimPrice,
  type SwimPackage,
} from "@/lib/swim-packages";

const PROGRAM_ORDER: SwimPackage["program"][] = [
  "camket",
  "khong-camket",
  "be",
  "nang-cao",
];

const PROGRAM_TITLE: Record<SwimPackage["program"], string> = {
  camket: "Chương trình cam kết",
  "khong-camket": "Không cam kết",
  be: "Bơi cho bé 3–5 tuổi",
  "nang-cao": "Bơi nâng cao",
};

export default function SwimPackagesPage() {
  return (
    <Shell>
      <div className="animate-rise space-y-5 pb-8">
        <header>
          <Link
            href="/home"
            className="text-xs font-semibold text-oasis-moss"
          >
            ← Home
          </Link>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-oasis-mute">
            HHG Oasis · Hồ Olympic
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-oasis-ink">
            Gói bơi học viên
          </h1>
          <p className="mt-2 text-sm text-oasis-mute">
            Học 1 kiểu bơi · nhóm / 1 kèm 1 · bé · nâng cao. Đăng ký tại quầy
            hoặc gọi hotline.
          </p>
          <div className="mt-3 rounded-[18px] bg-[#e0f2fe] px-4 py-3 text-sm text-[#0c4a6e]">
            <p className="font-semibold">Hotline {SWIM_HOTLINE}</p>
            <p className="mt-0.5 text-xs">
              {SWIM_COACH_NAME}: {SWIM_COACH_PHONE}
            </p>
            <p className="mt-2 text-[11px] text-[#0369a1]">
              Tái ký học kiểu bơi mới: giữ quyền lợi gói + thêm 01 Body Massage
              60&apos;.
            </p>
          </div>
        </header>

        {PROGRAM_ORDER.map((prog) => {
          const pkgs = SWIM_PACKAGES.filter((p) => p.program === prog);
          if (!pkgs.length) return null;
          return (
            <section key={prog} className="space-y-3">
              <h2 className="font-display text-xl font-semibold text-oasis-ink">
                {PROGRAM_TITLE[prog]}
              </h2>
              <div className="space-y-3">
                {pkgs.map((p) => (
                  <article
                    key={p.id}
                    className="rounded-[22px] bg-white p-4 shadow-soft"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-oasis-mute">
                          {p.programLabel}
                        </p>
                        <h3 className="mt-0.5 font-display text-lg font-semibold text-oasis-ink">
                          {p.name}
                        </h3>
                      </div>
                      <p className="shrink-0 font-display text-lg font-bold text-[#0c4a6e]">
                        {formatSwimPrice(p)}
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-oasis-mute">{p.detail}</p>
                    {p.sessions != null ? (
                      <p className="mt-2 text-xs font-semibold text-oasis-ink">
                        {p.sessions} buổi học
                      </p>
                    ) : null}
                    {p.bonusNote ? (
                      <p className="mt-1 text-xs font-semibold text-[#0369a1]">
                        {p.bonusNote}
                      </p>
                    ) : null}
                    {p.extras?.map((x) => (
                      <p
                        key={x}
                        className="mt-1 text-xs font-semibold text-oasis-moss"
                      >
                        {x}
                      </p>
                    ))}
                    <a
                      href={`tel:${SWIM_HOTLINE}`}
                      className="mt-3 inline-flex h-11 items-center justify-center rounded-2xl bg-[#0c4a6e] px-4 text-sm font-bold text-white"
                    >
                      Gọi đăng ký
                    </a>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
