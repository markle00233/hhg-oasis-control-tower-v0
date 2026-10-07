"use client";

import { Menu, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { NoticesBell } from "@/components/notices-bell";

export function TopHeader({
  userName,
  onMenuClick,
}: {
  userName: string;
  onMenuClick?: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    router.push(`/customers?q=${encodeURIComponent(query)}`);
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-[#ececef] bg-white/95 px-3 backdrop-blur sm:h-[72px] sm:gap-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#111827] hover:bg-[#f3f4f6] lg:hidden"
        aria-label="Mở menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <form onSubmit={onSubmit} className="relative mx-auto min-w-0 flex-1 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af] sm:left-3.5" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm tên hoặc SĐT…"
          className="h-10 w-full rounded-xl border-2 border-[#94a3b8] bg-white pl-9 pr-3 text-sm text-[#111827] outline-none transition placeholder:text-[#64748b] focus:border-[#111827] focus:bg-white sm:pl-10 sm:pr-16"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-[#e5e7eb] bg-white px-1.5 py-0.5 text-[10px] text-[#9ca3af] sm:inline">
          ⌘F
        </kbd>
      </form>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <NoticesBell />
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111827] text-xs font-semibold text-white">
          {userName.slice(0, 1).toUpperCase()}
        </div>
        <span className="hidden text-sm font-medium text-[#111827] md:inline">
          {userName.split(" ").slice(-1)[0]}
        </span>
      </div>
    </header>
  );
}
