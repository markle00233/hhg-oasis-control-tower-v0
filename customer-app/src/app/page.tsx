"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function GatePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

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
            Đăng nhập bằng họ tên + số điện thoại.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/login?mode=signup"
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand"
          >
            Tạo tài khoản mới
          </Link>
          <Link
            href="/login"
            className="flex h-14 w-full items-center justify-center rounded-2xl border border-oasis-deep/20 bg-white/80 text-base font-bold text-oasis-deep"
          >
            Đã có tài khoản · Đăng nhập
          </Link>
        </div>

        <p className="text-center text-xs text-oasis-mute">
          Đăng nhập: họ tên · mật khẩu là số điện thoại.
        </p>
      </div>
    </main>
  );
}
