"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteCustomer } from "@/app/actions";
import { Button } from "@/components/ui";

export function DeleteCustomerButton({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function onDelete() {
    const ok = window.confirm(
      `Xóa khách "${customerName}"?\nToàn bộ gói membership và lịch sử liên quan sẽ bị xóa. Không hoàn tác được.`
    );
    if (!ok) return;
    setError("");
    startTransition(async () => {
      try {
        const res = await deleteCustomer(customerId);
        if (res?.ok) {
          router.push("/customers");
          router.refresh();
          return;
        }
        setError(res?.error || "Không xóa được");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không xóa được");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="danger" size="sm" disabled={pending} onClick={onDelete}>
        {pending ? "Đang xóa…" : "Xóa khách"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
