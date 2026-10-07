"use client";

import { registerMembership } from "@/app/actions";
import { Button, Label, Textarea } from "@/components/ui";
import { MembershipDateFields, PackageMultiSelect } from "@/components/membership-fields";
import { SalesPersonSelect } from "@/components/sales-person-select";
import { displayContractCode } from "@/lib/contract";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";

function plusDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function RegisterMembershipForm({
  lockedCustomerId,
}: {
  lockedCustomerId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const [dateMode, setDateMode] = useState<"default" | "custom">("default");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(() => plusDays(today, 30));
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setDone(null);
    if (selectedPlans.length === 0) {
      setError("Chọn ít nhất 1 gói membership");
      return;
    }
    if (dateMode === "custom" && endDate < startDate) {
      setError("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu");
      return;
    }

    const fd = new FormData(e.currentTarget);
    for (const code of selectedPlans) {
      fd.append("planCodes", code);
    }

    startTransition(async () => {
      try {
        const res = await registerMembership(fd);
        if (res && "overlap" in res && res.overlap) {
          const ok = window.confirm(
            `${res.message}\n\nXác nhận khách vẫn muốn mua gói này?`
          );
          if (!ok) return;
          fd.set("confirmOverlap", "1");
          const retry = await registerMembership(fd);
          if (retry && "ok" in retry && retry.ok === false) {
            setError(retry.error || "Không đăng ký được");
            return;
          }
          if (retry && "ok" in retry && retry.ok) {
            const hd = retry.contractCodes?.map(displayContractCode).join(", ");
            setDone(`${retry.membershipCodes?.join(", ")}${hd ? ` · ${hd}` : ""}`);
            setSelectedPlans([]);
            router.refresh();
          }
          return;
        }
        if (res && "ok" in res && res.ok === false) {
          setError(res.error || "Không đăng ký được");
          return;
        }
        if (res && "ok" in res && res.ok && res.membershipCodes?.length) {
          const hd = res.contractCodes?.map(displayContractCode).join(", ");
          setDone(`${res.membershipCodes.join(", ")}${hd ? ` · ${hd}` : ""}`);
          setSelectedPlans([]);
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi đăng ký");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="customerId" value={lockedCustomerId} />

      <div>
        <Label>Chọn gói (có thể nhiều)</Label>
        <PackageMultiSelect selected={selectedPlans} onChange={setSelectedPlans} />
      </div>

      <SalesPersonSelect required />

      <div>
        <Label>Thời hạn</Label>
        <MembershipDateFields
          dateMode={dateMode}
          onDateModeChange={setDateMode}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={(v) => {
            setStartDate(v);
            if (dateMode === "default") setEndDate(plusDays(v, 30));
          }}
          onEndDateChange={setEndDate}
          defaultDays={30}
        />
      </div>

      <div>
        <Label>Ghi chú</Label>
        <Textarea name="note" rows={2} />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Đang kích hoạt…" : "Lưu · Active ngay"}
      </Button>
      <p className="text-center text-[11px] text-muted">
        Gói được lưu sẽ ACTIVE ngay. Nếu trùng dịch vụ với gói đang có, hệ thống sẽ hỏi xác nhận.
      </p>
      {done && (
        <p className="text-center text-sm text-success">Đã Active: {done}</p>
      )}
    </form>
  );
}
