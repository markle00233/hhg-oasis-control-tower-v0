"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function safeSessionSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export default function GatePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await me.json();
        if (cancelled) return;
        if (data.authenticated) {
          router.replace("/home");
          return;
        }
      } catch {
        /* show landing */
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function createAccount() {
    setBusy(true);
    setError("");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      const res = await fetch("/api/auth/bootstrap", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tạo tài khoản thất bại");
      if (data.created && data.temporaryPassword && data.customer?.customerCode) {
        const ok = safeSessionSet(
          "oasis_new_account",
          JSON.stringify({
            customerCode: data.customer.customerCode,
            username: data.customer.username || data.customer.customerCode,
            temporaryPassword: data.temporaryPassword,
          })
        );
        router.replace(ok ? "/welcome" : "/home");
        return;
      }
      router.replace("/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tạo tài khoản thất bại");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-3xl font-semibold text-oasis-ink">
          HHG Oasis
        </p>
        <p className="mt-2 text-sm text-oasis-mute">Đang kiểm tra phiên…</p>
        <div className="mt-8 h-10 w-10 animate-pulse rounded-full bg-oasis-moss/30" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 pb-10 pt-12">
      <div className="animate-rise space-y-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-oasis-gold">
            Customer
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold text-oasis-ink">
            HHG Oasis
          </h1>
          <p className="mt-3 text-base text-oasis-mute">
            Tạo tài khoản để đặt sân, gọi món, giữ QR dịch vụ trên trang cá nhân.
          </p>
        </div>

        {error ? (
          <p className="rounded-2xl bg-white/80 p-3 text-sm text-oasis-coral shadow-soft">
            {error}
          </p>
        ) : null}

        <div className="space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void createAccount()}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand disabled:opacity-60"
          >
            {busy ? "Đang tạo…" : "Tạo tài khoản mới"}
          </button>
          <Link
            href="/login"
            className="flex h-14 w-full items-center justify-center rounded-2xl border border-oasis-deep/20 bg-white/80 text-base font-bold text-oasis-deep"
          >
            Đã có tài khoản · Đăng nhập
          </Link>
        </div>

        <p className="text-center text-xs text-oasis-mute">
          Sau khi tạo sẽ hiện mã khách + mật khẩu tạm — hãy lưu lại.
        </p>
      </div>
    </main>
  );
}
