"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import {
  MEMBERSHIP_PACKAGES,
  getPackageNumberInGroup,
  type PackageGroup,
} from "@/config/crm.config";
import { cn } from "@/lib/utils";
import type { CustomerSortKey } from "@/components/customer-sort-th";

const DEFAULT_DIR: Record<CustomerSortKey, "asc" | "desc"> = {
  code: "asc",
  name: "asc",
  phone: "asc",
  dob: "asc",
  goi: "asc",
  membership: "asc",
  remaining: "asc",
  note: "asc",
  personality: "asc",
  status: "asc",
  createdAt: "desc",
};

type ColDef =
  | {
      kind: "text";
      label: string;
      sortKey: CustomerSortKey;
      param: string;
      placeholder: string;
    }
  | {
      kind: "select";
      label: string;
      sortKey: CustomerSortKey;
      param: string;
      options: { value: string; label: string }[];
    };

const COLS: ColDef[] = [
  {
    kind: "text",
    label: "Customer ID",
    sortKey: "code",
    param: "fCode",
    placeholder: "Lọc mã…",
  },
  {
    kind: "text",
    label: "Họ tên",
    sortKey: "name",
    param: "fName",
    placeholder: "Lọc tên…",
  },
  {
    kind: "text",
    label: "Phone",
    sortKey: "phone",
    param: "fPhone",
    placeholder: "Lọc SĐT…",
  },
  {
    kind: "text",
    label: "Ngày sinh",
    sortKey: "dob",
    param: "fDob",
    placeholder: "Lọc ngày sinh…",
  },
  {
    kind: "select",
    label: "Gói",
    sortKey: "goi",
    param: "plan",
    options: [
      { value: "", label: "Tất cả gói" },
      ...MEMBERSHIP_PACKAGES.map((p) => ({
        value: p.code,
        label: `${getPackageNumberInGroup(p.code, p.group as PackageGroup)}. ${p.name}`,
      })),
    ],
  },
  {
    kind: "select",
    label: "Membership",
    sortKey: "membership",
    param: "type",
    options: [
      { value: "", label: "Tất cả loại" },
      { value: "solo", label: "Cá nhân" },
      { value: "family", label: "Gia đình" },
    ],
  },
  {
    kind: "select",
    label: "Thời gian còn lại",
    sortKey: "remaining",
    param: "fRemain",
    options: [
      { value: "", label: "Tất cả" },
      { value: "ok", label: "Còn > 7 ngày" },
      { value: "soon", label: "Sắp hết (≤7 ngày)" },
      { value: "expired", label: "Hết hạn / chưa gói" },
    ],
  },
  {
    kind: "text",
    label: "Note",
    sortKey: "note",
    param: "fNote",
    placeholder: "Lọc note…",
  },
  {
    kind: "text",
    label: "Tính cách",
    sortKey: "personality",
    param: "fPersonality",
    placeholder: "Lọc tính cách…",
  },
  {
    kind: "select",
    label: "Status",
    sortKey: "status",
    param: "member",
    options: [
      { value: "", label: "Tất cả status" },
      { value: "yes", label: "Còn hạn" },
      { value: "no", label: "Hết hạn / chưa có" },
    ],
  },
];

/** Ô filter luôn hiện — nền xám + icon, không để trống trắng */
function VisibleFilterInput({
  value,
  onChange,
  onCommit,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  placeholder: string;
}) {
  return (
    <div className="relative mt-1.5">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748b]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          }
        }}
        placeholder={placeholder}
        className="h-9 w-full min-w-[110px] rounded-md border border-[#94a3b8] bg-[#e2e8f0] py-1.5 pl-7 pr-2 text-[12px] font-normal normal-case tracking-normal text-[#0f172a] outline-none placeholder:text-[#475569] focus:border-[#111827] focus:bg-white focus:ring-2 focus:ring-[#111827]/15"
      />
    </div>
  );
}

function VisibleFilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative mt-1.5">
      <Search className="pointer-events-none absolute left-2 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-[#64748b]" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-[110px] appearance-none rounded-md border border-[#94a3b8] bg-[#e2e8f0] py-1.5 pl-7 pr-6 text-[12px] font-normal normal-case tracking-normal text-[#0f172a] outline-none focus:border-[#111827] focus:bg-white focus:ring-2 focus:ring-[#111827]/15"
      >
        {options.map((o) => (
          <option key={o.value || "__all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Header cột xếp dọc: Sort (tên + mũi tên) → ô Filter luôn hiện.
 */
export function CustomersTableHead({
  currentSort,
  currentDir,
  searchParams,
}: {
  currentSort: string;
  currentDir: "asc" | "desc";
  searchParams: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const c of COLS) {
      if (c.kind === "text") init[c.param] = sp.get(c.param) || "";
    }
    return init;
  });

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const c of COLS) {
      if (c.kind === "text") next[c.param] = sp.get(c.param) || "";
    }
    setDraft(next);
  }, [sp]);

  function push(patch: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      const t = v.trim();
      if (t) params.set(k, t);
      else params.delete(k);
    }
    params.delete("page");
    start(() => router.push(`/customers?${params.toString()}`));
  }

  function setText(param: string, value: string) {
    setDraft((d) => ({ ...d, [param]: value }));
    clearTimeout(timers.current[param]);
    timers.current[param] = setTimeout(() => {
      const current = (sp.get(param) || "").trim();
      if (current === value.trim()) return;
      push({ [param]: value });
    }, 350);
  }

  function commitText(param: string) {
    clearTimeout(timers.current[param]);
    const current = (sp.get(param) || "").trim();
    const next = (draft[param] || "").trim();
    if (current === next) return;
    push({ [param]: draft[param] || "" });
  }

  function sortHref(sortKey: CustomerSortKey) {
    const active = currentSort === sortKey;
    const nextDir = active
      ? currentDir === "asc"
        ? "desc"
        : "asc"
      : DEFAULT_DIR[sortKey];
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v != null && v !== "" && k !== "page") params.set(k, v);
    }
    params.set("sort", sortKey);
    params.set("dir", nextDir);
    return `/customers?${params.toString()}`;
  }

  return (
    <tr className={cn("border-b border-border bg-[#1e293b] text-white", pending && "opacity-90")}>
      {COLS.map((col) => {
        const active = currentSort === col.sortKey;
        return (
          <th
            key={col.sortKey}
            className="min-w-[130px] px-2 py-2.5 align-top font-medium"
          >
            <Link
              href={sortHref(col.sortKey)}
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition hover:text-white",
                active ? "text-white" : "text-slate-300"
              )}
              title="Bấm để sắp xếp cột này"
            >
              {col.label}
              {active ? (
                currentDir === "asc" ? (
                  <ArrowUp className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5" />
                )
              ) : (
                <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
              )}
            </Link>

            {col.kind === "text" ? (
              <VisibleFilterInput
                value={draft[col.param] || ""}
                onChange={(v) => setText(col.param, v)}
                onCommit={() => commitText(col.param)}
                placeholder={col.placeholder}
              />
            ) : (
              <VisibleFilterSelect
                value={sp.get(col.param) || ""}
                onChange={(v) => push({ [col.param]: v })}
                options={col.options}
              />
            )}
          </th>
        );
      })}
    </tr>
  );
}
