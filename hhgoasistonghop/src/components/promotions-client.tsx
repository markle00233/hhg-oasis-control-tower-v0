"use client";

import { assignPromotion, createPromotion } from "@/app/actions";
import { Button, Card, Input, Label, PageHeader, Select, Textarea } from "@/components/ui";
import { fuzzyMatchCustomer } from "@/lib/customer-search";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";

type Promo = {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string | null;
  serviceName: string | null;
  validFrom: string | null;
  validTo: string | null;
  status: string;
};

type Customer = {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
};

type Assignment = {
  id: string;
  customerName: string;
  customerId: string;
  promoName: string;
  promoCode: string;
  createdAt: string;
  status: string;
};

export function PromotionsClient({
  promotions,
  services,
  customers,
  assignments,
}: {
  promotions: Promo[];
  services: { id: string; name: string }[];
  customers: Customer[];
  assignments: Assignment[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const filtered = useMemo(
    () => customers.filter((c) => fuzzyMatchCustomer(c, q)),
    [customers, q]
  );
  const selected = filtered.find((c) => c.id === selectedId) ?? null;

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createPromotion(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone("Đã lưu promotion/voucher");
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  function onAssign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) {
      setError("Chọn khách trước");
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set("customerId", selected.id);
    startTransition(async () => {
      const res = await assignPromotion(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(`Đã gắn cho ${selected.fullName}`);
      router.refresh();
    });
  }

  return (
    <div>
      <PageHeader
        title="Promotion & Voucher"
        description="Nhập mã khuyến mãi / voucher, rồi gắn cho khách (ví dụ bơi miễn phí)"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Nhập promotion / voucher</h3>
          <form onSubmit={onCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Loại</Label>
                <Select name="type" defaultValue="PROMOTION">
                  <option value="PROMOTION">Promotion</option>
                  <option value="VOUCHER">Voucher</option>
                </Select>
              </div>
              <div>
                <Label>Mã (tuỳ chọn)</Label>
                <Input name="code" placeholder="VD: BOI-FREE" />
              </div>
            </div>
            <div>
              <Label>Tên *</Label>
              <Input name="name" required placeholder="Bơi miễn phí" />
            </div>
            <div>
              <Label>Dịch vụ được dùng (nếu có)</Label>
              <Select name="serviceId" defaultValue="">
                <option value="">Không gắn khu cụ thể</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Hiệu lực từ</Label>
                <Input name="validFrom" type="date" />
              </div>
              <div>
                <Label>Đến</Label>
                <Input name="validTo" type="date" />
              </div>
            </div>
            <div>
              <Label>Mô tả</Label>
              <Textarea name="description" rows={2} />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu…" : "Lưu mã"}
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Gắn cho khách</h3>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm khách theo tên / SĐT"
            className="mb-2"
          />
          <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-[#ececef]">
            {filtered.slice(0, 20).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  selectedId === c.id ? "bg-[#f3f4f6]" : "hover:bg-[#f9fafb]"
                }`}
              >
                <div className="font-medium">{c.fullName}</div>
                <div className="text-[11px] text-muted">
                  {c.customerCode} · {c.phone}
                </div>
              </button>
            ))}
          </div>
          {selected ? (
            <p className="mb-2 text-xs text-muted">
              Đang chọn: <strong>{selected.fullName}</strong>{" "}
              <Link href={`/customers/${selected.id}`} className="underline">
                mở hồ sơ
              </Link>
            </p>
          ) : (
            <p className="mb-2 text-xs text-muted">Chọn khách ở danh sách trên</p>
          )}
          <form onSubmit={onAssign} className="space-y-3">
            <div>
              <Label>Promotion / Voucher</Label>
              <Select name="promotionId" required>
                <option value="">— chọn —</option>
                {promotions
                  .filter((p) => p.status === "ACTIVE")
                  .map((p) => (
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
            <Button type="submit" disabled={pending || !selected}>
              Gắn cho khách
            </Button>
          </form>
        </Card>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {done && <p className="mt-3 text-sm text-success">{done}</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b px-5 py-3 text-sm font-semibold">Danh mục mã</div>
          <ul className="divide-y">
            {promotions.map((p) => (
              <li key={p.id} className="px-5 py-3 text-sm">
                <div className="font-medium">
                  {p.name}{" "}
                  <span className="font-mono text-xs text-muted">{p.code}</span>
                </div>
                <div className="text-xs text-muted">
                  {p.type}
                  {p.serviceName ? ` · ${p.serviceName}` : ""}
                  {p.validTo ? ` · đến ${formatDate(p.validTo)}` : ""}
                </div>
                {p.description ? <p className="mt-1 text-xs">{p.description}</p> : null}
              </li>
            ))}
            {promotions.length === 0 && (
              <li className="px-5 py-8 text-center text-xs text-muted">Chưa có mã</li>
            )}
          </ul>
        </Card>
        <Card>
          <div className="border-b px-5 py-3 text-sm font-semibold">Đã gắn gần đây</div>
          <ul className="divide-y">
            {assignments.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm">
                <Link href={`/customers/${a.customerId}`} className="font-medium hover:underline">
                  {a.customerName}
                </Link>
                <div className="text-xs text-muted">
                  {a.promoCode} · {a.promoName} · {formatDate(a.createdAt)}
                </div>
              </li>
            ))}
            {assignments.length === 0 && (
              <li className="px-5 py-8 text-center text-xs text-muted">Chưa gắn</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
