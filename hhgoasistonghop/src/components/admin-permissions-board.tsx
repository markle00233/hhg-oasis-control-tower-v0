"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, PageHeader } from "@/components/ui";
import { CRM_FEATURES, type FeatureCode } from "@/config/features";
import { saveUserFeatureFlags } from "@/app/actions";
import { cn } from "@/lib/utils";

type AccountRow = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  department: string;
  flags: Record<FeatureCode, boolean>;
};

export function AdminPermissionsBoard({ accounts }: { accounts: AccountRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(accounts[0]?.id || "");
  const selected = useMemo(
    () => accounts.find((a) => a.id === selectedId) || null,
    [accounts, selectedId]
  );
  const [draft, setDraft] = useState<Record<FeatureCode, boolean> | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  const flags = draft || selected?.flags || null;

  function onSelect(id: string) {
    setSelectedId(id);
    setDraft(null);
    setMsg("");
  }

  function toggle(code: FeatureCode) {
    if (!selected) return;
    const base = draft || selected.flags;
    setDraft({ ...base, [code]: !base[code] });
    setMsg("");
  }

  function onSave() {
    if (!selected || !flags) return;
    const fd = new FormData();
    fd.set("userId", selected.id);
    for (const f of CRM_FEATURES) {
      fd.set(`feat_${f.code}`, flags[f.code] ? "1" : "0");
    }
    start(async () => {
      const res = await saveUserFeatureFlags(fd);
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      setMsg("Đã lưu quyền. Menu của acc đó cập nhật khi tải lại trang.");
      setDraft(null);
      router.refresh();
    });
  }

  const groups = Array.from(new Set(CRM_FEATURES.map((f) => f.group)));

  return (
    <div>
      <PageHeader
        title="Administration"
        description="Chọn tài khoản → tick chức năng được phép dùng"
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Tài khoản
          </div>
          <ul className="divide-y">
            {accounts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onSelect(a.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left text-sm transition hover:bg-slate-50",
                    selectedId === a.id && "bg-slate-100"
                  )}
                >
                  <span className="font-medium text-[#111827]">{a.fullName}</span>
                  <span className="text-[11px] text-muted">
                    {a.email} · {a.role}
                  </span>
                </button>
              </li>
            ))}
            {accounts.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted">Chưa có tài khoản</li>
            )}
          </ul>
        </Card>

        <Card className="p-4 sm:p-5">
          {!selected || !flags ? (
            <p className="text-sm text-muted">Chọn một tài khoản bên trái để tick quyền.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[#111827]">{selected.fullName}</h2>
                  <p className="text-xs text-muted">
                    {selected.email} · {selected.role} · {selected.department}
                  </p>
                </div>
                <Button type="button" onClick={onSave} disabled={pending || !draft}>
                  {pending ? "Đang lưu…" : "Lưu quyền"}
                </Button>
              </div>

              {msg && (
                <p
                  className={cn(
                    "mb-4 rounded-lg px-3 py-2 text-xs",
                    msg.startsWith("Đã lưu")
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-rose-50 text-rose-800"
                  )}
                >
                  {msg}
                </p>
              )}

              <div className="space-y-6">
                {groups.map((group) => (
                  <div key={group}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {group}
                    </p>
                    <ul className="divide-y rounded-xl border border-border">
                      {CRM_FEATURES.filter((f) => f.group === group).map((f) => (
                        <li
                          key={f.code}
                          className="flex items-start gap-3 px-3 py-3 sm:items-center"
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 sm:items-center">
                            <input
                              type="checkbox"
                              checked={!!flags[f.code]}
                              onChange={() => toggle(f.code)}
                              className="mt-1 h-5 w-5 shrink-0 rounded border-[#94a3b8] text-[#111827] focus:ring-[#111827] sm:mt-0"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-[#111827]">
                                {f.label}
                              </span>
                              <span className="block text-[11px] text-muted">{f.description}</span>
                            </span>
                          </label>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              flags[f.code]
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-500"
                            )}
                          >
                            {flags[f.code] ? "Bật" : "Tắt"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
