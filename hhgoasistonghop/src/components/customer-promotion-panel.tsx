"use client";

import { assignPromotion, cancelCustomerPromotion } from "@/app/actions";
import { Button, Input, Label, Select } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

export function CustomerPromotionPanel({
  customerId,
  assigned,
  catalog,
}: {
  customerId: string;
  assigned: {
    id: string;
    name: string;
    code: string;
    type: string;
    serviceName: string | null;
    createdAt: string;
    status: string;
  }[];
  catalog: { id: string; code: string; name: string; serviceName: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  function onAssign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await assignPromotion(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone("Đã gắn promotion");
      setError("");
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-xl border border-[#ececef]">
        {assigned.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-2 px-4 py-3 text-sm">
            <div>
              <div className="font-medium">{a.name}</div>
              <div className="text-[11px] text-muted">
                {a.code} · {a.type}
                {a.serviceName ? ` · ${a.serviceName}` : ""} · {formatDate(a.createdAt)}
              </div>
            </div>
            {a.status === "ACTIVE" ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    await cancelCustomerPromotion(a.id);
                    router.refresh();
                  });
                }}
              >
                Hủy
              </Button>
            ) : (
              <span className="text-[11px] text-muted">{a.status}</span>
            )}
          </li>
        ))}
        {assigned.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            Chưa gắn promotion / voucher
          </li>
        )}
      </ul>

      <form onSubmit={onAssign} className="space-y-3 rounded-xl border border-dashed border-[#d1d5db] p-4">
        <input type="hidden" name="customerId" value={customerId} />
        <p className="text-xs font-medium">Gắn promotion / voucher cho khách này</p>
        <div>
          <Label>Mã</Label>
          <Select name="promotionId" required defaultValue="">
            <option value="">— chọn —</option>
            {catalog.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
                {p.serviceName ? ` (${p.serviceName})` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Ghi chú</Label>
          <Input name="note" placeholder="VD: tặng 1 buổi bơi" />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {done && <p className="text-sm text-success">{done}</p>}
        <Button type="submit" size="sm" disabled={pending || catalog.length === 0}>
          {pending ? "Đang gắn…" : "Gắn cho khách"}
        </Button>
      </form>
    </div>
  );
}
