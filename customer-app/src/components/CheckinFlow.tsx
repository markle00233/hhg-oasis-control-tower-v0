"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
  const [step, setStep] = useState<Step>("loading");
  const [service, setService] = useState<ServiceInfo | null>(null);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [last4, setLast4] = useState("");
  const [recoveryMode, setRecoveryMode] = useState<"phone" | "last4">("phone");
  /** phone → lookup → name (mới) | confirm (đã có) */
  const [idPhase, setIdPhase] = useState<"phone" | "name" | "confirm">("phone");
  const [maskedLabel, setMaskedLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [eventAt, setEventAt] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [maskedName, setMaskedName] = useState("");

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
      // Device cookie HOẶC login session → hỏi xác nhận, không bắt password
      if (data.customer && (data.remembered || data.fromSession)) {
        setCustomer(data.customer);
        setMaskedName(data.maskedName || data.customer.name || "Khách");
        setStep("returning");
      } else {
        setCustomer(null);
        setMaskedName("");
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
      // Đồng bộ device cookie = đúng người vừa check-in (xoá cookie người cũ)
      await fetch("/api/checkin/remember", {
        method: "POST",
        credentials: "same-origin",
      }).catch(() => undefined);
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

  /** Identify → create check-in (SERVICE_USE) → save device → success. */
  async function finishIdentify(body: Record<string, unknown>) {
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
        setIdPhase("phone");
      }
      throw new Error(data.error || "Không xác định được khách");
    }
    setCustomer(data.customer);

    const conf = await fetch("/api/checkin/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token }),
    });
    const confData = await conf.json();
    if (!conf.ok) throw new Error(confData.error || "Check-in thất bại");
    if (confData.customer) setCustomer(confData.customer);
    setEventAt(confData.event?.createdAt || new Date().toISOString());
    setDuplicate(!!confData.duplicate);

    // TARGET Case 2: luôn lưu device cookie sau identify (không hỏi thêm)
    await fetch("/api/checkin/remember", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => undefined);

    setStep("success");
  }

  async function lookupPhoneThenContinue() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/checkin/lookup-phone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tra được SĐT");
      if (data.exists) {
        setMaskedLabel(data.maskedLabel || "");
        setIdPhase("confirm");
      } else {
        setMaskedLabel("");
        setIdPhase("name");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tra SĐT");
    } finally {
      setBusy(false);
    }
  }

  async function identify(mode: "phone" | "last4" | "confirm") {
    setBusy(true);
    setError("");
    try {
      if (mode === "confirm") {
        await finishIdentify({
          mode: "phone",
          phone: phone.trim(),
          confirmExisting: true,
        });
        return;
      }
      const body =
        mode === "last4"
          ? { mode: "last4", last4, fullName: fullName.trim() }
          : {
              mode: "phone",
              phone: phone.trim(),
              fullName: fullName.trim(),
            };
      await finishIdentify(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi xác định");
    } finally {
      setBusy(false);
    }
  }

  function resetPhoneEntry() {
    setPhone("");
    setFullName("");
    setMaskedLabel("");
    setIdPhase("phone");
    setError("");
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
      setMaskedName("");
      setPhone("");
      setFullName("");
      setLast4("");
      setIdPhase("phone");
      setStep("identify");
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
            Check-in thành công
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
            <p className="mt-3 text-sm text-oasis-mute">
              Bạn vừa check-in khu này gần đây — không tạo thêm lần mới.
            </p>
          ) : (
            <p className="mt-3 text-sm text-oasis-mute">
              Nhân viên đã thấy bạn trên quầy. Order do NV xử lý.
            </p>
          )}
          <Link
            href="/home"
            className="mt-10 flex h-14 w-full max-w-sm items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand"
          >
            Quay về home dashboard
          </Link>
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
            <p className="mt-3 text-sm text-oasis-mute">Check-in tại</p>
            <p className="mt-1 font-display text-2xl font-semibold text-oasis-moss">
              {serviceName}
            </p>
            <h1 className="mt-6 font-display text-2xl font-semibold leading-snug text-oasis-ink">
              Bạn có phải{" "}
              <span className="text-oasis-moss">
                {maskedName || customer.name}
              </span>{" "}
              không?
            </h1>
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
            {busy ? "Đang check-in…" : "Đúng · Check-in"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onNotMe()}
            className="flex h-12 items-center justify-center text-sm font-semibold text-oasis-mute underline-offset-2 hover:underline"
          >
            Không phải tôi
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
              {idPhase !== "confirm" ? (
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
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (idPhase !== "phone") setIdPhase("phone");
                    }}
                    className="mt-2 block h-14 w-full rounded-2xl border border-oasis-line bg-oasis-sand px-4 text-center font-mono text-xl font-semibold outline-none focus:border-oasis-moss"
                  />
                </label>
              ) : null}
              {idPhase === "confirm" ? (
                <div className="space-y-3">
                  <p className="text-center text-sm text-oasis-mute">
                    Đây có phải bạn?
                  </p>
                  <div className="flex items-center gap-3 rounded-2xl border border-oasis-line bg-white px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-oasis-sand text-sm font-black text-oasis-moss">
                      G
                    </span>
                    <p className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-oasis-ink">
                      {maskedLabel}
                    </p>
                  </div>
                </div>
              ) : null}
              {idPhase === "name" ? (
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
              ) : null}
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

          {recoveryMode === "phone" && idPhase === "phone" ? (
            <button
              type="button"
              disabled={busy || !phoneOk}
              onClick={() => void lookupPhoneThenContinue()}
              className="flex h-16 w-full items-center justify-center rounded-[28px] bg-oasis-deep text-lg font-bold text-oasis-sand disabled:opacity-40"
            >
              {busy ? "Đang tra…" : "Tiếp tục"}
            </button>
          ) : null}
          {recoveryMode === "phone" && idPhase === "name" ? (
            <button
              type="button"
              disabled={busy || !nameOk}
              onClick={() => void identify("phone")}
              className="flex h-16 w-full items-center justify-center rounded-[28px] bg-oasis-deep text-lg font-bold text-oasis-sand disabled:opacity-40"
            >
              {busy ? "Đang check-in…" : "Check-in"}
            </button>
          ) : null}
          {recoveryMode === "phone" && idPhase === "confirm" ? (
            <div className="space-y-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void identify("confirm")}
                className="flex h-16 w-full items-center justify-center rounded-[28px] bg-oasis-deep text-lg font-bold text-oasis-sand disabled:opacity-40"
              >
                {busy ? "Đang check-in…" : "Đúng · Check-in"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={resetPhoneEntry}
                className="flex h-12 w-full items-center justify-center text-sm font-semibold text-oasis-mute"
              >
                Không phải tôi
              </button>
            </div>
          ) : null}
          {recoveryMode === "last4" ? (
            <button
              type="button"
              disabled={busy || !nameOk || !last4Ok}
              onClick={() => void identify("last4")}
              className="flex h-16 w-full items-center justify-center rounded-[28px] bg-oasis-deep text-lg font-bold text-oasis-sand disabled:opacity-40"
            >
              {busy ? "Đang xử lý…" : "Tiếp tục"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setError("");
              resetPhoneEntry();
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

  // identify: SĐT trước → mới lưu tên / cũ xác nhận tên che
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
            {idPhase === "confirm"
              ? "Xác nhận đúng tài khoản của bạn"
              : idPhase === "name"
                ? "Tài khoản mới — nhập họ tên để lưu"
                : "Nhập số điện thoại để ghi nhận"}
          </p>
        </div>

        <div className="space-y-4 rounded-[28px] bg-white/90 px-5 py-5 shadow-soft">
          {idPhase === "phone" || idPhase === "name" ? (
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
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (idPhase === "name") setIdPhase("phone");
                }}
                disabled={idPhase === "name"}
                className="mt-2 block h-14 w-full rounded-2xl border border-oasis-line bg-oasis-sand px-4 text-center font-mono text-xl font-semibold outline-none focus:border-oasis-moss disabled:opacity-70"
              />
            </label>
          ) : null}

          {idPhase === "confirm" ? (
            <div className="space-y-3">
              <p className="text-center text-sm font-semibold text-oasis-ink">
                Đây có phải bạn?
              </p>
              <div className="flex items-center gap-3 rounded-2xl border border-oasis-line bg-white px-4 py-3 shadow-sm">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#4285F4]/10 text-sm font-black text-[#4285F4]">
                  G
                </span>
                <p className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-oasis-ink">
                  {maskedLabel}
                </p>
              </div>
            </div>
          ) : null}

          {idPhase === "name" ? (
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
          ) : null}
        </div>

        {error ? (
          <p className="rounded-2xl bg-white/80 px-4 py-3 text-center text-sm text-oasis-coral">
            {error}
          </p>
        ) : null}

        {idPhase === "phone" ? (
          <button
            type="button"
            disabled={busy || !phoneOk}
            onClick={() => void lookupPhoneThenContinue()}
            className="flex h-16 w-full items-center justify-center rounded-[28px] bg-oasis-deep text-lg font-bold tracking-wide text-oasis-sand disabled:opacity-40"
          >
            {busy ? "Đang tra…" : "Tiếp tục"}
          </button>
        ) : null}
        {idPhase === "name" ? (
          <button
            type="button"
            disabled={busy || !nameOk}
            onClick={() => void identify("phone")}
            className="flex h-16 w-full items-center justify-center rounded-[28px] bg-oasis-deep text-lg font-bold tracking-wide text-oasis-sand disabled:opacity-40"
          >
            {busy ? "Đang check-in…" : "Check-in"}
          </button>
        ) : null}
        {idPhase === "confirm" ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void identify("confirm")}
              className="flex h-16 w-full items-center justify-center rounded-[28px] bg-oasis-deep text-lg font-bold tracking-wide text-oasis-sand disabled:opacity-40"
            >
              {busy ? "Đang check-in…" : "Đúng · Check-in"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={resetPhoneEntry}
              className="flex h-12 w-full items-center justify-center text-sm font-semibold text-oasis-mute"
            >
              Không phải tôi
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setError("");
            resetPhoneEntry();
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
