"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";

export default function AccountPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<{
    customerCode: string;
    username: string;
    createdAt: string;
    fullName?: string | null;
    phone?: string | null;
    phoneLast4?: string | null;
    shortId?: string | null;
    segment?: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      if (!data.authenticated) {
        router.replace("/login");
        return;
      }
      if (!cancelled) setCustomer(data.customer);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const since = customer
    ? new Date(customer.createdAt).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  return (
    <Shell>
      <div className="animate-rise space-y-6">
        <h1 className="font-display text-3xl font-semibold text-oasis-ink">Tài khoản</h1>

        <div className="overflow-hidden rounded-[28px] bg-oasis-ink p-5 text-oasis-sand shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-oasis-gold">
            SĐT · ID
          </p>
          <p className="mt-2 font-mono text-2xl font-bold">{customer?.phone || "Chưa gắn SĐT"}</p>
          <p className="mt-3 font-mono text-5xl font-black tracking-[0.18em] text-oasis-gold">
            {customer?.phoneLast4 || customer?.shortId || "————"}
          </p>
        </div>

        <div className="rounded-[28px] bg-white/85 p-5 shadow-soft">
          <Info label="Họ tên" value={customer?.fullName || "—"} />
          <Info
            label="Loại khách"
            value={customer?.segment === "MEMBER" ? "Member" : "Khách lẻ"}
          />
          <Info label="Mã kỹ thuật" value={customer?.customerCode || "—"} />
          <Info label="Thành viên từ" value={since} last />
        </div>

        <Link
          href="/account/password"
          className="flex h-14 items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand"
        >
          Đổi mật khẩu
        </Link>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex h-14 w-full items-center justify-center rounded-2xl border border-oasis-line bg-white/70 text-base font-bold text-oasis-mute"
        >
          Đăng xuất
        </button>
      </div>
    </Shell>
  );
}

function Info({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={`py-3 ${last ? "" : "border-b border-oasis-line/70"}`}>
      <p className="text-xs uppercase tracking-wide text-oasis-mute">{label}</p>
      <p className="mt-1 font-mono text-base font-semibold text-oasis-ink">{value}</p>
    </div>
  );
}
