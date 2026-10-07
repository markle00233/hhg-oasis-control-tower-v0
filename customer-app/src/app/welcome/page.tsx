"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";

type NewAccount = {
  customerCode: string;
  username: string;
  temporaryPassword: string;
};

export default function WelcomePage() {
  const router = useRouter();
  const [account, setAccount] = useState<NewAccount | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("oasis_new_account");
      if (!raw) {
        router.replace("/home");
        return;
      }
      setAccount(JSON.parse(raw) as NewAccount);
    } catch {
      router.replace("/home");
    }
  }, [router]);

  if (!account) {
    return (
      <Shell showNav={false}>
        <p className="text-oasis-mute">Đang tải…</p>
      </Shell>
    );
  }

  return (
    <Shell showNav={false}>
      <div className="animate-rise space-y-6 pt-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-oasis-gold">
            HHG Oasis
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-oasis-ink">
            Tài khoản Oasis đã được tạo.
          </h1>
          <p className="mt-2 text-sm text-oasis-mute">
            Lưu thông tin này. Khi đổi máy, đăng nhập bằng mã / SĐT + mật khẩu.
          </p>
        </div>

        <div className="rounded-[28px] bg-oasis-ink p-5 text-oasis-sand shadow-soft">
          <Row label="Mã khách" value={account.customerCode} />
          <Row label="Tên đăng nhập" value={account.username} />
          <Row label="Mật khẩu tạm" value={account.temporaryPassword} emphasize />
        </div>

        <button
          type="button"
          onClick={() => {
            const text = [
              "Tài khoản HHG Oasis",
              `Mã khách: ${account.customerCode}`,
              `Tên đăng nhập: ${account.username}`,
              `Mật khẩu tạm: ${account.temporaryPassword}`,
            ].join("\n");
            void navigator.clipboard?.writeText(text).then(() => setSaved(true));
            setSaved(true);
          }}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-oasis-gold text-base font-bold text-oasis-ink"
        >
          {saved ? "Đã lưu ✓" : "Lưu thông tin tài khoản"}
        </button>

        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem("oasis_new_account");
            router.replace("/home");
          }}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand"
        >
          Tiếp tục
        </button>
      </div>
    </Shell>
  );
}

function Row({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="border-b border-white/10 py-3 last:border-0">
      <p className="text-xs uppercase tracking-wider text-white/55">{label}</p>
      <p
        className={`mt-1 font-mono text-lg ${
          emphasize ? "font-bold tracking-wider text-oasis-gold" : "font-semibold"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
