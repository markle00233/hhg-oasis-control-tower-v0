"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";

type InboxItem = {
  id: string;
  title: string;
  body: string;
  at: string;
  unread?: boolean;
};

/** Placeholder inbox until FCM / push backend is wired. */
const DEMO_INBOX: InboxItem[] = [
  {
    id: "1",
    title: "Chào mừng đến Oasis",
    body: "Quét QR tại từng khu để check-in. Đặt Pickleball & order Mía Ơi ngay trong app.",
    at: new Date().toISOString(),
    unread: true,
  },
];

export default function MessagesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [items] = useState<InboxItem[]>(DEMO_INBOX);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await me.json();
      if (!data.authenticated) {
        router.replace("/login");
        return;
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
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
            Tin nhắn & thông báo từ HHG Oasis
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
              <p className="mt-3 text-[11px] font-semibold text-oasis-mute">
                {new Date(m.at).toLocaleString("vi-VN")}
              </p>
            </article>
          ))}
        </div>

        <div className="rounded-[22px] border border-dashed border-oasis-line bg-white/50 p-4 text-sm text-oasis-mute">
          <p className="font-semibold text-oasis-ink">Push notification (FCM)</p>
          <p className="mt-2 leading-relaxed">
            Web <strong>có hỗ trợ FCM</strong> qua Web Push + service worker
            (HTTPS). Chrome / Edge / Firefox / Android ổn; iOS chỉ khi user
            thêm web app ra Home Screen (iOS 16.4+). Chưa bật trong bản này —
            inbox đang là placeholder.
          </p>
        </div>
      </div>
    </Shell>
  );
}
