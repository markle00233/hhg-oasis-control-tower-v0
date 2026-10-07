"use client";

import {
  MEMBERSHIP_PACKAGES,
  PACKAGE_GROUP_ORDER,
  PACKAGE_GROUP_THEME,
  getPackageNumberInGroup,
} from "@/config/crm.config";
import { cn } from "@/lib/utils";

/** Chọn nhiều gói — mỗi loại đánh số 1–4 (Bơi / Pick / VIP) */
export function PackageMultiSelect({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  function toggle(code: string) {
    onChange(
      selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted">
        Mỗi loại gói đánh số 1–4 · xanh = Bơi · cam = Pick · tím = VIP · chọn nhiều được
      </p>
      {PACKAGE_GROUP_ORDER.map((group, groupIdx) => {
        const theme = PACKAGE_GROUP_THEME[group];
        const packages = MEMBERSHIP_PACKAGES.filter((p) => p.group === group);
        return (
          <div key={group}>
            <p
              className="mb-2 text-xs font-semibold uppercase tracking-wide"
              style={{ color: theme.text }}
            >
              {["I", "II", "III"][groupIdx]}/ {theme.label}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {packages.map((pkg) => {
                const num = getPackageNumberInGroup(pkg.code, group);
                const checked = selected.includes(pkg.code);
                return (
                  <button
                    key={pkg.code}
                    type="button"
                    onClick={() => toggle(pkg.code)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
                      checked
                        ? "border-[#111827] bg-slate-50 ring-1 ring-[#111827]/15"
                        : "border-border bg-white hover:bg-slate-50"
                    )}
                  >
                    <span
                      className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border text-sm font-bold tabular-nums"
                      style={{
                        background: theme.bg,
                        color: theme.text,
                        borderColor: theme.border,
                      }}
                    >
                      {num}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[#111827]">
                        {pkg.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        {pkg.description} · {pkg.durationDays} ngày
                      </span>
                    </span>
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                        checked
                          ? "border-[#111827] bg-[#111827] text-white"
                          : "border-[#d1d5db] bg-white text-transparent"
                      )}
                      aria-hidden
                    >
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {selected.length > 0 && (
        <p className="text-xs text-muted">Đã chọn {selected.length} gói</p>
      )}
    </div>
  );
}

/** Hàng ngang: mặc định 30 ngày / Custom chọn ngày bắt đầu–kết thúc */
export function MembershipDateFields({
  dateMode,
  onDateModeChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  defaultDays = 30,
}: {
  dateMode: "default" | "custom";
  onDateModeChange: (mode: "default" | "custom") => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  defaultDays?: number;
}) {
  const autoExpiry = (() => {
    const d = new Date(startDate || new Date().toISOString().slice(0, 10));
    if (Number.isNaN(d.getTime())) return "—";
    d.setDate(d.getDate() + defaultDays);
    return d.toLocaleDateString("vi-VN");
  })();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onDateModeChange("default")}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
            dateMode === "default"
              ? "border-[#111827] bg-[#111827] text-white"
              : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-slate-50"
          )}
        >
          Mặc định {defaultDays} ngày
        </button>
        <button
          type="button"
          onClick={() => onDateModeChange("custom")}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
            dateMode === "custom"
              ? "border-[#111827] bg-[#111827] text-white"
              : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-slate-50"
          )}
        >
          Custom ngày
        </button>
      </div>

      <input type="hidden" name="dateMode" value={dateMode} />

      {dateMode === "default" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#374151]">Ngày bắt đầu</label>
            <input
              name="startDate"
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              required
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div className="flex items-end">
            <div className="w-full rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
              Kết thúc: <strong>{autoExpiry}</strong>
              <span className="ml-1 text-xs text-muted">(+{defaultDays} ngày)</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#374151]">Ngày bắt đầu</label>
            <input
              name="startDate"
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              required
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#374151]">Ngày kết thúc</label>
            <input
              name="endDate"
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              required
              min={startDate}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>
      )}
    </div>
  );
}
