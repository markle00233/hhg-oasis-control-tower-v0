"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { QrScanner, extractServiceCode } from "@/components/QrScanner";

export default function ScanPage() {
  const router = useRouter();
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);

  const handleRaw = useCallback(
    (raw: string) => {
      if (locked) return;
      const code = extractServiceCode(raw);
      if (!code) {
        setError("QR không phải điểm dịch vụ Oasis hợp lệ.");
        return;
      }
      setLocked(true);
      // Prefer /s/[token] (works for SAUNA and slug tokens)
      router.push(`/s/${encodeURIComponent(code)}`);
    },
    [locked, router]
  );

  return (
    <Shell>
      <div className="animate-rise space-y-5">
        <div>
          <h1 className="font-display text-3xl font-semibold text-oasis-ink">Quét QR</h1>
          <p className="mt-1 text-sm text-oasis-mute">
            Camera mở tự động — căn mã QR khu vực vào khung hình.
          </p>
        </div>

        <QrScanner onCode={handleRaw} />

        {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}

        <div className="rounded-3xl bg-white/80 p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wide text-oasis-mute">
            Hoặc dán nội dung QR
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="/s/SAUNA hoặc /scan/SAUNA"
              className="h-12 flex-1 rounded-2xl border border-oasis-line bg-oasis-sand px-3 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => handleRaw(manual)}
              className="h-12 rounded-2xl bg-oasis-deep px-4 text-sm font-bold text-oasis-sand"
            >
              Vào
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
