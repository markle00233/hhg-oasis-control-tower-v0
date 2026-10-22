"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ServiceCard } from "@/components/ServiceCard";
import type { ServiceCardViewModel } from "@/lib/service-cards";

export default function ActivityPage() {
  const router = useRouter();
  const [history, setHistory] = useState<ServiceCardViewModel[]>([]);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/cards/activity", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        if (!cancelled) setError(data.error || "Không tải được Activity");
        return;
      }
      if (cancelled) return;
      setError("");
      setHistory(data.history || []);
    }
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [router]);

  async function cancelOrder(card: ServiceCardViewModel) {
    if (cancellingId) return;
    if (
      !window.confirm(
        "Huỷ đơn này? Điểm đã đổi sẽ được hoàn, điểm đã cộng từ đơn sẽ bị thu lại."
      )
    ) {
      return;
    }
    setCancellingId(card.id);
    setError("");
    try {
      const res = await fetch("/api/me/orders", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: card.referenceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không huỷ được đơn");
      const res2 = await fetch("/api/cards/activity", { cache: "no-store" });
      const next = await res2.json();
      if (res2.ok) setHistory(next.history || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không huỷ được đơn");
    } finally {
      setCancellingId("");
    }
  }

  return (
    <Shell>
      <div className="animate-rise space-y-5">
        <header>
          <h1 className="font-display text-3xl font-semibold text-oasis-ink">
            Activity
          </h1>
          <p className="mt-1 text-sm text-oasis-mute">Lịch sử</p>
        </header>

        {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}

        {history.length === 0 ? (
          <p className="rounded-[22px] bg-white/70 p-4 text-sm text-oasis-mute shadow-soft">
            Chưa có lịch sử gần đây.
          </p>
        ) : (
          <div className="space-y-3">
            {history.map((c) => (
              <ServiceCard
                key={c.id}
                card={c}
                cancelling={cancellingId === c.id}
                onCancel={(card) => void cancelOrder(card)}
              />
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
