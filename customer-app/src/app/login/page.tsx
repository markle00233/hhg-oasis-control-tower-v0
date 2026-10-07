"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Đăng nhập thất bại");
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function createNew() {
    setBusy(true);
    setError("");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      const res = await fetch("/api/auth/bootstrap", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tạo tài khoản thất bại");
      if (data.created && data.temporaryPassword) {
        sessionStorage.setItem(
          "oasis_new_account",
          JSON.stringify({
            customerCode: data.customer.customerCode,
            username: data.customer.username,
            temporaryPassword: data.temporaryPassword,
          })
        );
        router.replace("/welcome");
        return;
      }
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tạo tài khoản thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell showNav={false}>
      <div className="animate-rise space-y-8 pt-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-oasis-gold">
            Thẻ khách
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-oasis-ink">
            HHG Oasis
          </h1>
          <p className="mt-2 text-sm text-oasis-mute">
            Đăng nhập bằng SĐT / ID (4 số cuối) + mật khẩu.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-[28px] bg-white/80 p-5 shadow-soft">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-oasis-mute">
              SĐT / ID / Mã khách
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 h-14 w-full rounded-2xl border border-oasis-line bg-oasis-sand px-4 text-base outline-none ring-oasis-moss focus:ring-2"
              autoComplete="username"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-oasis-mute">
              Mật khẩu
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-14 w-full rounded-2xl border border-oasis-line bg-oasis-sand px-4 text-base outline-none ring-oasis-moss focus:ring-2"
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand disabled:opacity-60"
          >
            Đăng nhập
          </button>
        </form>

        <button
          type="button"
          disabled={busy}
          onClick={() => void createNew()}
          className="flex h-14 w-full items-center justify-center rounded-2xl border border-oasis-deep/20 bg-white/70 text-base font-bold text-oasis-deep"
        >
          Tạo khách mới
        </button>
      </div>
    </Shell>
  );
}
