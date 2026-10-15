"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { isValidPhone } from "@/lib/phone";

type Phase = "form" | "confirm";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [maskedLabel, setMaskedLabel] = useState("");

  async function lookupIfPhone(): Promise<"ok" | "confirm" | "skip"> {
    const raw = username.trim();
    if (!isValidPhone(raw)) return "skip";
    const res = await fetch("/api/checkin/lookup-phone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: raw }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Không tra được SĐT");
    if (data.exists) {
      setMaskedLabel(data.maskedLabel || "");
      return "confirm";
    }
    return "ok";
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (phase === "form") {
        const look = await lookupIfPhone();
        if (look === "confirm") {
          setPhase("confirm");
          return;
        }
      }
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

  async function confirmAndLogin() {
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

  function resetLogin() {
    setUsername("");
    setPassword("");
    setMaskedLabel("");
    setPhase("form");
    setError("");
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
            Đăng nhập bằng SĐT / ID (4 số cuối) / mã khách + mật khẩu.
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void createNew()}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand disabled:opacity-60"
        >
          {busy ? "Đang tạo…" : "Tạo tài khoản mới"}
        </button>

        <div className="relative py-1 text-center text-xs font-semibold uppercase tracking-wide text-oasis-mute">
          hoặc đăng nhập
        </div>

        {phase === "confirm" ? (
          <div className="space-y-4 rounded-[28px] bg-white/80 p-5 shadow-soft">
            <p className="text-center text-sm font-semibold text-oasis-ink">
              Đây có phải bạn?
            </p>
            <div className="flex items-center gap-3 rounded-2xl border border-oasis-line bg-white px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#4285F4]/10 text-sm font-black text-[#4285F4]">
                G
              </span>
              <p className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-oasis-ink">
                {maskedLabel}
              </p>
            </div>
            {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}
            <button
              type="button"
              disabled={busy || !password}
              onClick={() => void confirmAndLogin()}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand disabled:opacity-60"
            >
              {busy ? "Đang vào…" : "Đúng — đăng nhập"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={resetLogin}
              className="flex h-12 w-full items-center justify-center text-sm font-semibold text-oasis-mute"
            >
              Không phải — đăng nhập lại
            </button>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-[28px] bg-white/80 p-5 shadow-soft"
          >
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
        )}

        <a
          href="/"
          className="block text-center text-sm font-semibold text-oasis-mute"
        >
          ← Quay lại
        </a>
      </div>
    </Shell>
  );
}
