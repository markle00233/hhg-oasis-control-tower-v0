"use client";

import { clearStaticAccess, unlockStaticAccess } from "@/app/actions";
import { Button, Card, Input, Label, PageHeader } from "@/components/ui";
import { FormEvent, useEffect, useState, useTransition } from "react";

export function StaticPasswordForm({
  redirectTo = "/static?auth=1",
}: {
  redirectTo?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  useEffect(() => {
    void clearStaticAccess();
  }, []);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const res = await unlockStaticAccess(fd);
        if (res && "ok" in res && res.ok === false) {
          setError(res.error || "Sai mật khẩu");
        }
      } catch {
        // redirect() throws
      }
    });
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Static"
        description="Thống kê thay đổi hôm nay của đúng tài khoản đang đăng nhập · mỗi lần vào cần mật khẩu"
      />
      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <div>
            <Label htmlFor="password">Mật khẩu Static</Label>
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
            {pending ? "Đang kiểm tra…" : "Xem Static của tôi"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
