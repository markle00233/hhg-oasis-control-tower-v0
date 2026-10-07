"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";

type Activity = {
  serviceCode: string;
  serviceName: string;
  visits: number;
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Chào buổi sáng";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [shortId, setShortId] = useState("");
  const [phone, setPhone] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    router.prefetch("/scan");
    router.prefetch("/activity");
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        if (!cancelled) setError(data.error || "Không tải được dữ liệu");
        return;
      }
      if (cancelled) return;
      setName(data.customer.fullName || "");
      setShortId(data.customer.shortId || "");
      setPhone(data.customer.phone || "");
      setActivities(data.activities || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <Shell>
      <div className="animate-rise space-y-6">
        <header>
          <p className="font-display text-3xl font-semibold text-oasis-ink">{greeting()}</p>
          <p className="mt-1 text-base font-semibold text-oasis-ink">
            {name || "Khách HHG Oasis"}
          </p>
          {(shortId || phone) && (
            <p className="mt-1 font-mono text-sm font-semibold tracking-wide text-oasis-moss">
              {shortId ? `ID ${shortId}` : ""}
              {shortId && phone ? " · " : ""}
              {phone || ""}
            </p>
          )}
        </header>

        <Link
          href="/scan"
          className="block overflow-hidden rounded-[32px] bg-oasis-deep p-6 text-oasis-sand shadow-soft transition active:scale-[0.99]"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-oasis-gold">
            Thao tác chính
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold leading-tight">
            Quét mã QR
          </h2>
          <p className="mt-2 max-w-[16rem] text-sm text-white/70">
            Hướng camera vào điểm dịch vụ để check-in.
          </p>
          <span className="mt-6 inline-flex h-12 items-center rounded-full bg-oasis-gold px-5 text-sm font-bold text-oasis-ink">
            Quét ngay
          </span>
        </Link>

        <section>
          <div className="mb-3 flex items-end justify-between">
            <h3 className="font-display text-xl font-semibold text-oasis-ink">
              Lượt sử dụng
            </h3>
          </div>

          {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}

          {activities.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-oasis-line bg-white/50 p-6 text-sm text-oasis-mute">
              Chưa có lượt nào. Quét QR dịch vụ đầu tiên để bắt đầu.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {activities.map((a) => (
                <div
                  key={a.serviceCode}
                  className="rounded-3xl bg-white/85 p-4 shadow-soft"
                >
                  <p className="text-sm font-semibold text-oasis-ink">{a.serviceName}</p>
                  <p className="mt-3 font-display text-3xl font-semibold text-oasis-moss">
                    {a.visits}
                  </p>
                  <p className="text-xs font-medium text-oasis-mute">lượt</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}
