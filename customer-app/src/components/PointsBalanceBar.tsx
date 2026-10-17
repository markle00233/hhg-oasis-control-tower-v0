"use client";

/** Chip số điểm — hiện trên mọi trang phân khu. */
export function PointsBalanceBar({
  points,
  className = "",
}: {
  points: number | null | undefined;
  className?: string;
}) {
  if (points == null || Number.isNaN(points)) return null;
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-[18px] bg-white/90 px-4 py-3 shadow-soft ${className}`}
    >
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-oasis-mute">
          Điểm của bạn
        </p>
        <p className="mt-0.5 text-xs text-oasis-mute">
          Đổi tại quầy hoặc khi tạo QR · 50đ đồ uống / 100đ vé bơi
        </p>
      </div>
      <p className="shrink-0 font-display text-2xl font-semibold text-oasis-ink">
        {points}
        <span className="ml-1 text-sm font-bold text-oasis-mute">điểm</span>
      </p>
    </div>
  );
}
