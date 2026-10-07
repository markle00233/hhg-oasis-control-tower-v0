"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Shell } from "@/components/Shell";

function SuccessInner() {
  const sp = useSearchParams();
  const serviceName = sp.get("serviceName") || "Dịch vụ";
  const at = sp.get("at");
  const duplicate = sp.get("duplicate") === "1";
  const phone = sp.get("phone") || "";
  const shortId = sp.get("shortId") || "";
  const fullName = sp.get("fullName") || "";
  const customerCode = sp.get("customerCode") || "";

  const when = useMemo(() => {
    const d = at ? new Date(at) : new Date();
    return {
      date: d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      time: d.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    };
  }, [at]);

  return (
    <Shell showNav={false}>
      <div className="animate-rise flex min-h-[70dvh] flex-col items-center justify-center text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-oasis-moss text-3xl text-white shadow-soft">
          ✓
        </div>
        <h1 className="mt-6 font-display text-4xl font-semibold text-oasis-ink">
          {duplicate ? "Đã xác nhận trước đó" : "Đã xác nhận"}
        </h1>
        <p className="mt-3 text-lg font-semibold text-oasis-moss">{serviceName}</p>
        {fullName ? (
          <p className="mt-3 font-display text-2xl font-semibold text-oasis-ink">{fullName}</p>
        ) : null}

        <div className="mt-5 w-full max-w-sm overflow-hidden rounded-[28px] bg-oasis-ink px-5 py-5 text-oasis-sand">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-oasis-gold">
            SĐT · ID
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-wide">{phone || "—"}</p>
          <p className="mt-3 font-mono text-5xl font-black tracking-[0.18em] text-oasis-gold">
            {shortId || "————"}
          </p>
          {customerCode ? (
            <p className="mt-2 text-xs text-white/50">Mã kỹ thuật: {customerCode}</p>
          ) : null}
        </div>

        <p className="mt-4 text-sm text-oasis-mute">
          {when.date}
          <br />
          {when.time}
        </p>
        {duplicate ? (
          <p className="mt-4 text-sm text-oasis-coral">Bạn vừa xác nhận gần đây.</p>
        ) : null}
        <Link
          href="/home"
          className="mt-10 flex h-14 w-full max-w-sm items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand"
        >
          Về trang chủ
        </Link>
      </div>
    </Shell>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <Shell showNav={false}>
          <p>Đang tải…</p>
        </Shell>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}
