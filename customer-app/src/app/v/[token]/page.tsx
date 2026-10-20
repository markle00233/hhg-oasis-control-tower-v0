"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";

type PassView = {
  token: string;
  offerTitle: string;
  zoneCode: string;
  status: string;
  scannedAt: string | null;
  scannedByName: string | null;
  customerName: string | null;
  customerCode: string;
  shortId: string | null;
};

export default function VoucherQrPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [pass, setPass] = useState<PassView | null>(null);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetch(`/api/voucher-pass/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        if (!cancelled) setError(data.error || "QR không hợp lệ");
        return;
      }
      if (!cancelled) setPass(data.pass);
    };
    void load();
    const id = window.setInterval(() => void load(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token]);

  const open = pass?.status === "OPEN";

  useEffect(() => {
    if (!open) {
      setQrDataUrl("");
      return;
    }
    let cancelled = false;
    (async () => {
      const QRCode = (await import("qrcode")).default;
      const payload = `${window.location.origin}/v/${encodeURIComponent(token)}`;
      const url = await QRCode.toDataURL(payload, {
        width: 280,
        margin: 2,
        color: { dark: "#0b1220", light: "#ffffff" },
      });
      if (!cancelled) setQrDataUrl(url);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  return (
    <Shell showNav={false}>
      <div className="animate-rise space-y-5 py-6">
        <p className="text-center text-xs font-bold uppercase tracking-[0.28em] text-oasis-mute">
          HHG Oasis · QR voucher
        </p>
        {error ? (
          <p className="text-center text-sm text-oasis-coral">{error}</p>
        ) : null}
        {!pass && !error ? (
          <p className="text-center text-sm text-oasis-mute">Đang tải…</p>
        ) : null}
        {pass ? (
          <>
            <div className="rounded-[28px] bg-oasis-ink p-5 text-oasis-sand shadow-soft">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-oasis-gold">
                {pass.zoneCode === "LONG_NUONG" ? "Lòng Nướng Chí Phèo" : "Oasis Spa"}
                {" · "}
                {pass.status === "SCANNED" ? "ĐÃ QUÉT" : "CHỜ QUÉT"}
              </p>
              <p className="mt-2 font-display text-2xl font-semibold">
                {pass.offerTitle}
              </p>
              <p className="mt-1 text-sm text-oasis-gold">
                {pass.customerName || "Khách"}
                {pass.customerCode ? ` · ${pass.customerCode}` : ""}
                {pass.shortId ? ` · ID ${pass.shortId}` : ""}
              </p>
            </div>
            {open ? (
              <div className="flex flex-col items-center rounded-[28px] bg-white p-4 shadow-soft">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="QR voucher"
                    className="h-[240px] w-[240px]"
                  />
                ) : (
                  <div className="grid h-[240px] w-[240px] place-items-center text-sm text-oasis-mute">
                    Đang tạo QR…
                  </div>
                )}
                <p className="mt-3 text-center text-xs font-semibold text-oasis-mute">
                  Nhân viên quét mã này để xác nhận voucher.
                </p>
              </div>
            ) : (
              <p className="rounded-[22px] bg-white p-4 text-center text-sm font-semibold text-oasis-moss shadow-soft">
                Voucher đã được quét
                {pass.scannedAt
                  ? ` lúc ${new Date(pass.scannedAt).toLocaleString("vi-VN")}`
                  : ""}
                {pass.scannedByName ? ` · ${pass.scannedByName}` : ""}. Đã gỡ
                khỏi ví.
              </p>
            )}
            <Link
              href="/account"
              className="flex h-12 items-center justify-center text-sm font-bold text-oasis-moss"
            >
              Trang cá nhân
            </Link>
          </>
        ) : null}
      </div>
    </Shell>
  );
}
