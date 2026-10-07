"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function safeSessionSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export default function GatePage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/start", {
          method: "POST",
          cache: "no-store",
        });
        let data: {
          error?: string;
          created?: boolean;
          temporaryPassword?: string;
          customer?: {
            customerCode?: string;
            username?: string;
          };
        } = {};
        try {
          data = await res.json();
        } catch {
          throw new Error("Server returned an invalid response. Pull to refresh.");
        }
        if (!res.ok) throw new Error(data.error || "Could not open account");
        if (cancelled) return;

        if (data.created && data.temporaryPassword && data.customer?.customerCode) {
          const ok = safeSessionSet(
            "oasis_new_account",
            JSON.stringify({
              customerCode: data.customer.customerCode,
              username: data.customer.username || data.customer.customerCode,
              temporaryPassword: data.temporaryPassword,
            })
          );
          router.replace(ok ? "/welcome" : "/home");
          return;
        }
        router.replace("/home");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Startup failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-3xl font-semibold text-oasis-ink">HHG Oasis</p>
      <p className="mt-2 text-sm text-oasis-mute">Đang mở thẻ khách…</p>
      {error ? (
        <div className="mt-8 w-full rounded-2xl bg-white/80 p-4 text-left shadow-soft">
          <p className="text-sm text-oasis-coral">{error}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-sm font-semibold text-oasis-moss underline"
            >
              Thử lại
            </button>
            <a href="/login" className="text-sm font-semibold text-oasis-moss underline">
              Đăng nhập
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-8 h-10 w-10 animate-pulse rounded-full bg-oasis-moss/30" />
      )}
    </main>
  );
}
