"use client";

import { addCustomerNote } from "@/app/actions";
import { Button, Label, Textarea } from "@/components/ui";
import { useTransition } from "react";

export function AddNoteForm({ customerId }: { customerId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await addCustomerNote(fd);
          const el = document.getElementById("note-content") as HTMLTextAreaElement | null;
          if (el) el.value = "";
        });
      }}
      className="space-y-3"
    >
      <input type="hidden" name="customerId" value={customerId} />
      <div>
        <Label>Nội dung</Label>
        <Textarea id="note-content" name="content" rows={4} required />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Đang lưu…" : "Thêm note"}
      </Button>
    </form>
  );
}
