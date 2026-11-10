"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import {
  ATTENDANCE,
  ATTENDANCE_LABEL,
  TOURNAMENT_STATUS_LABEL,
  VOUCHER_CONDITIONS,
  type TournamentStatus,
} from "@/lib/tournament";

type Voucher = {
  status: string;
  title: string;
  amountVnd: number;
  passToken: string | null;
  zoneLabel: string | null;
};

type ScanPrompt =
  | { kind: "login" | "check-in" | "register" | "wait" | "present" | "cancelled" }
  | { kind: "note"; text: string };

function scanPrompt(event: EventView): ScanPrompt {
  const attendance = event.attendance || "";
  if (!event.loggedIn) return { kind: "login" };
  if (attendance === ATTENDANCE.PRESENT) return { kind: "present" };
  if (attendance === ATTENDANCE.CANCELLED) return { kind: "cancelled" };
  if (attendance === ATTENDANCE.NO_SHOW) {
    return { kind: "note", text: "Bạn không còn trong danh sách giải này." };
  }
  if (
    event.open &&
    (attendance === ATTENDANCE.REGISTERED || event.status === "UPCOMING")
  ) {
    return { kind: "check-in" };
  }
  if (event.status === "LIVE") {
    return { kind: "note", text: "Giải đang diễn ra, không đăng ký được." };
  }
  if (event.ended || event.status === "ENDED") {
    return { kind: "note", text: "Giải đã kết thúc." };
  }
  if (attendance === ATTENDANCE.REGISTERED) return { kind: "wait" };
  return { kind: "register" };
}

type EventView = {
  name: string;
  dayLabel: string;
  court: string | null;
  eventTime: string | null;
  summary: string | null;
  galleryUrl: string | null;
  resultsImage: string | null;
  discountVnd: number;
  status: TournamentStatus;
  rescheduleNote: string | null;
  open: boolean;
  ended: boolean;
  loggedIn: boolean;
  attendance: string | null;
  voucher: Voucher | null;
};

export default function TournamentScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [event, setEvent] = useState<EventView | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  async function load() {
    const res = await fetch(`/api/t/${encodeURIComponent(token)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Không thấy giải.");
    setEvent(data.event);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Không thấy giải.")
    );
    // load closes over the token from the route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const passToken = event?.voucher?.passToken || "";
  const voucherOpen = !!event?.open && event?.voucher?.status === "ISSUED";
  useEffect(() => {
    if (!passToken || !voucherOpen) {
      setQrDataUrl("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const QRCode = (await import("qrcode")).default;
      const payload = `${window.location.origin}/v/${encodeURIComponent(passToken)}`;
      const url = await QRCode.toDataURL(payload, { width: 280, margin: 1 });
      if (!cancelled) setQrDataUrl(url);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [passToken, voucherOpen]);

  async function act(intent: "register" | "check-in") {
    if (busy) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`/api/t/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      const data = await res.json();
      if (res.status === 401) {
        const next = `/t/${encodeURIComponent(token)}`;
        window.location.assign(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Không lưu được.");
      setEvent(data.event);
      setInfo(
        intent === "register"
          ? "Đã đăng ký. Trạng thái: Tham gia."
          : data.already
            ? "Bạn đã check-in."
            : "Đã check-in. Trạng thái: Có mặt."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được.");
    } finally {
      setBusy(false);
    }
  }

  const place = [event?.dayLabel, event?.court, event?.eventTime].filter(Boolean).join(" · ");
  const attendance = event?.attendance || "";
  const prompt = event ? scanPrompt(event) : null;
  const loginHref = `/login?next=${encodeURIComponent(`/t/${token}`)}`;

  return (
    <Shell>
      <div className="animate-rise space-y-5 py-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/home" className="text-sm font-bold text-oasis-ink">
            ← Trang chủ
          </Link>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-oasis-mute">
            Giải đấu
          </p>
        </div>
        {error ? (
          <div className="space-y-4 rounded-[28px] bg-white p-5 text-center shadow-soft">
            <p className="text-sm font-semibold text-oasis-coral">{error}</p>
            <Link
              href="/home"
              className="flex h-12 items-center justify-center rounded-2xl bg-oasis-ink text-sm font-bold text-white"
            >
              Về trang chủ
            </Link>
          </div>
        ) : null}
        {info ? <p className="text-center text-sm font-semibold text-green-800">{info}</p> : null}
        {!event && !error ? (
          <p className="text-center text-sm text-oasis-mute">Đang tải…</p>
        ) : null}
        {event ? (
          <>
            <div className="rounded-[28px] bg-oasis-ink p-5 text-oasis-sand shadow-soft">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-oasis-gold">
                {place || "Giải đấu"}
              </p>
              <h1 className="mt-2 font-display text-2xl font-semibold">{event.name}</h1>
              {event.summary ? <p className="mt-2 text-sm text-oasis-gold">{event.summary}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold">
                  {TOURNAMENT_STATUS_LABEL[event.status] || event.status}
                </span>
                {event.rescheduleNote ? (
                  <span className="text-sm font-semibold text-oasis-gold">
                    {event.rescheduleNote}
                  </span>
                ) : null}
              </div>
              {attendance ? (
                <p className="mt-3 text-sm font-bold">
                  {ATTENDANCE_LABEL[attendance as keyof typeof ATTENDANCE_LABEL] || attendance}
                </p>
              ) : null}
            </div>

            {event.galleryUrl ? (
              <a
                href={event.galleryUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-12 items-center justify-center rounded-2xl bg-white text-sm font-bold text-oasis-ink shadow-soft"
              >
                Xem ảnh giải
              </a>
            ) : null}
            {event.resultsImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.resultsImage}
                alt="Bảng kết quả"
                className="w-full rounded-[28px] bg-white shadow-soft"
              />
            ) : null}

            {prompt?.kind === "login" ? (
              <Link
                href={loginHref}
                className="flex h-12 items-center justify-center rounded-2xl bg-oasis-ink text-sm font-bold text-white"
              >
                {event.status === "UPCOMING" ? "Đăng nhập để tham gia" : "Đăng nhập"}
              </Link>
            ) : null}
            {prompt?.kind === "cancelled" ? (
              <p className="rounded-[22px] bg-white p-4 text-center text-sm font-semibold text-oasis-coral shadow-soft">
                Bạn đã hủy đăng ký giải này.
              </p>
            ) : null}
            {prompt?.kind === "note" ? (
              <p className="rounded-[22px] bg-white p-4 text-center text-sm text-oasis-mute shadow-soft">
                {prompt.text}
              </p>
            ) : null}
            {prompt?.kind === "wait" ? (
              <p className="rounded-[22px] bg-white p-4 text-center text-sm text-oasis-mute shadow-soft">
                Check-in mở trong ngày giải.
              </p>
            ) : null}
            {prompt?.kind === "check-in" || prompt?.kind === "register" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(prompt.kind === "check-in" ? "check-in" : "register")}
                className="h-12 w-full rounded-2xl bg-oasis-ink text-sm font-bold text-white"
              >
                {prompt.kind === "check-in" ? "Check-in" : "Tham gia"}
              </button>
            ) : null}

            {attendance === ATTENDANCE.PRESENT && !event.voucher && event.discountVnd <= 0 ? (
              <p className="rounded-[22px] bg-white p-4 text-center text-sm text-oasis-mute shadow-soft">
                Giải này không tặng voucher.
              </p>
            ) : null}
            {event.voucher ? (
              <section className="rounded-[28px] bg-white p-5 shadow-soft">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-oasis-mute">
                  {event.voucher.status === "REDEEMED" ? "Đã dùng" : "Voucher của bạn"}
                </p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-oasis-ink">
                  {event.voucher.title}
                </h2>
                {event.voucher.zoneLabel ? (
                  <p className="mt-1 text-sm text-oasis-mute">Dùng tại {event.voucher.zoneLabel}</p>
                ) : (
                  <ul className="mt-3 space-y-1 text-sm text-oasis-mute">
                    {VOUCHER_CONDITIONS.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                {event.voucher.status === "ISSUED" && event.open && qrDataUrl ? (
                  <div className="mt-4 flex flex-col items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="QR voucher" className="h-[220px] w-[220px]" />
                    <p className="mt-2 text-center text-xs font-semibold text-oasis-mute">
                      Đưa mã này cho nhân viên Mía Ơi, Olympic, Spa hoặc Lòng Nướng.
                    </p>
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </Shell>
  );
}
