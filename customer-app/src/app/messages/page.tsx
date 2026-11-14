"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { DelayTimes } from "@/components/delay-times";
import { fetchAuthMe } from "@/lib/auth-me-client";

type InboxItem = {
  id: string;
  title: string;
  body: string;
  at: string;
  unread?: boolean;
  href?: string;
  plannedWhen?: string;
  movedWhen?: string;
};

type MeCustomer = {
  vip?: boolean;
  vipPlanLabel?: string | null;
  vipExpiresAt?: string | null;
  vipExpiresLabel?: string | null;
  packageLabel?: string | null;
};

type DelayNotice = {
  id: string;
  name: string;
  startsAt: string;
  plannedWhen: string;
  movedWhen: string;
};

function delayNotices(rows: DelayNotice[]): InboxItem[] {
  const items: InboxItem[] = [];
  for (const row of rows) {
    if (!row.plannedWhen || !row.movedWhen) continue;
    items.push({
      id: `delay-${row.id}`,
      title: `Giải dời giờ · ${row.name}`,
      body: `Giờ dự kiến ${row.plannedWhen}. Giờ thi đấu đã dời về ${row.movedWhen}.`,
      at: row.startsAt,
      unread: true,
      href: "/tournaments",
      plannedWhen: row.plannedWhen,
      movedWhen: row.movedWhen,
    });
  }
  return items;
}

const VN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function daysUntil(iso: string, now = new Date()) {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return 99;
  const index = (value: Date) => {
    const [year, month, day] = VN_DAY.format(value).split("-").map(Number);
    return Date.UTC(year || 0, (month || 1) - 1, day || 1);
  };
  return Math.round((index(end) - index(now)) / 86_400_000);
}

function noticesFor(customer: MeCustomer | null, delays: InboxItem[]): InboxItem[] {
  const now = new Date().toISOString();
  const items: InboxItem[] = [...delays];
  const expiresAt = customer?.vipExpiresAt || "";
  if (customer?.vip && expiresAt) {
    const left = daysUntil(expiresAt);
    const plan = customer.packageLabel || customer.vipPlanLabel || "Gói bơi tháng";
    const when = customer.vipExpiresLabel || new Date(expiresAt).toLocaleDateString("vi-VN");
    if (left < 0) {
      items.push({
        id: "swim-expired",
        title: "Gói bơi tháng đã hết hạn",
        body: `${plan} hết hạn ${when}. Gia hạn gói tháng để tiếp tục bơi và giữ ưu đãi kèm theo.`,
        at: expiresAt,
        unread: true,
      });
    } else if (left <= 14) {
      items.push({
        id: "swim-expiring",
        title: "Gói bơi tháng sắp hết hạn",
        body: `${plan} còn ${left === 0 ? "hôm nay" : `${left} ngày`} (đến ${when}). Gia hạn sớm để giữ suất bơi và ưu đãi tháng mới.`,
        at: now,
        unread: true,
      });
    }
  }
  items.push({
    id: "welcome",
    title: "Chào mừng đến Oasis",
    body: "Quét QR tại từng khu để check-in. Đặt sân, gọi món và xem giải đấu ngay trong app.",
    at: now,
  });
  return items;
}

export default function MessagesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const delayPromise = fetch("/api/me/tournament-delays", {
        cache: "no-store",
        signal: ctrl.signal,
      })
        .then(async (res) => {
          if (!res.ok) return [] as DelayNotice[];
          const body = await res.json();
          return (body.delays || []) as DelayNotice[];
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") throw err;
          return [] as DelayNotice[];
        });
      const [me, delays] = await Promise.all([fetchAuthMe(), delayPromise]);
      if (ctrl.signal.aborted) return;
      const data = await me.json();
      if (!data.authenticated) {
        router.replace("/login");
        return;
      }
      setItems(noticesFor(data.customer || null, delayNotices(delays)));
      setReady(true);
    })().catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
    });
    return () => ctrl.abort();
  }, [router]);

  if (!ready) {
    return (
      <Shell>
        <p className="p-6 text-sm text-oasis-mute">Đang tải…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="animate-rise space-y-5">
        <header>
          <h1 className="font-display text-3xl font-semibold text-oasis-ink">
            Messages
          </h1>
          <p className="mt-1 text-sm text-oasis-mute">
            Tin nhắn và thông báo từ HHG Oasis
          </p>
        </header>

        <div className="space-y-3">
          {items.map((m) => (
            <article
              key={m.id}
              className="rounded-[22px] bg-white/90 p-4 shadow-soft"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-lg font-semibold text-oasis-ink">
                  {m.title}
                </p>
                {m.unread ? (
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-oasis-coral" />
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-oasis-mute">
                {m.body}
              </p>
              {m.plannedWhen && m.movedWhen ? (
                <DelayTimes planned={m.plannedWhen} moved={m.movedWhen} />
              ) : null}
              {m.href ? (
                <Link
                  href={m.href}
                  className="mt-3 inline-block text-sm font-bold text-oasis-ink"
                >
                  Xem giải đấu
                </Link>
              ) : null}
              <p className="mt-3 text-[11px] font-semibold text-oasis-mute">
                {new Date(m.at).toLocaleString("vi-VN")}
              </p>
            </article>
          ))}
        </div>
      </div>
    </Shell>
  );
}
