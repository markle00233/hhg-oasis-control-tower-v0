"use client";

import { addFamilyMember, createFamilyGroup, removeFamilyMember } from "@/app/actions";
import { Button, Input, Label, Select } from "@/components/ui";
import { FAMILY_RELATIONS, GENDERS } from "@/config/crm.config";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";

type Member = {
  id: string;
  fullName: string;
  customerCode: string;
  phone: string;
  isOwner: boolean;
};

export function FamilyPanel({
  customerId,
  group,
}: {
  customerId: string;
  group: {
    id: string;
    groupCode: string;
    name: string | null;
    phone: string;
    ownerId: string;
    members: Member[];
  } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createFamilyGroup(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("Đã tạo gói gia đình");
      router.refresh();
    });
  }

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await addFamilyMember(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("Đã thêm thành viên");
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  if (!group) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Gói gia đình: 1 SĐT chủ hộ, nhiều thành viên trong danh sách. Ai trong danh sách đọc SĐT này thì được vào. Người lạ biết số nhưng không có tên thì phải mua gói lẻ.
        </p>
        <form onSubmit={onCreate} className="space-y-3">
          <input type="hidden" name="ownerId" value={customerId} />
          <div>
            <Label>Tên nhóm (tuỳ chọn)</Label>
            <Input name="name" placeholder="VD: Gia đình anh Minh" />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Đang tạo…" : "Tạo gói gia đình"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium">{group.name || "Gói gia đình"}</div>
        <div className="text-xs text-muted">
          {group.groupCode} · SĐT dùng chung {group.phone}
        </div>
      </div>
      <ul className="divide-y rounded-xl border border-[#ececef]">
        {group.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <div>
              <Link href={`/customers/${m.id}`} className="font-medium hover:underline">
                {m.fullName}
              </Link>
              <div className="text-[11px] text-muted">
                {m.customerCode}
                {m.isOwner ? " · Chủ hộ" : ""}
              </div>
            </div>
            {!m.isOwner ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Gỡ ${m.fullName} khỏi danh sách gia đình?`)) return;
                  startTransition(async () => {
                    const res = await removeFamilyMember(m.id);
                    if (!res.ok) setError(res.error);
                    else router.refresh();
                  });
                }}
              >
                Gỡ
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <form onSubmit={onAdd} className="space-y-3 rounded-xl border border-dashed border-[#d1d5db] p-3">
        <input type="hidden" name="groupId" value={group.id} />
        <p className="text-xs font-medium">Thêm thành viên (dùng chung SĐT chủ hộ)</p>
        <div>
          <Label>Họ tên *</Label>
          <Input name="fullName" required />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Ngày sinh</Label>
            <Input name="dateOfBirth" type="date" />
          </div>
          <div>
            <Label>Quan hệ</Label>
            <Select name="relation" defaultValue="OTHER">
              {FAMILY_RELATIONS.filter((r) => r.value !== "OWNER").map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label>Giới tính</Label>
          <Select name="gender" defaultValue="">
            <option value="">—</option>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {message && <p className="text-sm text-success">{message}</p>}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Đang thêm…" : "Thêm vào danh sách"}
        </Button>
      </form>
    </div>
  );
}
