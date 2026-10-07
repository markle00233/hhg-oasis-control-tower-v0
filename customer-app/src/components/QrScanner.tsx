"use client";

import { useEffect, useId, useRef, useState } from "react";

type Props = {
  onCode: (raw: string) => void;
};

type ScannerHandle = {
  stop: () => Promise<void>;
  clear: () => void;
  isScanning?: boolean;
  applyVideoConstraints?: (c: MediaTrackConstraints) => Promise<void>;
  getRunningTrackSettings?: () => MediaTrackSettings;
};

/** Prefer native BarcodeDetector when available (much snappier on Android Chrome). */
async function tryNativeBarcodeLoop(
  video: HTMLVideoElement,
  onDecoded: (text: string) => void,
  signal: AbortSignal
) {
  const BD = (
    window as unknown as {
      BarcodeDetector?: new (opts: { formats: string[] }) => {
        detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
      };
    }
  ).BarcodeDetector;
  if (!BD) return false;

  let detector: {
    detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
  };
  try {
    detector = new BD({ formats: ["qr_code"] });
  } catch {
    return false;
  }

  const tick = async () => {
    if (signal.aborted) return;
    try {
      if (video.readyState >= 2) {
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) onDecoded(codes[0].rawValue);
      }
    } catch {
      /* frame miss */
    }
    if (!signal.aborted) {
      // ~30fps native loop
      window.setTimeout(() => void tick(), 33);
    }
  };
  void tick();
  return true;
}

export function QrScanner({ onCode }: Props) {
  const regionId = useId().replace(/:/g, "");
  const [status, setStatus] = useState("Đang mở camera…");
  const [error, setError] = useState("");
  const onCodeRef = useRef(onCode);
  const lastCodeRef = useRef("");
  const lastAtRef = useRef(0);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let scanner: ScannerHandle | null = null;
    let cancelled = false;
    let startPromise: Promise<void> | null = null;
    let nativeAbort: AbortController | null = null;
    let stream: MediaStream | null = null;

    function emit(decoded: string) {
      if (cancelled) return;
      const now = Date.now();
      // Short debounce only — long gaps made rescan feel “dead”
      if (decoded === lastCodeRef.current && now - lastAtRef.current < 900) {
        return;
      }
      lastCodeRef.current = decoded;
      lastAtRef.current = now;
      setStatus("Đã nhận QR…");
      onCodeRef.current(decoded);
    }

    async function safeStop() {
      nativeAbort?.abort();
      nativeAbort = null;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
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

    async function boostTrack(track: MediaStreamTrack) {
      try {
        const caps = track.getCapabilities?.() as
          | (MediaTrackCapabilities & {
              focusMode?: string[];
              zoom?: { min: number; max: number };
            })
          | undefined;
        const advanced: Record<string, unknown>[] = [];
        if (caps?.focusMode?.includes("continuous")) {
          advanced.push({ focusMode: "continuous" });
        }
        // Mild zoom-in helps small printed QRs when supported
        if (caps?.zoom && typeof caps.zoom.max === "number" && caps.zoom.max > 1) {
          const z = Math.min(caps.zoom.max, Math.max(caps.zoom.min || 1, 1.4));
          advanced.push({ zoom: z });
        }
        if (advanced.length) {
          await track.applyConstraints({ advanced: advanced as object[] });
        }
      } catch {
        /* device may reject advanced constraints */
      }
    }

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Trình duyệt không hỗ trợ camera.");
        }

        setStatus("Đang mở camera…");

        // High-res rear camera — closer to native Camera app sensitivity
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            // @ts-expect-error — widely supported but not in all TS libs
            focusMode: "continuous",
          },
        });
        if (cancelled) {
          await safeStop();
          return;
        }

        const track = stream.getVideoTracks()[0];
        if (track) await boostTrack(track);

        const host = document.getElementById(regionId);
        if (!host) throw new Error("Không tìm thấy khung camera.");

        // Prefer native BarcodeDetector (Android Chrome) — much more sensitive
        const video = document.createElement("video");
        video.setAttribute("playsinline", "true");
        video.muted = true;
        video.autoplay = true;
        video.srcObject = stream;
        video.className = "min-h-[360px] w-full object-cover";
        host.innerHTML = "";
        host.appendChild(video);
        await video.play().catch(() => undefined);

        nativeAbort = new AbortController();
        const usedNative = await tryNativeBarcodeLoop(
          video,
          emit,
          nativeAbort.signal
        );
        if (usedNative) {
          setStatus("Hướng camera vào mã QR — giữ ổn định");
          return;
        }

        // Fallback: html5-qrcode with aggressive settings
        host.innerHTML = "";
        stream.getTracks().forEach((t) => t.stop());
        stream = null;

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
          await safeStop();
          return;
        }
        const back =
          cameras.find((c) => /back|rear|environment|sau|world/i.test(c.label))
            ?.id ||
          cameras[cameras.length - 1]?.id ||
          { facingMode: "environment" };

        setStatus("Hướng camera vào mã QR — giữ ổn định");
        startPromise = inst.start(
          back,
          {
            fps: 30,
            // Large scan window — small qrbox was the main “not sensitive” cause
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const edge = Math.floor(
                Math.min(viewfinderWidth, viewfinderHeight) * 0.82
              );
              return { width: edge, height: edge };
            },
            aspectRatio: 1.333,
            disableFlip: false,
            videoConstraints: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          emit,
          () => undefined
        );
        await startPromise;

        // Try continuous focus after html5-qrcode owns the track
        try {
          const settings = inst.getRunningTrackSettings?.();
          const vid = host.querySelector("video") as HTMLVideoElement | null;
          const t = vid?.srcObject
            ? (vid.srcObject as MediaStream).getVideoTracks()[0]
            : null;
          if (t) await boostTrack(t);
          void settings;
        } catch {
          /* ignore */
        }

        if (cancelled) await safeStop();
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Không mở được camera. Dùng camera điện thoại mở link QR, hoặc dán URL bên dưới."
          );
          setStatus("");
        }
      }
    })();

    return () => {
      cancelled = true;
      void (async () => {
        try {
          await startPromise;
        } catch {
          /* ignore */
        }
        await safeStop();
      })();
    };
  }, [regionId]);

  return (
    <div className="space-y-3">
      {status && !error ? (
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-oasis-mute">
          {status}
        </p>
      ) : null}
      <div
        id={regionId}
        className="overflow-hidden rounded-[28px] bg-oasis-ink/90 [&_video]:min-h-[360px] [&_video]:w-full [&_video]:object-cover"
      />
      {error ? (
        <p className="text-sm text-oasis-coral">{error}</p>
      ) : (
        <p className="text-center text-xs text-oasis-mute">
          Tip: camera thường của máy nhạy hơn — có thể mở QR bằng Camera rồi vào
          link. Trong app đã tăng độ phân giải + vùng quét.
        </p>
      )}
    </div>
  );
}

/** Accept /s/TOKEN (preferred) and legacy /scan/CODE. */
export function extractServiceCode(raw: string): string | null {
  const text = raw.trim();
  const fromPath = (pathname: string) => {
    const s = pathname.match(/\/s\/([A-Za-z0-9_-]+)/i);
    if (s?.[1]) return s[1];
    const legacy = pathname.match(/\/scan\/([A-Za-z0-9_-]+)/i);
    if (legacy?.[1]) return legacy[1].toUpperCase();
    return null;
  };

  try {
    const url = new URL(text);
    const hit = fromPath(url.pathname);
    if (hit) return hit;
    const q = url.searchParams.get("service") || url.searchParams.get("token");
    if (q) return q;
  } catch {
    /* not a full URL */
  }

  const hit = fromPath(text);
  if (hit) return hit;
  if (/^[A-Z0-9_-]+$/i.test(text)) return text.toUpperCase();
  return null;
}
