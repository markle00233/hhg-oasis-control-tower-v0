"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import {
  DEFAULT_SERVICES,
  MEMBERSHIP_PACKAGES,
  getPackageNumberInGroup,
  type PackageGroup,
} from "@/config/crm.config";
import { Search } from "lucide-react";
import { FormEvent, useState, useTransition } from "react";

export function CustomerSearchBar() {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") || "");

  function pushParams(patch: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    start(() => router.push(`/customers?${params.toString()}`));
  }

  function onSearch(e?: FormEvent) {
    e?.preventDefault();
    pushParams({ q: q.trim() });
  }

  function clearFilters() {
    setQ("");
    start(() => router.push("/customers"));
  }

  const hasFilter = !!(
    sp.get("q") ||
    sp.get("area") ||
    sp.get("member") ||
    sp.get("plan") ||
    sp.get("type") ||
    sp.get("fCode") ||
    sp.get("fName") ||
    sp.get("fPhone") ||
    sp.get("fDob") ||
    sp.get("fNote") ||
    sp.get("fPersonality") ||
    sp.get("fRemain")
  );

  return (
    <form
      onSubmit={onSearch}
      className="flex flex-col gap-2 rounded-xl border border-border bg-white p-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nhập tên, SĐT, CUS-…, GĐ…"
            className="h-11 border border-[#94a3b8] bg-[#e2e8f0] pl-9 text-[15px] text-[#0f172a] placeholder:text-[#475569] focus:bg-white"
          />
        </div>
        <Button type="submit" disabled={pending} className="h-11 shrink-0 gap-2 sm:min-w-[140px]">
          <Search className="h-4 w-4" />
          {pending ? "Đang tìm…" : "Tìm kiếm"}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          value={sp.get("type") || ""}
          onChange={(e) => pushParams({ type: e.target.value })}
        >
          <option value="">Loại: tất cả</option>
          <option value="family">Chỉ gia đình (GĐ)</option>
          <option value="solo">Chỉ khách lẻ</option>
        </Select>
        <Select
          value={sp.get("area") || ""}
          onChange={(e) => pushParams({ area: e.target.value })}
        >
          <option value="">Khu: tất cả</option>
          {DEFAULT_SERVICES.map((s) => (
            <option key={s.code} value={s.code}>
              Chỉ {s.name}
            </option>
          ))}
        </Select>
        <Select
          value={sp.get("plan") || ""}
          onChange={(e) => pushParams({ plan: e.target.value })}
        >
          <option value="">Gói: tất cả</option>
          {MEMBERSHIP_PACKAGES.map((p) => (
            <option key={p.code} value={p.code}>
              {getPackageNumberInGroup(p.code, p.group as PackageGroup)}. {p.name}
            </option>
          ))}
        </Select>
        <Select
          value={sp.get("member") || ""}
          onChange={(e) => pushParams({ member: e.target.value })}
        >
          <option value="">Status: tất cả</option>
          <option value="yes">Còn hạn</option>
          <option value="no">Hết hạn / chưa có</option>
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted">
          Mỗi cột bảng bên dưới: sort (mũi tên) + ô lọc luôn hiện.
        </p>
        {hasFilter ? (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[11px] font-medium text-accent underline-offset-2 hover:underline"
          >
            Xóa tất cả lọc
          </button>
        ) : null}
      </div>
    </form>
  );
}
