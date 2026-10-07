"use client";

import { createMembershipPlan } from "@/app/actions";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { useTransition } from "react";

export function CreatePlanForm({ services }: { services: { id: string; name: string }[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await createMembershipPlan(fd);
        });
      }}
      className="space-y-3"
    >
      <div>
        <Label>Tên plan</Label>
        <Input name="name" required placeholder="Gói Resort + Spa" />
      </div>
      <div>
        <Label>Số ngày</Label>
        <Input name="durationDays" type="number" defaultValue={30} required />
      </div>
      <div>
        <Label>Mô tả</Label>
        <Textarea name="description" rows={2} />
      </div>
      <div>
        <Label>Services</Label>
        <div className="mt-1 space-y-1">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="serviceIds" value={s.id} />
              {s.name}
            </label>
          ))}
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={pending} size="sm">
        {pending ? "…" : "Tạo plan"}
      </Button>
    </form>
  );
}
