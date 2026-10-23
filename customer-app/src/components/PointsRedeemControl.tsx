"use client";

import {
  REDEEM_TIER_DRINK,
  REDEEM_TIER_SWIM,
} from "@/lib/points-redeem";

function formatVnd(n: number) {
  return `${new Intl.NumberFormat("vi-VN").format(n)}đ`;
}

/** Số ly cùng một món đổi điểm. Mỗi ly = 50 điểm. */
export function DrinkPointsRedeem({
  pointsBalance,
  orderQty,
  redeemQty,
  maxQty,
  unitPriceVnd,
  onChange,
}: {
  pointsBalance: number;
  orderQty: number;
  redeemQty: number;
  maxQty: number;
  unitPriceVnd: number;
  onChange: (qty: number) => void;
}) {
  const capped = redeemQty > 0 && redeemQty >= maxQty && maxQty < orderQty;
  const hint =
    redeemQty > 0
      ? `${redeemQty} ly · ${redeemQty * REDEEM_TIER_DRINK} điểm · −${formatVnd(redeemQty * unitPriceVnd)}${capped ? " · hết điểm" : ""}`
      : pointsBalance < REDEEM_TIER_DRINK
        ? `Cần ${REDEEM_TIER_DRINK} điểm · đang có ${pointsBalance}`
        : maxQty < 1
          ? "Không đủ điểm để đổi thêm"
          : "50 điểm mỗi ly";
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-oasis-ink">Đổi 50 điểm / ly</p>
        <p
          className={`text-[11px] ${redeemQty > 0 ? "font-semibold text-amber-800" : "text-oasis-mute"}`}
        >
          {hint}
        </p>
      </div>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-xl bg-oasis-sand font-bold disabled:opacity-40"
        onClick={() => onChange(redeemQty - 1)}
        disabled={redeemQty <= 0}
        aria-label="Bớt ly đổi điểm"
      >
        −
      </button>
      <span className="w-6 text-center font-bold">{redeemQty}</span>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-xl bg-oasis-deep font-bold text-oasis-sand disabled:opacity-40"
        onClick={() => onChange(redeemQty + 1)}
        disabled={redeemQty >= maxQty}
        aria-label="Thêm ly đổi điểm"
      >
        +
      </button>
    </div>
  );
}

/** Số vé cùng một loại đổi điểm. Mỗi vé = 100 điểm. */
export function TicketPointsRedeem({
  pointsBalance,
  orderQty,
  redeemQty,
  maxQty,
  unitPriceVnd,
  onChange,
}: {
  pointsBalance: number;
  orderQty: number;
  redeemQty: number;
  maxQty: number;
  unitPriceVnd: number;
  onChange: (qty: number) => void;
}) {
  const capped = redeemQty > 0 && redeemQty >= maxQty && maxQty < orderQty;
  const hint =
    redeemQty > 0
      ? `${redeemQty} vé · ${redeemQty * REDEEM_TIER_SWIM} điểm · −${formatVnd(redeemQty * unitPriceVnd)}${capped ? " · hết điểm" : ""}`
      : pointsBalance < REDEEM_TIER_SWIM
        ? `Cần ${REDEEM_TIER_SWIM} điểm · đang có ${pointsBalance}`
        : maxQty < 1
          ? "Không đủ điểm để đổi thêm"
          : "100 điểm mỗi vé";
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-oasis-ink">Đổi 100 điểm / vé</p>
        <p
          className={`text-[11px] ${redeemQty > 0 ? "font-semibold text-sky-900" : "text-oasis-mute"}`}
        >
          {hint}
        </p>
      </div>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-xl bg-oasis-sand font-bold disabled:opacity-40"
        onClick={() => onChange(redeemQty - 1)}
        disabled={redeemQty <= 0}
        aria-label="Bớt vé đổi điểm"
      >
        −
      </button>
      <span className="w-6 text-center font-bold">{redeemQty}</span>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-xl bg-oasis-deep font-bold text-oasis-sand disabled:opacity-40"
        onClick={() => onChange(redeemQty + 1)}
        disabled={redeemQty >= maxQty}
        aria-label="Thêm vé đổi điểm"
      >
        +
      </button>
    </div>
  );
}

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
