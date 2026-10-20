"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";

type Detail = {
  bookingCode: string;
  zoneCode?: string;
  zoneName: string;
  resourceName: string | null;
  startAt: string;
  endAt: string;
  partySize: number;
  status: string;
  statusLabel: string;
  remainingLabel: string | null;
  showQrHint: boolean;
  qrToken?: string | null;
  createdAt: string;
  source: string;
};

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/cards/booking/${id}`, { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        if (!cancelled) setError(data.error || "Không tải booking");
        return;
      }
      if (!cancelled) setB(data.booking);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return (
    <Shell>
      <div className="animate-rise space-y-5">
        <Link href="/activity" className="text-sm font-semibold text-oasis-mute">
          ← Activity
        </Link>
        {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}
        {!b && !error ? (
          <p className="text-sm text-oasis-mute">Đang tải…</p>
        ) : null}
        {b ? (
          <>
            <header>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-oasis-mute">
                {b.zoneName}
              </p>
              <h1 className="mt-1 font-display text-3xl font-semibold text-oasis-ink">
                {b.resourceName || b.bookingCode}
              </h1>
              <p className="mt-2 inline-flex rounded-full bg-oasis-moss/15 px-3 py-1 text-xs font-bold text-oasis-moss">
                {b.statusLabel}
              </p>
            </header>

            <div className="rounded-[24px] bg-white/90 p-5 shadow-soft">
              <Row
                label="Ngày"
                value={new Date(b.startAt).toLocaleDateString("vi-VN")}
              />
              <Row
                label="Thời gian"
                value={`${new Date(b.startAt).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })} – ${new Date(b.endAt).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}`}
              />
              <Row label="Số khách" value={String(b.partySize)} />
              <Row label="Booking" value={b.bookingCode} />
              {b.remainingLabel ? (
                <Row label="Còn lại" value={b.remainingLabel} last />
              ) : (
                <Row label="Nguồn" value={b.source} last />
              )}
            </div>

            {b.zoneCode === "LONG_NUONG" ? (
              <p className="rounded-2xl bg-white px-4 py-3 text-sm text-oasis-ink shadow-soft">
                Quầy sẽ gọi để xác nhận. Khi đến, nói tên hoặc số điện thoại.
              </p>
            ) : null}

            {b.showQrHint ? (
              <Link
                href={
                  b.qrToken
                    ? `/q/${encodeURIComponent(b.qrToken)}`
                    : "/qr"
                }
                className="flex h-14 items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand"
              >
                {b.qrToken ? "Hiện QR" : "Hiện My Oasis QR"}
              </Link>
            ) : null}

            <div className="flex gap-3">
              <Link
                href={
                  b.zoneCode === "LONG_NUONG"
                    ? "/book/long-nuong"
                    : "/book/pickleball"
                }
                className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-white text-sm font-bold text-oasis-ink shadow-soft"
              >
                {b.zoneCode === "LONG_NUONG" ? "Đặt bàn khác" : "Đặt thêm sân"}
              </Link>
              <Link
                href="/home"
                className="flex h-12 flex-1 items-center justify-center rounded-2xl border border-oasis-line text-sm font-bold text-oasis-mute"
              >
                Về Home
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </Shell>
  );
}

function Row({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-3 ${
        last ? "" : "border-b border-oasis-line/60"
      }`}
    >
      <span className="text-sm text-oasis-mute">{label}</span>
      <span className="font-mono text-sm font-semibold text-oasis-ink">
        {value}
      </span>
    </div>
  );
}
