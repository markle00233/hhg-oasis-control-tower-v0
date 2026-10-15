"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { QrScanner, extractServiceCode } from "@/components/QrScanner";

export default function ScanPage() {
  const router = useRouter();
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
      router.push(`/s/${encodeURIComponent(code)}`);
    },
    [locked, router]
  );

  return (
    <Shell>
      <div className="animate-rise space-y-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-oasis-ink">
            Quét QR khu vực
          </h1>
          <p className="mt-1 text-sm text-oasis-mute">
            Camera tự bật (không hỏi lại nếu đã Allow). Đưa mã QR tại quầy /
            cổng khu vào khung — check-in như quy trình cũ, nhân viên sẽ thấy
            bạn trên máy khu vực.
          </p>
        </div>

        <QrScanner onCode={handleRaw} />

        {error ? <p className="text-sm text-oasis-coral">{error}</p> : null}

        <p className="rounded-[20px] bg-white/80 p-4 text-xs leading-relaxed text-oasis-mute shadow-soft">
          <strong className="text-oasis-ink">Lưu ý:</strong> Nút QR trên Home /
          Account là <em>My Oasis QR</em> (đưa nhân viên quét). Nút giữa thanh
          dưới là <em>bạn quét QR khu</em> khi tới chỗ nhân viên.
        </p>
      </div>
    </Shell>
  );
}
