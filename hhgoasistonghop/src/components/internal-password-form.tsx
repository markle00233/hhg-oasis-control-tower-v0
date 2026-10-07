"use client";

import { clearInternalAccess, unlockInternalAccess } from "@/app/actions";
import { Button, Card, Input, Label, PageHeader } from "@/components/ui";
import { FormEvent, useEffect, useState, useTransition } from "react";

export function InternalPasswordForm({
  redirectTo = "/internal?auth=1",
}: {
  redirectTo?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  useEffect(() => {
    void clearInternalAccess();
  }, []);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const res = await unlockInternalAccess(fd);
        if (res && "ok" in res && res.ok === false) {
          setError(res.error || "Sai mật khẩu");
        }
      } catch {
        // redirect() throws; browser follows
      }
    });
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Nội bộ"
        description="Mỗi lần vào đều cần mật khẩu · khu vực NV kinh doanh"
      />
      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <div>
            <Label htmlFor="password">Mật khẩu nội bộ</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoFocus
              placeholder="Nhập mật khẩu"
              required
              autoComplete="off"
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Đang kiểm tra…" : "Vào khu nội bộ"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
