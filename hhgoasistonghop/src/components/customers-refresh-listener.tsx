"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Lắng nghe job lưu ngầm xong → refresh danh sách khách */
export function CustomersRefreshListener() {
  const router = useRouter();
  useEffect(() => {
    function onRefresh() {
      router.refresh();
    }
    window.addEventListener("hhgo:customers-refresh", onRefresh);
    return () => window.removeEventListener("hhgo:customers-refresh", onRefresh);
  }, [router]);
  return null;
}
