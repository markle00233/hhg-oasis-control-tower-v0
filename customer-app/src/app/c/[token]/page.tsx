"use client";

import { use } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";

/** Deep link from My Oasis QR — for staff desk scanners / accidental opens. */
export default function CustomerIdentityDeepLink({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  return (
    <Shell showNav={false}>
      <div className="animate-rise space-y-5 py-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-oasis-mute">
          HHG Oasis
        </p>
        <h1 className="font-display text-3xl font-semibold text-oasis-ink">
          Mã định danh khách
        </h1>
        <p className="mx-auto max-w-sm text-sm text-oasis-mute">
          Đây là My Oasis QR. Nhân viên dùng quầy khu để quét và nhận khách — không
          phải mã check-in khu vật lý.
        </p>
        <p className="break-all rounded-2xl bg-white/80 px-4 py-3 font-mono text-xs text-oasis-mute shadow-soft">
          {token}
        </p>
        <Link
          href="/qr"
          className="inline-flex h-12 items-center justify-center rounded-full bg-oasis-deep px-6 text-sm font-bold text-oasis-sand"
        >
          Mở My Oasis QR
        </Link>
        <div>
          <Link href="/home" className="text-sm font-semibold text-oasis-moss">
            Về Home
          </Link>
        </div>
      </div>
    </Shell>
  );
}
