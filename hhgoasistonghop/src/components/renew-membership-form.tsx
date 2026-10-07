"use client";

import { renewMembership } from "@/app/actions";
import { Button, Input, Label } from "@/components/ui";
import { displayContractCode } from "@/lib/contract";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";

function plusDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function RenewMembershipForm({
  membershipId,
  planName,
  durationDays,
  currentExpiry,
}: {
  membershipId: string;
  planName: string;
  durationDays: number;
  currentExpiry: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const defaults = useMemo(() => {
    const exp = new Date(currentExpiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = exp >= today ? exp : today;
    const startIso = start.toISOString().slice(0, 10);
    return { startIso, endIso: plusDays(startIso, durationDays || 30) };
  }, [currentExpiry, durationDays]);

  const [startDate, setStartDate] = useState(defaults.startIso);
  const [endDate, setEndDate] = useState(defaults.endIso);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    fd.set("dateMode", "custom");
    startTransition(async () => {
      const res = await renewMembership(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(`${res.membershipCode} · ${displayContractCode(res.contractCode)}`);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Gia hạn
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-lg border border-[#ececef] bg-[#f9fafb] p-3">
      <input type="hidden" name="membershipId" value={membershipId} />
      <p className="text-xs text-muted">
        Gia hạn {planName}: kỳ mới bắt đầu sau hạn cũ (hoặc hôm nay nếu đã hết hạn). Mỗi lần gia hạn có mã HĐ mới.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Bắt đầu</Label>
          <Input
            type="date"
            name="startDate"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setEndDate(plusDays(e.target.value, durationDays || 30));
            }}
          />
        </div>
        <div>
          <Label>Kết thúc</Label>
          <Input
            type="date"
            name="endDate"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {done && <p className="text-xs text-success">Đã gia hạn: {done}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Đang lưu…" : "Xác nhận gia hạn"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
