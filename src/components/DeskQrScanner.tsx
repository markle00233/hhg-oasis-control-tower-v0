"use client";

import { useEffect, useId, useRef, useState } from "react";

type Props = {
  onCode: (raw: string) => void;
  onClose?: () => void;
};

type ScannerHandle = {
  stop: () => Promise<void>;
  clear: () => void;
  isScanning?: boolean;
};

/**
 * Desk QR scanner — clean frame (no video-player chrome).
 * BarcodeDetector when available; else html5-qrcode (Safari / desktop).
 */
export function DeskQrScanner({ onCode, onClose }: Props) {
  const regionId = useId().replace(/:/g, "d");
  const [status, setStatus] = useState("Đang bật camera…");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const onCodeRef = useRef(onCode);
  const locked = useRef(false);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let nativeAbort: AbortController | null = null;
    let scanner: ScannerHandle | null = null;
    locked.current = false;

    function emit(raw: string) {
      if (cancelled || locked.current || !raw.trim()) return;
      locked.current = true;
      setStatus("Đã nhận mã…");
      onCodeRef.current(raw.trim());
    }

    async function stopAll() {
      nativeAbort?.abort();
      nativeAbort = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      const inst = scanner;
      scanner = null;
      if (!inst) return;
      try {
        if (inst.isScanning) await inst.stop();
      } catch {
        /* ignore */
      }
      try {
        inst.clear();
      } catch {
        /* ignore */
      }
    }

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Thiết bị không hỗ trợ camera.");
        }
        if (
          typeof window !== "undefined" &&
          !window.isSecureContext &&
          location.hostname !== "localhost"
        ) {
          throw new Error("Cần HTTPS để bật camera.");
        }

        setError("");
        setStatus("Đang bật camera…");

        const host = document.getElementById(regionId);
        if (!host) throw new Error("Không tìm thấy khung camera.");
        host.innerHTML = "";

        // Try native BarcodeDetector first (Chrome Android)
        const BD = (
          window as unknown as {
            BarcodeDetector?: new (opts: { formats: string[] }) => {
              detect: (
                source: ImageBitmapSource
              ) => Promise<{ rawValue: string }[]>;
            };
          }
        ).BarcodeDetector;

        if (BD) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
          if (cancelled) {
            await stopAll();
            return;
          }

          const video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.autoplay = true;
          video.setAttribute("playsinline", "true");
          video.setAttribute("webkit-playsinline", "true");
          video.disablePictureInPicture = true;
          video.controls = false;
          video.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");
          video.style.width = "100%";
          video.style.height = "100%";
          video.style.objectFit = "cover";
          video.style.display = "block";
          video.srcObject = stream;
          host.appendChild(video);
          await video.play().catch(() => undefined);

          const detector = new BD({ formats: ["qr_code"] });
          nativeAbort = new AbortController();
          setStatus("Đưa QR khách vào khung");

          const tick = async () => {
            if (cancelled || nativeAbort?.signal.aborted || locked.current) {
              return;
            }
            try {
              if (video.readyState >= 2) {
                const codes = await detector.detect(video);
                const raw = codes[0]?.rawValue;
                if (raw) {
                  emit(raw);
                  return;
                }
              }
            } catch {
              /* frame miss */
            }
            if (!cancelled && !nativeAbort?.signal.aborted) {
              window.setTimeout(() => void tick(), 40);
            }
          };
          void tick();
          return;
        }

        // Fallback: html5-qrcode (Safari macOS / iOS / desktop)
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        const inst = new Html5Qrcode(regionId) as unknown as ScannerHandle & {
          start: (
            cameraIdOrConfig: string | MediaTrackConstraints,
            config: object,
            onSuccess: (decoded: string) => void,
            onFailure: () => void
          ) => Promise<void>;
          isScanning: boolean;
        };
        scanner = inst;

        const cameras = await Html5Qrcode.getCameras();
        if (cancelled) {
          await stopAll();
          return;
        }
        if (!cameras.length) {
          throw new Error("Không tìm thấy camera.");
        }
        const back =
          cameras.find((c) =>
            /back|rear|environment|sau|world/i.test(c.label)
          )?.id ||
          cameras[cameras.length - 1]?.id ||
          { facingMode: "environment" };

        setStatus("Đưa QR khách vào khung");
        await inst.start(
          back,
          {
            fps: 16,
            qrbox: (w: number, h: number) => {
              const edge = Math.floor(Math.min(w, h) * 0.72);
              return { width: edge, height: edge };
            },
            aspectRatio: 1.333,
            disableFlip: false,
          },
          emit,
          () => undefined
        );

        // Strip any accidental media UI on injected <video>
        const vid = host.querySelector("video");
        if (vid) {
          vid.controls = false;
          vid.disablePictureInPicture = true;
          vid.setAttribute("playsinline", "true");
          vid.removeAttribute("controls");
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const lower = msg.toLowerCase();
        if (lower.includes("notallowed") || lower.includes("permission")) {
          setError(
            "Camera bị chặn. Cài đặt trang → Camera → Allow, rồi bấm Thử lại."
          );
        } else {
          setError(msg || "Không mở được camera.");
        }
        setStatus("");
      }
    })();

    return () => {
      cancelled = true;
      void (async () => {
        /* cleanup */
        try {
          const host = document.getElementById(regionId);
          if (host) host.innerHTML = "";
        } catch {
          /* ignore */
        }
      })();
      // sync stop
      nativeAbort?.abort();
      stream?.getTracks().forEach((t) => t.stop());
      const inst = scanner;
      if (inst) {
        void inst.stop().catch(() => undefined);
        try {
          inst.clear();
        } catch {
          /* ignore */
        }
      }
    };
  }, [regionId, retryKey]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 16,
          background: "#0b1220",
          aspectRatio: "4 / 3",
        }}
      >
        <div
          id={regionId}
          style={{
            width: "100%",
            height: "100%",
            minHeight: 220,
          }}
        />
        {/* Scan frame overlay — not media-player chrome */}
        <div
          aria-hidden
          style={{
            pointerEvents: "none",
            position: "absolute",
            inset: "18%",
            border: "2px solid rgba(163,230,53,.85)",
            borderRadius: 12,
            boxShadow: "0 0 0 999px rgba(11,18,32,.35)",
          }}
        />
      </div>

      {status && !error ? (
        <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>{status}</p>
      ) : null}
      {error ? (
        <div style={{ display: "grid", gap: 8 }}>
          <p style={{ color: "#b91c1c", fontSize: 13, margin: 0 }}>{error}</p>
          <button
            type="button"
            onClick={() => {
              setError("");
              setRetryKey((k) => k + 1);
            }}
            style={{
              height: 40,
              borderRadius: 12,
              border: "none",
              background: "#0f766e",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Thử lại camera
          </button>
        </div>
      ) : null}

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          style={{
            height: 44,
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            background: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Đóng
        </button>
      ) : null}
    </div>
  );
}
