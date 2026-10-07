"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type Service = {
  serviceCode: string;
  serviceName: string;
  scanUrl: string;
};

export default function DevQrPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/services");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        if (cancelled) return;
        const list: Service[] = data.services || [];
        setServices(list);

        const QRCode = (await import("qrcode")).default;
        const map: Record<string, string> = {};
        for (const s of list) {
          map[s.serviceCode] = await QRCode.toDataURL(s.scanUrl, {
            margin: 1,
            width: 240,
            color: { dark: "#0C1F1A", light: "#FFFFFF" },
          });
        }
        if (!cancelled) setQrs(map);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-dvh px-4 py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-oasis-gold">
          HHG Oasis · Zones
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-oasis-ink">
          Zone QR codes
        </h1>
        <p className="mt-2 text-sm text-oasis-mute">
          Scroll ngang — tên phân khu nằm trên mỗi mã QR.
        </p>
      </div>

      {error ? <p className="mb-4 text-oasis-coral">{error}</p> : null}

      <div className="-mx-4 overflow-x-auto px-4 pb-6">
        <div className="flex w-max flex-row items-start gap-4">
          {services.map((s) => (
            <article
              key={s.serviceCode}
              className="w-[200px] shrink-0 rounded-[24px] bg-white/95 p-4 text-center shadow-soft"
            >
              <h2 className="font-display text-lg font-semibold leading-tight text-oasis-ink">
                {s.serviceName}
              </h2>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-oasis-mute">
                {s.serviceCode.replaceAll("_", " ")}
              </p>
              <div className="mx-auto mt-3 grid place-items-center rounded-2xl bg-oasis-sand p-2">
                {qrs[s.serviceCode] ? (
                  <Image
                    src={qrs[s.serviceCode]!}
                    alt={`QR ${s.serviceName}`}
                    width={168}
                    height={168}
                    unoptimized
                  />
                ) : (
                  <div className="h-[168px] w-[168px] animate-pulse rounded-xl bg-oasis-line/50" />
                )}
              </div>
              <a
                href={`/qr/${s.serviceCode}.png`}
                download={`${s.serviceCode}.png`}
                className="mt-3 inline-block text-[11px] font-semibold text-oasis-moss underline"
              >
                Download
              </a>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
