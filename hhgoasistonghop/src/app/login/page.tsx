"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { Button, Card, Input, Label } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("27/56a");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Tài khoản hoặc mật khẩu không đúng");
      return;
    }
    router.push(searchParams.get("callbackUrl") || "/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md p-5 sm:p-8">
      <div className="mb-8 text-center">
        <div className="text-2xl font-semibold tracking-tight text-primary">HHGO CRM</div>
        <p className="mt-2 text-sm text-muted">Nội bộ · Version 1</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">Tài khoản</Label>
          <Input
            id="email"
            type="text"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
      </form>
      <div className="mt-6 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-muted">
        <p className="font-medium text-slate-700">Tài khoản</p>
        <p>
          Vận hành: <strong>27/56a</strong> · <strong>55/62</strong>
        </p>
        <p>
          Chỉ xem: <strong>viewer1</strong> · <strong>viewer2</strong>
        </p>
        <p>
          Admin: <strong>namanhadministrattion</strong> (mục Nội bộ chỉ acc này)
        </p>
      </div>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_#e8eef5_0%,_#f4f6f9_55%)] p-3 sm:p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
