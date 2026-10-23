"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";

type Phase = "login" | "signup" | "confirm";

export default function LoginPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("login");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [maskedLabel, setMaskedLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "signup") setPhase("signup");
  }, []);

  async function loginWith(phone: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: phone,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Đăng nhập thất bại");
    router.replace("/home");
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, lookup: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Đăng nhập thất bại");
      setMaskedLabel(String(data.maskedLabel || ""));
      setPhase("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function confirmYes() {
    setBusy(true);
    setError("");
    try {
      await loginWith(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setBusy(false);
    }
  }

  function backToLogin() {
    setError("");
    setMaskedLabel("");
    setPhase("login");
  }

  async function onSignup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: password.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tạo được tài khoản.");
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được tài khoản.");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "mt-1 h-14 w-full rounded-2xl border border-oasis-line bg-oasis-sand px-4 text-base outline-none ring-oasis-moss focus:ring-2";

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
            {phase === "signup"
              ? "Tạo tài khoản bằng họ tên và số điện thoại."
              : phase === "confirm"
                ? "Xác nhận đây là tài khoản của bạn."
                : "Đăng nhập bằng mật khẩu."}
          </p>
        </div>

        {phase === "confirm" ? (
          <div className="space-y-4 rounded-[28px] bg-white/80 p-5 shadow-soft">
            <p className="text-center text-sm font-semibold text-oasis-ink">
              Đây có phải tài khoản của bạn?
            </p>
            <div className="rounded-2xl border border-oasis-line bg-white px-4 py-3">
              <p className="font-mono text-sm font-semibold text-oasis-ink">
                {maskedLabel || "Đã có tài khoản với số này."}
              </p>
            </div>
            {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmYes()}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand disabled:opacity-60"
            >
              {busy ? "Đang vào…" : "Đúng — đăng nhập"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={backToLogin}
              className="flex h-12 w-full items-center justify-center text-sm font-semibold text-oasis-mute"
            >
              Không phải tôi
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={backToLogin}
              className="flex h-10 w-full items-center justify-center text-sm font-semibold text-oasis-mute"
            >
              ← Đổi số điện thoại
            </button>
          </div>
        ) : phase === "signup" ? (
          <form
            onSubmit={onSignup}
            className="space-y-4 rounded-[28px] bg-white/80 p-5 shadow-soft"
          >
            <NamePhoneFields
              fullName={fullName}
              setFullName={setFullName}
              phone={password}
              setPhone={setPassword}
              fieldClass={fieldClass}
            />
            {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand disabled:opacity-60"
            >
              {busy ? "Đang tạo…" : "Tạo tài khoản"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError("");
                setPhase("login");
              }}
              className="flex h-10 w-full items-center justify-center text-sm font-semibold text-oasis-mute"
            >
              Đã có tài khoản · Đăng nhập
            </button>
          </form>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError("");
                setPhase("signup");
              }}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand disabled:opacity-60"
            >
              Tạo tài khoản mới
            </button>

            <div className="relative py-1 text-center text-xs font-semibold uppercase tracking-wide text-oasis-mute">
              hoặc đăng nhập
            </div>

            <form
              onSubmit={onLogin}
              className="space-y-4 rounded-[28px] bg-white/80 p-5 shadow-soft"
            >
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-oasis-mute">
                  Mật khẩu
                </span>
                <input
                  type="tel"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={fieldClass}
                  autoComplete="current-password"
                  inputMode="tel"
                  placeholder="09xxxxxxxx"
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
          </>
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

function NamePhoneFields({
  fullName,
  setFullName,
  phone,
  setPhone,
  fieldClass,
  phoneLabel = "Số điện thoại",
}: {
  fullName: string;
  setFullName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  fieldClass: string;
  phoneLabel?: string;
}) {
  return (
    <>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-oasis-mute">
          Họ tên
        </span>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={fieldClass}
          autoComplete="name"
          placeholder="Nguyễn Văn A"
          required
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-oasis-mute">
          {phoneLabel}
        </span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={fieldClass}
          autoComplete="tel"
          inputMode="tel"
          placeholder="09xxxxxxxx"
          required
        />
      </label>
    </>
  );
}
