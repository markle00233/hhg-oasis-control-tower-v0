"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Old temp-password screen — always send people to name + phone signup. */
export default function WelcomePage() {
  const router = useRouter();

  useEffect(() => {
    try {
      sessionStorage.removeItem("oasis_new_account");
    } catch {
      /* ignore */
    }
    router.replace("/login?mode=signup");
  }, [router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6">
      <p className="text-sm text-oasis-mute">Đang mở tạo tài khoản…</p>
    </main>
  );
}
