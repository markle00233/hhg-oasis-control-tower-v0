"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { isValidPhone } from "@/lib/phone";

type ServiceInfo = {
  id: string;
  code: string;
  name: string;
  slug: string | null;
  qrToken: string | null;
};

type CustomerInfo = {
  id: string;
  name: string;
  phone: string | null;
  phoneLast4: string | null;
};

type Step =
  | "loading"
  | "returning"
  | "identify"
  | "recovery"
  | "remember"
  | "success"
  | "error";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function CheckinFlow({ serviceToken }: { serviceToken: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("loading");
  const [service, setService] = useState<ServiceInfo | null>(null);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [fromIdentify, setFromIdentify] = useState(false);
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [last4, setLast4] = useState("");
  const [recoveryMode, setRecoveryMode] = useState<"phone" | "last4">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [eventAt, setEventAt] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);

  const token = serviceToken.trim();

  const load = useCallback(async () => {
    setStep("loading");
    setError("");
    try {
      const res = await fetch(
        `/api/checkin/resolve?token=${encodeURIComponent(token)}`,
        { cache: "no-store", credentials: "same-origin" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tải được dịch vụ");
      setService(data.service);
      if (data.remembered && data.customer) {
        setCustomer(data.customer);
        setStep("returning");
      } else {
        setCustomer(null);
        setStep("identify");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải trang");
      setStep("error");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmUsage() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/checkin/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xác nhận thất bại");
      if (data.customer) setCustomer(data.customer);
      setEventAt(data.event?.createdAt || new Date().toISOString());
      setDuplicate(!!data.duplicate);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xác nhận thất bại");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onReturningConfirm() {
    const ok = await confirmUsage();
    if (ok) setStep("success");
  }

  async function identify(mode: "phone" | "last4") {
    setBusy(true);
    setError("");
    try {
      const body =
        mode === "last4"
          ? { mode: "last4", last4, fullName: fullName.trim() }
          : { mode: "phone", phone: phone.trim(), fullName: fullName.trim() };
      const res = await fetch("/api/checkin/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needFullPhone) {
          setRecoveryMode("phone");
          setStep("recovery");
        }
        throw new Error(data.error || "Không xác định được khách");
      }
      setCustomer(data.customer);
      setFromIdentify(true);

      // Record presence (including Mía Ơi) — drinks are ordered by staff on /desk
      const conf = await fetch("/api/checkin/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token }),
      });
      const confData = await conf.json();
      if (!conf.ok) throw new Error(confData.error || "Xác nhận thất bại");
      if (confData.customer) setCustomer(confData.customer);
      setEventAt(confData.event?.createdAt || new Date().toISOString());
      setDuplicate(!!confData.duplicate);
      setStep("remember");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi xác định");
    } finally {
      setBusy(false);
    }
  }

  async function onRemember(agree: boolean) {
    setBusy(true);
    setError("");
    try {
      if (agree) {
        const res = await fetch("/api/checkin/remember", {
          method: "POST",
          credentials: "same-origin",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Không lưu được thiết bị");
      }
      if (fromIdentify) {
        router.replace("/account");
        return;
      }
      setStep("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi ghi nhớ thiết bị");
    } finally {
      setBusy(false);
    }
  }

  async function onNotMe() {
    setBusy(true);
    setError("");
    try {
      await fetch("/api/checkin/forget", {
        method: "POST",
        credentials: "same-origin",
      });
      setCustomer(null);
      setPhone("");
      setFullName("");
      setLast4("");
      setStep("recovery");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  const serviceName = service?.name || token;
  const phoneOk = isValidPhone(phone);
  const nameOk = fullName.trim().length >= 2;
  const last4Ok = last4.replace(/\D/g, "").length === 4;

  if (step === "loading") {
    return (
      <Shell showNav={false}>
        <div className="flex min-h-[60dvh] items-center justify-center">
          <p className="text-sm text-oasis-mute">Đang nhận diện…</p>
        </div>
      </Shell>
    );
  }

  if (step === "error") {
    return (
      <Shell showNav={false}>
        <div className="animate-rise flex min-h-[60dvh] flex-col items-center justify-center text-center">
          <p className="text-sm text-oasis-coral">{error || "Có lỗi xảy ra"}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-6 h-12 rounded-2xl bg-oasis-deep px-6 font-semibold text-oasis-sand"
          >
            Thử lại
          </button>
        </div>
      </Shell>
    );
  }

  if (step === "success") {
    return (
      <Shell showNav={false}>
        <div className="animate-rise flex min-h-[70dvh] flex-col items-center justify-center text-center">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-oasis-moss text-3xl text-white shadow-soft">
            ✓
          </div>
          <h1 className="mt-6 font-display text-4xl font-semibold text-oasis-ink">
            Đã ghi nhận ✓
          </h1>
          <p className="mt-3 text-lg font-semibold text-oasis-moss">{serviceName}</p>
          {customer?.name ? (
            <p className="mt-2 font-display text-2xl font-semibold text-oasis-ink">
              {customer.name}
            </p>
          ) : null}
          <p className="mt-4 text-2xl font-mono font-bold text-oasis-ink">
            {eventAt ? formatTime(eventAt) : ""}
          </p>
          {duplicate ? (
            <p className="mt-3 text-sm text-oasis-coral">
              Bạn vừa ghi nhận dịch vụ này gần đây.
            </p>
          ) : null}
          <Link
            href="/home"
            className="mt-10 flex h-14 w-full max-w-sm items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand"
          >
            Xong
          </Link>
        </div>
      </Shell>
    );
  }

  if (step === "remember") {
    return (
      <Shell showNav={false}>
        <div className="animate-rise flex min-h-[70dvh] flex-col justify-end pb-6">
          <div className="rounded-[28px] bg-white/95 px-6 py-7 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-oasis-gold">
              HHG Oasis
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold text-oasis-ink">
              Lưu thông tin trên thiết bị này?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-oasis-mute">
              Cho phép HHG Oasis ghi nhớ bạn trên thiết bị này để những lần quét
              QR sau không cần nhập lại thông tin.
            </p>
            {error ? (
              <p className="mt-3 text-sm text-oasis-coral">{error}</p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void onRemember(true)}
              className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand disabled:opacity-40"
            >
              {busy ? "Đang lưu…" : "Đồng ý và ghi nhớ"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onRemember(false)}
              className="mt-3 flex h-12 w-full items-center justify-center text-sm font-semibold text-oasis-mute"
            >
              Không, lần sau hỏi lại
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (step === "returning" && customer) {
    return (
      <Shell showNav={false}>
        <div className="animate-rise flex min-h-[70dvh] flex-col justify-center space-y-6 py-4">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-oasis-gold">
              HHG Oasis
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-oasis-ink">
              Xin chào, {customer.name}
            </h1>
            <p className="mt-4 text-sm text-oasis-mute">Bạn sắp sử dụng:</p>
            <p className="mt-1 font-display text-2xl font-semibold text-oasis-moss">
              {serviceName}
            </p>
            <p className="mt-3 text-sm text-oasis-mute">Đã nhận diện bạn</p>
          </div>

          {error ? (
            <p className="rounded-2xl bg-white/80 px-4 py-3 text-center text-sm text-oasis-coral">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void onReturningConfirm()}
            className="flex h-16 w-full items-center justify-center rounded-[28px] bg-oasis-deep text-lg font-bold tracking-wide text-oasis-sand disabled:opacity-40"
          >
            {busy ? "Đang ghi nhận…" : "Xác nhận sử dụng"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onNotMe()}
            className="flex h-12 items-center justify-center text-sm font-semibold text-oasis-mute underline-offset-2 hover:underline"
          >
            Không phải bạn?
          </button>
        </div>
      </Shell>
    );
  }

  // recovery: returning user without cookie
  if (step === "recovery") {
    return (
      <Shell showNav={false}>
        <div className="animate-rise flex min-h-[70dvh] flex-col justify-center space-y-5 py-4">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-oasis-gold">
              HHG Oasis
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold text-oasis-ink">
              Bạn đã từng sử dụng HHG Oasis?
            </h1>
            <p className="mt-2 text-sm text-oasis-mute">{serviceName}</p>
          </div>

          <div className="flex gap-2 rounded-2xl bg-white/70 p-1">
            <button
              type="button"
              onClick={() => setRecoveryMode("phone")}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold ${
                recoveryMode === "phone"
                  ? "bg-oasis-deep text-oasis-sand"
                  : "text-oasis-mute"
              }`}
            >
              Nhập số điện thoại
            </button>
            <button
              type="button"
              onClick={() => setRecoveryMode("last4")}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold ${
                recoveryMode === "last4"
                  ? "bg-oasis-deep text-oasis-sand"
                  : "text-oasis-mute"
              }`}
            >
              Nhập 4 số cuối
            </button>
          </div>

          {recoveryMode === "phone" ? (
            <div className="space-y-4 rounded-[28px] bg-white/90 px-5 py-5 shadow-soft">
              <label className="block">
                <span className="text-sm font-semibold text-oasis-ink">
                  Số điện thoại
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="09xxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-2 block h-14 w-full rounded-2xl border border-oasis-line bg-oasis-sand px-4 text-center font-mono text-xl font-semibold outline-none focus:border-oasis-moss"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-oasis-ink">
                  Họ và tên
                </span>
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="VD: Nguyễn Văn A"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-2 block h-14 w-full rounded-2xl border border-oasis-line bg-oasis-sand px-4 text-center font-display text-xl font-semibold outline-none focus:border-oasis-moss"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-4 rounded-[28px] bg-white/90 px-5 py-5 shadow-soft">
              <label className="block">
                <span className="text-sm font-semibold text-oasis-ink">
                  4 số cuối điện thoại
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={last4}
                  onChange={(e) =>
                    setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  className="mt-2 block h-20 w-full rounded-2xl border border-oasis-line bg-oasis-sand px-4 text-center font-mono text-4xl font-black tracking-[0.3em] outline-none focus:border-oasis-moss"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-oasis-ink">
                  Họ và tên
                </span>
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="VD: Nguyễn Văn A"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-2 block h-14 w-full rounded-2xl border border-oasis-line bg-oasis-sand px-4 text-center font-display text-xl font-semibold outline-none focus:border-oasis-moss"
                />
              </label>
            </div>
          )}

          {error ? (
            <p className="rounded-2xl bg-white/80 px-4 py-3 text-center text-sm text-oasis-coral">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={
              busy ||
              !nameOk ||
              (recoveryMode === "phone" ? !phoneOk : !last4Ok)
            }
            onClick={() => void identify(recoveryMode)}
            className="flex h-16 w-full items-center justify-center rounded-[28px] bg-oasis-deep text-lg font-bold text-oasis-sand disabled:opacity-40"
          >
            {busy ? "Đang xử lý…" : "Tiếp tục"}
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setStep("identify");
            }}
            className="flex h-12 items-center justify-center text-sm font-semibold text-oasis-mute"
          >
            Khách mới — đăng ký lần đầu
          </button>
        </div>
      </Shell>
    );
  }

  // identify: first-time Name + Phone only
  return (
    <Shell showNav={false}>
      <div className="animate-rise flex min-h-[70dvh] flex-col justify-center space-y-5 py-4">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-oasis-gold">
            HHG Oasis
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-oasis-ink">
            {serviceName}
          </h1>
          <p className="mt-2 text-sm text-oasis-mute">
            Nhập thông tin để ghi nhận lần đầu
          </p>
        </div>

        <div className="space-y-4 rounded-[28px] bg-white/90 px-5 py-5 shadow-soft">
          <label className="block">
            <span className="text-sm font-semibold text-oasis-ink">
              Số điện thoại
            </span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="09xxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-2 block h-14 w-full rounded-2xl border border-oasis-line bg-oasis-sand px-4 text-center font-mono text-xl font-semibold outline-none focus:border-oasis-moss"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-oasis-ink">Họ và tên</span>
            <input
              type="text"
              autoComplete="name"
              placeholder="VD: Nguyễn Văn A"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-2 block h-14 w-full rounded-2xl border border-oasis-line bg-oasis-sand px-4 text-center font-display text-xl font-semibold outline-none focus:border-oasis-moss"
            />
          </label>
        </div>

        {error ? (
          <p className="rounded-2xl bg-white/80 px-4 py-3 text-center text-sm text-oasis-coral">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy || !phoneOk || !nameOk}
          onClick={() => void identify("phone")}
          className="flex h-16 w-full items-center justify-center rounded-[28px] bg-oasis-deep text-lg font-bold tracking-wide text-oasis-sand disabled:opacity-40"
        >
          {busy ? "Đang xử lý…" : "Tiếp tục"}
        </button>
        <button
          type="button"
          onClick={() => {
            setError("");
            setStep("recovery");
          }}
          className="flex h-12 items-center justify-center text-sm font-semibold text-oasis-mute"
        >
          Bạn đã từng sử dụng HHG Oasis?
        </button>
      </div>
    </Shell>
  );
}
