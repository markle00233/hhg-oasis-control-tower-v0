"use client";

import { useState, useTransition } from "react";
import { Plus, Printer, X } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import {
  createServiceContract,
  lookupCustomerForContract,
} from "@/app/actions";
import { MemberWordDocument, ServiceWordDocument } from "@/components/receipt-word-editors";
import { cn } from "@/lib/utils";

type ContractRow = {
  id: string;
  type: "MEMBER" | "SERVICE";
  formNo: string;
  memberCode: string;
  fullName: string;
  subtitle: string;
  createdAtLabel: string;
  status: "EMPTY" | "EDITED";
  defaults: Record<string, string>;
};

export function ReceiptsBoard({
  memberRows,
  serviceRows,
  staffName,
  q,
  canEdit = true,
}: {
  memberRows: ContractRow[];
  serviceRows: ContractRow[];
  staffName: string;
  q: string;
  canEdit?: boolean;
}) {
  const [open, setOpen] = useState<null | "MEMBER" | "SERVICE">(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [lookupMsg, setLookupMsg] = useState("");
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [docKey, setDocKey] = useState(0);

  function openCreate(type: "MEMBER" | "SERVICE") {
    setError("");
    setLookupMsg("");
    setEditingId(null);
    setDefaults({
      formDate: new Date().toISOString().slice(0, 10),
      staffName,
      homeClub: "HHG OASIS · 27/58 Tây Lân, P. Bình Tân, TP.HCM",
      payRemain: "0",
      transfer: "Không",
      pause: "Không",
      isFamily: "0",
    });
    setDocKey((k) => k + 1);
    setOpen(type);
  }

  function openEdit(row: ContractRow) {
    setError("");
    setLookupMsg("");
    setEditingId(row.id);
    setDefaults({
      ...row.defaults,
      staffName: row.defaults.staffName || staffName,
      formDate: row.defaults.formDate || new Date().toISOString().slice(0, 10),
    });
    setDocKey((k) => k + 1);
    setOpen(row.type);
  }

  function onLookup(form: HTMLFormElement) {
    const fd = new FormData(form);
    const code = String(fd.get("memberCode") || "");
    start(async () => {
      setLookupMsg("");
      const res = await lookupCustomerForContract(code);
      if (!res.ok) {
        setLookupMsg(res.error);
        return;
      }
      const c = res.customer;
      setDefaults((p) => ({
        ...p,
        memberCode: c.isFamily ? `${c.customerCode} - GĐ` : c.customerCode,
        isFamily: c.isFamily ? "1" : "0",
        fullName: c.fullName,
        phone: c.phone,
        email: c.email,
        dateOfBirth: c.dateOfBirth,
        gender: c.gender,
        planName: c.planName,
        planMonths: c.planMonths,
        startDate: c.startDate,
        expiryDate: c.expiryDate,
        serviceType: c.planName,
      }));
      setDocKey((k) => k + 1);
      setLookupMsg(`Đã điền từ CRM: ${c.fullName}`);
    });
  }

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!String(fd.get("emergencyName") || "").trim()) {
      fd.set("emergencyName", String(fd.get("emergencyName2") || ""));
    }
    if (!String(fd.get("emergencyPhone") || "").trim()) {
      fd.set("emergencyPhone", String(fd.get("emergencyPhone2") || ""));
    }
    fd.set("type", open || "MEMBER");
    if (editingId) fd.set("contractId", editingId);
    start(async () => {
      setError("");
      const res = await createServiceContract(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(null);
      setEditingId(null);
      window.location.href = `/receipts?saved=${encodeURIComponent(res.formNo)}`;
    });
  }

  return (
    <>
      <Card className="mb-4 p-3 sm:p-4">
        <form className="flex flex-col gap-2 sm:flex-row">
          <Input
            name="q"
            defaultValue={q}
            placeholder="CUS-… / HD-HV-… / tên"
            className="min-w-0 flex-1"
          />
          <button
            type="submit"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-[#111827] px-4 text-sm font-medium text-white"
          >
            Tra cứu
          </button>
        </form>
        <p className="mt-2 text-[11px] text-muted">
          Tạo khách → tự có 2 mẫu (đỏ: chưa thông tin). Mở form và lưu →{" "}
          <span className="text-emerald-700">đã chỉnh sửa</span>.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Column
          title="Hợp đồng Hội viên"
          subtitle="Mẫu Word thẻ / gói tháng"
          onAdd={canEdit ? () => openCreate("MEMBER") : undefined}
          onEdit={openEdit}
          rows={memberRows}
          empty="Chưa có hợp đồng"
          printType="member"
        />
        <Column
          title="Hợp đồng dịch vụ"
          subtitle="Mẫu Word HLV / dịch vụ"
          onAdd={canEdit ? () => openCreate("SERVICE") : undefined}
          onEdit={openEdit}
          rows={serviceRows}
          empty="Chưa có hợp đồng"
          printType="service"
        />
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#e5e7eb]">
          <div className="no-print relative flex shrink-0 flex-col gap-2 border-b border-[#d1d5db] bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4">
            <div className="min-w-0 pr-8 sm:pr-0">
              <div className="text-sm font-semibold text-[#111827]">
                {open === "MEMBER" ? "Hợp đồng Hội viên — mẫu Word" : "Hợp đồng dịch vụ HLV — mẫu Word"}
              </div>
              <p className="text-[11px] text-muted">
                {editingId ? "Chỉnh sửa mẫu · Lưu sẽ chuyển sang đã chỉnh sửa" : "Mẫu mới · Điền và lưu"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {lookupMsg && <span className="text-xs text-emerald-700">{lookupMsg}</span>}
              {error && <span className="text-xs text-rose-700">{error}</span>}
              <Button
                type="button"
                variant="secondary"
                disabled={pending || !canEdit}
                onClick={() => {
                  const form = document.getElementById(
                    "word-contract-form"
                  ) as HTMLFormElement | null;
                  if (form) onLookup(form);
                }}
              >
                Nạp từ CRM
              </Button>
              {canEdit && (
                <Button type="submit" form="word-contract-form" disabled={pending}>
                  {pending ? "Đang lưu…" : "Lưu hợp đồng"}
                </Button>
              )}
              {!canEdit && (
                <span className="text-xs text-muted">Chỉ xem — không được lưu</span>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(null);
                  setEditingId(null);
                }}
                className="absolute right-3 top-3 rounded-lg p-2 text-[#6b7280] hover:bg-slate-100 sm:static"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-4">
            <form id="word-contract-form" key={docKey} onSubmit={onSave}>
              <input type="hidden" name="type" value={open} />
              {editingId && <input type="hidden" name="contractId" value={editingId} />}
              {open === "MEMBER" ? (
                <MemberWordDocument defaults={defaults} />
              ) : (
                <ServiceWordDocument defaults={defaults} />
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: "EMPTY" | "EDITED" }) {
  if (status === "EMPTY") {
    return (
      <span className="text-[11px] font-semibold text-rose-600">chưa thông tin</span>
    );
  }
  return (
    <span className="text-[11px] font-semibold text-emerald-700">đã chỉnh sửa</span>
  );
}

function Column({
  title,
  subtitle,
  onAdd,
  onEdit,
  rows,
  empty,
  printType,
}: {
  title: string;
  subtitle: string;
  onAdd?: () => void;
  onEdit: (row: ContractRow) => void;
  rows: ContractRow[];
  empty: string;
  printType: "member" | "service";
}) {
  return (
    <Card className="min-h-[420px] overflow-hidden">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[#111827]">{title}</h2>
          <p className="text-[11px] text-muted">{subtitle}</p>
        </div>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            title="Mở mẫu Word"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#111827] text-white hover:bg-black"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-2 px-4 py-3 text-sm">
            <button
              type="button"
              onClick={() => onEdit(r)}
              className="min-w-0 flex-1 text-left hover:opacity-80"
            >
              <div className="font-mono text-[13px] font-semibold">{r.memberCode}</div>
              <div className="truncate text-xs text-muted">
                {r.formNo.replace(/^HD-/, "HĐ-")} · {r.fullName}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <StatusBadge status={r.status} />
                <span className="text-[11px] text-muted">
                  {r.subtitle} · {r.createdAtLabel}
                </span>
              </div>
            </button>
            <a
              href={`/receipts/print/doc/${r.id}?type=${printType}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-[#111827] px-2.5 text-[11px] font-medium text-white"
              )}
            >
              <Printer className="h-3 w-3" />
              In
            </a>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-4 py-12 text-center text-sm text-muted">{empty}</li>
        )}
      </ul>
    </Card>
  );
}
