"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button, Card, Input, Label, PageHeader, Select, Textarea } from "@/components/ui";
import { CUSTOMER_SOURCES, FAMILY_RELATIONS, GENDERS } from "@/config/crm.config";
import { MembershipDateFields, PackageMultiSelect } from "@/components/membership-fields";
import { SalesPersonSelect } from "@/components/sales-person-select";
import { useBackgroundJobs } from "@/components/background-jobs";
import { canWrite } from "@/lib/auth";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";

function plusDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type FamilyDraft = {
  key: string;
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  relation: string;
  note: string;
};

function emptyMember(): FamilyDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fullName: "",
    phone: "",
    email: "",
    dateOfBirth: "",
    gender: "",
    relation: "OTHER",
    note: "",
  };
}

export default function NewCustomerPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { enqueueCreateCustomer } = useBackgroundJobs();
  const [error, setError] = useState("");
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateMode, setDateMode] = useState<"default" | "custom">("default");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(() => plusDays(today, 30));
  const [familyMembers, setFamilyMembers] = useState<FamilyDraft[]>([]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    const ok =
      canWrite(session.user.role) &&
      (session.user.role === "ADMIN" || !!session.user.features?.customers_write);
    if (!ok) router.replace("/customers");
  }, [status, session, router]);

  const allowed =
    session?.user &&
    canWrite(session.user.role) &&
    (session.user.role === "ADMIN" || !!session.user.features?.customers_write);

  if (status === "loading" || !allowed) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-muted">
        Đang kiểm tra quyền…
      </div>
    );
  }

  function updateMember(key: string, patch: Partial<FamilyDraft>) {
    setFamilyMembers((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (selectedPlans.length > 0 && dateMode === "custom" && endDate < startDate) {
      setError("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu");
      return;
    }
    const namedMembers = familyMembers.filter((m) => m.fullName.trim());
    if (familyMembers.length > 0 && namedMembers.length === 0) {
      setError("Thành viên gia đình cần ít nhất họ tên (các ô khác không bắt buộc)");
      return;
    }
    const fd = new FormData(e.currentTarget);
    for (const code of selectedPlans) {
      fd.append("planCodes", code);
    }
    if (namedMembers.length > 0) {
      fd.set("familyMembers", JSON.stringify(namedMembers));
    }

    const familyTab = namedMembers.length > 0;
    enqueueCreateCustomer(fd, {
      label: "Lưu khách hàng",
      familyTab,
    });

    // Thoát form ngay — thao tác tiếp bình thường; job chạy ngầm + toast
    router.push("/customers");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Tạo khách hàng"
        description="SĐT chủ hộ dùng chung cho cả gia đình · có thể gắn nhiều gói"
      />
      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="fullName">Họ và tên *</Label>
            <Input id="fullName" name="fullName" required />
          </div>
          <div>
            <Label htmlFor="phone">Số điện thoại gia đình *</Label>
            <Input id="phone" name="phone" required placeholder="09xxxxxxxx" />
            <p className="mt-1 text-[11px] text-muted">
              1 số này dùng cho cả nhà. Thành viên bên dưới không cần SĐT riêng.
            </p>
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="dateOfBirth">Ngày sinh</Label>
              <Input id="dateOfBirth" name="dateOfBirth" type="date" />
            </div>
            <div>
              <Label htmlFor="gender">Giới tính</Label>
              <Select id="gender" name="gender" defaultValue="">
                <option value="">—</option>
                {GENDERS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="source">Nguồn khách</Label>
            <Select id="source" name="source" defaultValue="WALK_IN">
              {CUSTOMER_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          <SalesPersonSelect required={selectedPlans.length > 0} />

          <div className="rounded-xl border border-[#ececef] bg-[#f9fafb] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-[#111827]">Thành viên gia đình</div>
                <p className="text-[11px] text-muted">
                  Không bắt buộc. Chỉ cần tên để thêm người. SĐT trống = dùng SĐT chủ hộ.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setFamilyMembers((prev) => [...prev, emptyMember()])}
              >
                <Plus className="h-4 w-4" />
                Thêm thành viên
              </Button>
            </div>

            {familyMembers.length === 0 ? (
              <p className="text-xs text-muted">Chưa thêm ai. Bấm + nếu đăng ký cho cả nhà.</p>
            ) : (
              <div className="space-y-3">
                {familyMembers.map((m, idx) => (
                  <div key={m.key} className="space-y-3 rounded-xl border border-[#e5e7eb] bg-white p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[#6b7280]">Thành viên {idx + 1}</span>
                      <button
                        type="button"
                        className="rounded-md p-1 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#111827]"
                        onClick={() =>
                          setFamilyMembers((prev) => prev.filter((x) => x.key !== m.key))
                        }
                        aria-label="Xóa thành viên"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Họ và tên</Label>
                        <Input
                          value={m.fullName}
                          onChange={(e) => updateMember(m.key, { fullName: e.target.value })}
                          placeholder="Tên thành viên"
                        />
                      </div>
                      <div>
                        <Label>Số điện thoại</Label>
                        <Input
                          value={m.phone}
                          onChange={(e) => updateMember(m.key, { phone: e.target.value })}
                          placeholder="Trống = SĐT gia đình"
                        />
                      </div>
                      <div>
                        <Label>Ngày sinh</Label>
                        <Input
                          type="date"
                          value={m.dateOfBirth}
                          onChange={(e) => updateMember(m.key, { dateOfBirth: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Giới tính</Label>
                        <Select
                          value={m.gender}
                          onChange={(e) => updateMember(m.key, { gender: e.target.value })}
                        >
                          <option value="">—</option>
                          {GENDERS.map((g) => (
                            <option key={g.value} value={g.value}>
                              {g.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label>Quan hệ</Label>
                        <Select
                          value={m.relation}
                          onChange={(e) => updateMember(m.key, { relation: e.target.value })}
                        >
                          {FAMILY_RELATIONS.filter((r) => r.value !== "OWNER").map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={m.email}
                          onChange={(e) => updateMember(m.key, { email: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Ghi chú</Label>
                      <Input
                        value={m.note}
                        onChange={(e) => updateMember(m.key, { note: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>Gói dịch vụ (chọn nhiều được)</Label>
            <PackageMultiSelect selected={selectedPlans} onChange={setSelectedPlans} />
          </div>

          {selectedPlans.length > 0 && (
            <div>
              <Label>Thời hạn membership</Label>
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
          )}

          <div>
            <Label htmlFor="note">Ghi chú (Note)</Label>
            <Textarea id="note" name="note" rows={2} />
          </div>
          <div>
            <Label htmlFor="personality">Tính cách</Label>
            <Input
              id="personality"
              name="personality"
              placeholder="VD: thân thiện, hay đến tối…"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="submit">Lưu · Active ngay</Button>
            <Link
              href="/customers"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white px-4 text-sm font-medium text-[#111827] transition hover:bg-[#f9fafb]"
            >
              Hủy
            </Link>
          </div>
          <p className="text-[11px] text-muted">
            Bấm Lưu → chạy ngầm, góc màn hình báo chờ trong giây lát. Bạn vẫn thao tác bình thường.
          </p>
        </form>
      </Card>
    </div>
  );
}
