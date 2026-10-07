"use client";

import { addCustomerNote, updateCustomerProfile } from "@/app/actions";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

export function CustomerNotesColumn({
  customerId,
  note,
  personality,
  notes,
}: {
  customerId: string;
  note: string;
  personality: string;
  notes: { id: string; content: string; createdAt: string }[];
}) {
  const router = useRouter();
  const [pendingProfile, startProfile] = useTransition();
  const [pendingNote, startNote] = useTransition();
  const [msg, setMsg] = useState("");

  function onSaveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("customerId", customerId);
    setMsg("");
    startProfile(async () => {
      const res = await updateCustomerProfile(fd);
      if (res?.ok) {
        setMsg("Đã lưu note & tính cách");
        router.refresh();
      } else {
        setMsg(res?.error || "Lỗi");
      }
    });
  }

  function onAddNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("customerId", customerId);
    startNote(async () => {
      await addCustomerNote(fd);
      const el = e.currentTarget.elements.namedItem("content") as HTMLTextAreaElement | null;
      if (el) el.value = "";
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSaveProfile} className="space-y-3">
        <h3 className="text-sm font-semibold">Ghi chú</h3>
        <div>
          <Label>Note</Label>
          <Textarea name="note" rows={3} defaultValue={note} placeholder="Ghi chú về khách…" />
        </div>
        <div>
          <Label>Tính cách</Label>
          <Input
            name="personality"
            defaultValue={personality}
            placeholder="VD: thân thiện, trầm ngâm…"
          />
        </div>
        <Button type="submit" className="w-full" disabled={pendingProfile}>
          {pendingProfile ? "Đang lưu…" : "Lưu note & tính cách"}
        </Button>
        {msg && <p className="text-xs text-muted">{msg}</p>}
      </form>

      <div className="border-t border-border pt-4">
        <h3 className="mb-3 text-sm font-semibold">Thêm ghi chú nhanh</h3>
        <form onSubmit={onAddNote} className="space-y-3">
          <div>
            <Label>Nội dung</Label>
            <Textarea name="content" rows={3} required />
          </div>
          <Button type="submit" variant="outline" className="w-full" disabled={pendingNote}>
            {pendingNote ? "Đang lưu…" : "Thêm note"}
          </Button>
        </form>
      </div>

      {notes.length > 0 && (
        <div className="border-t border-border pt-4">
          <div className="mb-2 text-xs font-semibold uppercase text-muted">Lịch sử ghi chú</div>
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <p className="text-sm text-[#111827]">{n.content}</p>
                <p className="mt-1 text-[10px] text-muted">
                  {new Date(n.createdAt).toLocaleString("vi-VN")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
