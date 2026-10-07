"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk(false);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (res.status === 401 && data.error?.includes("sign in")) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed");
      setOk(true);
      setCurrent("");
      setNew("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell showNav={false}>
      <div className="animate-rise space-y-6 pt-2">
        <Link href="/account" className="text-sm font-semibold text-oasis-moss">
          ← Tài khoản
        </Link>
        <h1 className="font-display text-3xl font-semibold text-oasis-ink">
          Đổi mật khẩu
        </h1>
        <form onSubmit={onSubmit} className="space-y-4 rounded-[28px] bg-white/85 p-5 shadow-soft">
          <Field label="Mật khẩu hiện tại" value={currentPassword} onChange={setCurrent} />
          <Field label="Mật khẩu mới" value={newPassword} onChange={setNew} />
          <Field label="Nhập lại mật khẩu mới" value={confirmPassword} onChange={setConfirm} />
          {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}
          {ok ? <p className="text-sm font-semibold text-oasis-moss">Đã cập nhật mật khẩu.</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand disabled:opacity-60"
          >
            Đổi mật khẩu
          </button>
        </form>
      </div>
    </Shell>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-oasis-mute">
        {label}
      </span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-14 w-full rounded-2xl border border-oasis-line bg-oasis-sand px-4 outline-none ring-oasis-moss focus:ring-2"
        required
      />
    </label>
  );
}
