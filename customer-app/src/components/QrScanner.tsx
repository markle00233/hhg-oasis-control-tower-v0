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

function friendlyCameraError(e: unknown): string {
  const name =
    e && typeof e === "object" && "name" in e
      ? String((e as { name?: string }).name)
      : "";
  const msg = e instanceof Error ? e.message : String(e || "");
  const lower = `${name} ${msg}`.toLowerCase();
  if (
    lower.includes("notallowed") ||
    lower.includes("permission") ||
    lower.includes("dismissed") ||
    lower.includes("denied")
  ) {
    return "Camera bị chặn. Vào Cài đặt trình duyệt → Quyền trang này → bật Camera, rồi bấm Thử lại.";
  }
  if (lower.includes("notfound") || lower.includes("devices not found")) {
    return "Không tìm thấy camera trên thiết bị.";
  }
  if (lower.includes("notreadable") || lower.includes("trackstart")) {
    return "Camera đang bị app khác dùng. Đóng Camera/Zoom rồi thử lại.";
  }
  return msg || "Không mở được camera.";
}

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
  const [retryKey, setRetryKey] = useState(0);
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
        if (caps?.zoom && typeof caps.zoom.max === "number" && caps.zoom.max > 1) {
          const z = Math.min(caps.zoom.max, Math.max(caps.zoom.min || 1, 1.4));
          advanced.push({ zoom: z });
        }
        if (advanced.length) {
          await track.applyConstraints({ advanced: advanced as object[] });
        }
      } catch {
        /* ignore */
      }
    }

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Trình duyệt không hỗ trợ camera.");
        }

        // Secure context required (HTTPS / localhost)
        if (
          typeof window !== "undefined" &&
          !window.isSecureContext &&
          location.hostname !== "localhost"
        ) {
          throw new Error("Cần mở bằng HTTPS để bật camera.");
        }

        setError("");
        setStatus("Đang mở camera…");

        // Auto-start rear camera — browser may ask once; after Allow it stays on
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

        const video = document.createElement("video");
        video.setAttribute("playsinline", "true");
        video.muted = true;
        video.autoplay = true;
        video.srcObject = stream;
        video.className = "min-h-[70dvh] w-full object-cover";
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
          setStatus("Đưa mã QR vào khung — camera đang quét");
          return;
        }

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

        setStatus("Đưa mã QR vào khung — camera đang quét");
        startPromise = inst.start(
          back,
          {
            fps: 30,
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

        try {
          const vid = host.querySelector("video") as HTMLVideoElement | null;
          const t = vid?.srcObject
            ? (vid.srcObject as MediaStream).getVideoTracks()[0]
            : null;
          if (t) await boostTrack(t);
        } catch {
          /* ignore */
        }

        if (cancelled) await safeStop();
      } catch (e) {
        if (!cancelled) {
          setError(friendlyCameraError(e));
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
  }, [regionId, retryKey]);

  return (
    <div className="space-y-3">
      {status && !error ? (
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-oasis-mute">
          {status}
        </p>
      ) : null}
      <div
        id={regionId}
        className="overflow-hidden rounded-[28px] bg-oasis-ink/90 [&_video]:min-h-[70dvh] [&_video]:w-full [&_video]:object-cover"
      />
      {error ? (
        <div className="space-y-3 rounded-2xl bg-white/90 p-4 shadow-soft">
          <p className="text-sm text-oasis-coral">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError("");
              setStatus("Đang mở camera…");
              setRetryKey((k) => k + 1);
            }}
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-oasis-deep text-sm font-bold text-oasis-sand"
          >
            Thử lại camera
          </button>
        </div>
      ) : null}
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
