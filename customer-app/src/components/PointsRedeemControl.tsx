"use client";

import {
  REDEEM_TIER_DRINK,
  REDEEM_TIER_SWIM,
} from "@/lib/points-redeem";

/** Nút đổi điểm cạnh voucher — chọn 50 / 100 rồi gửi QR cho NV xác nhận. */
export function PointsRedeemControl({
  pointsBalance,
  redeemTier,
  canRedeem50,
  canRedeem100,
  onChange,
}: {
  pointsBalance: number;
  redeemTier: 50 | 100 | null;
  canRedeem50: boolean;
  canRedeem100: boolean;
  onChange: (tier: 50 | 100 | null) => void;
}) {
  const none = !canRedeem50 && !canRedeem100;
  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canRedeem50}
          onClick={() =>
            onChange(redeemTier === REDEEM_TIER_DRINK ? null : REDEEM_TIER_DRINK)
          }
          className={`h-9 rounded-xl px-3 text-xs font-bold disabled:opacity-40 ${
            redeemTier === REDEEM_TIER_DRINK
              ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
              : "bg-oasis-sand text-oasis-ink"
          }`}
        >
          {redeemTier === REDEEM_TIER_DRINK
            ? "✓ Đổi 50 điểm"
            : `Đổi 50 điểm${pointsBalance < 50 ? ` (cần 50)` : ""}`}
        </button>
        <button
          type="button"
          disabled={!canRedeem100}
          onClick={() =>
            onChange(redeemTier === REDEEM_TIER_SWIM ? null : REDEEM_TIER_SWIM)
          }
          className={`h-9 rounded-xl px-3 text-xs font-bold disabled:opacity-40 ${
            redeemTier === REDEEM_TIER_SWIM
              ? "bg-sky-100 text-sky-900 ring-1 ring-sky-300"
              : "bg-oasis-sand text-oasis-ink"
          }`}
        >
          {redeemTier === REDEEM_TIER_SWIM
            ? "✓ Đổi 100 điểm"
            : `Đổi 100 điểm${pointsBalance < 100 ? ` (cần 100)` : ""}`}
        </button>
      </div>
      {none ? (
        <p className="text-[11px] text-oasis-mute">
          Bạn đang có <strong>{pointsBalance}</strong> điểm. Đổi 50đ khi có món ≤50k
          (Mía Ơi) · Đổi 100đ khi chọn vé bơi (Hồ Olympic).
        </p>
      ) : redeemTier ? (
        <p className="text-[11px] font-semibold text-amber-800">
          Đã chọn đổi {redeemTier} điểm — trừ ngay khi tạo QR, quầy duyệt để xác
          nhận.
        </p>
      ) : null}
    </div>
  );
}
