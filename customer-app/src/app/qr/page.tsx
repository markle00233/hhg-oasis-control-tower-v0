"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";

export default function MyOasisQrPage() {
  const router = useRouter();
  const [payload, setPayload] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [dataUrl, setDataUrl] = useState("");
  const [error, setError] = useState("");
  const [vip, setVip] = useState(false);
  const [vipPlan, setVipPlan] = useState<string | null>(null);
  const [vipExp, setVipExp] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/me/qr", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        if (!cancelled) setError(data.error || "Không tải được QR");
        return;
      }
      if (cancelled) return;
      setPayload(data.payload);
      setName(data.customer?.fullName || "Khách Oasis");
      setCode(data.customer?.customerCode || "");
      setVip(!!data.vip);
      setVipPlan(data.customer?.vipPlanLabel || null);
      setVipExp(data.customer?.vipExpiresLabel || null);
      try {
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(data.payload, {
          width: 320,
          margin: 2,
          color: data.vip
            ? { dark: "#3b0764", light: "#fef3c7" }
            : { dark: "#0b1220", light: "#ffffff" },
        });
        if (!cancelled) setDataUrl(url);
      } catch {
        if (!cancelled) setError("Không render được QR");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <Shell showNav={false}>
      <div
        className={`-mx-4 -mt-6 flex min-h-[100dvh] flex-col px-5 pb-10 pt-6 text-white ${
          vip
            ? "bg-gradient-to-b from-[#2e1065] via-[#4c1d95] to-[#0f0a1a]"
            : "bg-[#0b1220]"
        }`}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-lg"
          >
            ←
          </button>
          <Link
            href="/home"
            className="text-xs font-bold uppercase tracking-[0.2em] text-white/50"
          >
            Home
          </Link>
        </div>

        <div className="mt-10 flex flex-1 flex-col items-center text-center">
          <p
            className={`text-xs font-bold uppercase tracking-[0.35em] ${
              vip ? "text-amber-300" : "text-lime-300/90"
            }`}
          >
            {vip ? "HHG Oasis · VIP" : "HHG Oasis"}
          </p>
          <h1 className="mt-3 font-display text-3xl font-black tracking-wide">
            {vip ? "VIP QR" : "MÃ QR CỦA TÔI"}
          </h1>
          <p className="mt-2 max-w-xs text-sm text-white/60">
            {vip
              ? "Thẻ VIP còn hạn — đưa mã này cho nhân viên khi nhận dịch vụ."
              : "Đưa mã này cho nhân viên khi làm thủ tục nhận dịch vụ."}
          </p>

          <div
            className={`mt-8 rounded-[28px] p-5 shadow-soft ${
              vip
                ? "bg-gradient-to-br from-amber-200 to-amber-50 ring-2 ring-amber-300/80"
                : "bg-white"
            }`}
          >
            {vip ? (
              <p className="mb-3 text-center text-[10px] font-black tracking-[0.25em] text-[#3b0764]">
                VIP · CÒN HẠN
              </p>
            ) : null}
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dataUrl}
                alt="My Oasis QR"
                className="h-[260px] w-[260px]"
              />
            ) : (
              <div className="grid h-[260px] w-[260px] place-items-center text-sm text-slate-400">
                {error || "Đang tạo QR…"}
              </div>
            )}
          </div>

          <p className="mt-6 font-display text-2xl font-semibold">{name}</p>
          <p
            className={`mt-1 font-mono text-sm font-bold tracking-wider ${
              vip ? "text-amber-300" : "text-lime-300/90"
            }`}
          >
            {code}
          </p>
          {vip ? (
            <p className="mt-3 max-w-sm text-sm text-violet-100/90">
              {vipPlan || "Gói VIP"}
              {vipExp ? ` · đến ${vipExp}` : ""}
            </p>
          ) : null}
          <p className="mt-6 max-w-sm text-xs leading-relaxed text-white/45">
            QR định danh khách — không lộ SĐT. Nhân viên quét tại quầy khu để
            khớp booking hoặc nhận walk-in.
          </p>
          {payload ? (
            <p className="mt-3 break-all font-mono text-[10px] text-white/25">
              {payload.replace(/^https?:\/\//, "")}
            </p>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}
