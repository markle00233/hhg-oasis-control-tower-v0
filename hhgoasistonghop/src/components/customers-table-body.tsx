"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { ServiceTag } from "@/components/service-tag";
import { MembershipPlanTag } from "@/components/membership-plan-tag";
import { PackageNumberBadge } from "@/components/package-number-badge";
import { cn } from "@/lib/utils";

export type CustomerTableMember = {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
  dateOfBirth: string | null;
  note: string | null;
  personality: string | null;
  isOwner: boolean;
  packageStatus: "ACTIVE" | "EXPIRED" | "NONE";
  packageBadges: { id: string; planCode: string }[];
  memServices: { code: string; name: string }[];
  memFallback: {
    planCode: string;
    planName: string;
    status: string;
    services: { code: string; name: string }[];
  } | null;
  remainingLines: {
    id: string;
    planCode: string;
    planName: string;
    days: number;
    unused: boolean;
    tone: string;
  }[];
};

export type CustomerTableEntry =
  | { kind: "solo"; customer: CustomerTableMember }
  | {
      kind: "family";
      groupId: string;
      displayCode: string;
      familyName: string;
      phone: string;
      ownerId: string;
      members: CustomerTableMember[];
      summary: Omit<CustomerTableMember, "id" | "customerCode" | "fullName" | "phone" | "isOwner"> & {
        id: string;
        customerCode: string;
        fullName: string;
        phone: string;
      };
    };

function StatusBadge({ status }: { status: "ACTIVE" | "EXPIRED" | "NONE" }) {
  if (status === "ACTIVE") {
    return <Badge className="bg-emerald-100 text-emerald-800">Còn hạn</Badge>;
  }
  if (status === "EXPIRED") {
    return <Badge className="bg-rose-100 text-rose-800">Hết hạn</Badge>;
  }
  return <Badge className="bg-slate-100 text-slate-600">Chưa có gói</Badge>;
}

function MemberCells({
  m,
  codeNode,
  nameExtra,
}: {
  m: CustomerTableMember;
  codeNode: ReactNode;
  nameExtra?: ReactNode;
}) {
  return (
    <>
      <td className="px-4 py-3 font-mono text-xs text-accent">{codeNode}</td>
      <td className="px-4 py-3 font-medium text-[#111827]">
        {m.fullName}
        {nameExtra}
      </td>
      <td className="px-4 py-3 text-muted">{m.phone}</td>
      <td className="px-4 py-3 text-muted">
        {m.dateOfBirth
          ? new Date(m.dateOfBirth).toLocaleDateString("vi-VN")
          : "—"}
      </td>
      <td className="px-4 py-3">
        {m.packageBadges.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {m.packageBadges.map((b) => (
              <PackageNumberBadge key={b.id} planCode={b.planCode} />
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {m.memServices.length > 0 ? (
          <div className="flex max-w-[180px] flex-wrap gap-1">
            {m.memServices.map((s) => (
              <ServiceTag key={s.code} code={s.code} name={s.name} />
            ))}
          </div>
        ) : m.memFallback ? (
          <MembershipPlanTag
            planCode={m.memFallback.planCode}
            planName={m.memFallback.planName}
            status={m.memFallback.status}
            services={m.memFallback.services}
          />
        ) : (
          <span className="text-xs text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {m.remainingLines.length === 0 ? (
          <span className="text-xs text-muted">—</span>
        ) : (
          <div className="max-w-[260px] space-y-1.5 text-xs leading-snug">
            {m.remainingLines.map((line) => (
              <p key={line.id} className={line.tone}>
                {line.planName} còn{" "}
                <strong>
                  {line.days === 0 ? "hôm nay" : `${line.days} ngày`}
                </strong>
                {line.days <= 7 && line.unused && (
                  <span className="mt-0.5 block font-medium text-rose-700">
                    ⚠ Sắp hết hạn · chưa dùng dịch vụ — cần liên hệ
                  </span>
                )}
                {line.days <= 7 && !line.unused && (
                  <span className="mt-0.5 block text-amber-700">
                    Sắp hết hạn — nhắc gia hạn
                  </span>
                )}
              </p>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="line-clamp-2 max-w-[160px] text-xs text-muted">
          {m.note?.trim() || "—"}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="line-clamp-2 max-w-[140px] text-xs text-muted">
          {m.personality?.trim() || "—"}
        </span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={m.packageStatus} />
      </td>
    </>
  );
}

function SoloRow({ customer }: { customer: CustomerTableMember }) {
  const router = useRouter();
  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/customers/${customer.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/customers/${customer.id}`);
        }
      }}
      className="cursor-pointer border-b border-border/70 transition hover:bg-slate-50/80"
    >
      <MemberCells m={customer} codeNode={customer.customerCode} />
    </tr>
  );
}

function FamilyBlock({
  entry,
}: {
  entry: Extract<CustomerTableEntry, { kind: "family" }>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const count = entry.members.length;

  return (
    <>
      <tr
        className={cn(
          "cursor-pointer border-b border-border/70 bg-[#f8fafc] transition hover:bg-slate-100/80",
          open && "border-b-0"
        )}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
      >
        <MemberCells
          m={{
            ...entry.summary,
            isOwner: true,
          }}
          codeNode={
            <button
              type="button"
              className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              )}
              {entry.displayCode}
            </button>
          }
          nameExtra={
            <span className="ml-2 text-[11px] font-normal text-muted">
              Gia đình · {count} thành viên
              <button
                type="button"
                className="ml-2 text-accent underline-offset-2 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((v) => !v);
                }}
              >
                {open ? "Thu gọn" : "Mở rộng"}
              </button>
              <Link
                href={`/customers/${entry.ownerId}?tab=family`}
                className="ml-2 text-accent underline-offset-2 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Hồ sơ
              </Link>
            </span>
          }
        />
      </tr>
      {open
        ? entry.members.map((m) => (
            <tr
              key={m.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/customers/${m.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/customers/${m.id}`);
                }
              }}
              className="cursor-pointer border-b border-border/70 bg-white transition hover:bg-slate-50/80"
            >
              <MemberCells
                m={m}
                codeNode={
                  <span className="pl-5 text-slate-500">{m.customerCode}</span>
                }
                nameExtra={
                  m.isOwner ? (
                    <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                      Chủ hộ
                    </span>
                  ) : null
                }
              />
            </tr>
          ))
        : null}
    </>
  );
}

export function CustomersTableBody({ entries }: { entries: CustomerTableEntry[] }) {
  if (entries.length === 0) {
    return (
      <tr>
        <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted">
          Không tìm thấy khách
        </td>
      </tr>
    );
  }

  return (
    <>
      {entries.map((entry) =>
        entry.kind === "solo" ? (
          <SoloRow key={entry.customer.id} customer={entry.customer} />
        ) : (
          <FamilyBlock key={entry.groupId} entry={entry} />
        )
      )}
    </>
  );
}
