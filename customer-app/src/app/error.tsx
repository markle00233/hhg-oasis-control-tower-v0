"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-2xl font-semibold text-oasis-ink">Có lỗi xảy ra</p>
      <p className="mt-2 text-sm text-oasis-mute">
        Thường gặp khi đóng trang camera đang mở. Bấm thử lại.
      </p>
      {error?.message ? (
        <p className="mt-4 max-w-sm text-xs text-oasis-coral/90">{error.message}</p>
      ) : null}
      <div className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="h-12 rounded-2xl bg-oasis-deep px-6 text-sm font-bold text-oasis-sand"
        >
          Thử lại
        </button>
        <a href="/home" className="text-sm font-semibold text-oasis-moss underline">
          Về trang chủ
        </a>
        <a href="/login" className="text-sm font-semibold text-oasis-mute underline">
          Đăng nhập
        </a>
      </div>
    </main>
  );
}
