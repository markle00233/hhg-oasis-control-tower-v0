"use client";

import { useEffect, useState } from "react";
import type { HomeOffer } from "@/lib/home-services";
import { appliedVouchersLabel } from "@/lib/home-services";

function discountLabel(o: HomeOffer) {
  if (o.discountType === "amount" && o.discountVnd) {
    return `−${new Intl.NumberFormat("vi-VN").format(o.discountVnd)}đ`;
  }
  if (o.discountType === "percent" && o.discountPercent) {
    return `−${o.discountPercent}%`;
  }
  if (o.discountType === "perk") return "Quà / đặc quyền";
  return "";
}

/** Nút mở danh sách voucher (không nhập mã). */
export function VoucherApplyButton({
  appliedOffers,
  onOpen,
  onClear,
}: {
  appliedOffers?: HomeOffer[];
  /** @deprecated use appliedOffers */
  appliedTitle?: string | null;
  onOpen: () => void;
  onClear?: () => void;
}) {
  const title =
    appliedOffers && appliedOffers.length
      ? appliedVouchersLabel(appliedOffers)
      : null;
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onOpen}
        className={`h-9 min-w-0 flex-1 rounded-xl px-3 text-left text-xs font-bold ${
          title
            ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
            : "bg-oasis-sand text-oasis-ink"
        }`}
      >
        {title ? (
          <span className="block truncate">✓ {title}</span>
        ) : (
          "Áp dụng voucher"
        )}
      </button>
      {title && onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="h-9 shrink-0 rounded-xl border border-oasis-line px-2 text-[11px] font-bold text-oasis-mute"
        >
          Bỏ
        </button>
      ) : null}
    </div>
  );
}

/** Box list — chọn nhiều voucher rồi bấm Áp dụng. */
export function VoucherPickerModal({
  open,
  zoneLabel,
  vouchers,
  appliedIds,
  onApply,
  onClose,
}: {
  open: boolean;
  zoneLabel: string;
  vouchers: HomeOffer[];
  appliedIds?: string[];
  onApply: (offers: HomeOffer[]) => void;
  onClose: () => void;
}) {
  const [draftIds, setDraftIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) setDraftIds(appliedIds || []);
  }, [open, appliedIds]);

  if (!open) return null;

  function toggle(id: string) {
    setDraftIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function confirm() {
    const selected = vouchers.filter((v) => draftIds.includes(v.id));
    onApply(selected);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[78vh] w-full max-w-md flex-col overflow-hidden rounded-[24px] bg-white shadow-soft"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Chọn voucher"
      >
        <div className="flex items-start justify-between gap-3 border-b border-oasis-line/60 px-4 py-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-oasis-gold">
              Voucher khu vực
            </p>
            <h2 className="font-display text-xl font-semibold text-oasis-ink">
              {zoneLabel}
            </h2>
            <p className="mt-0.5 text-xs text-oasis-mute">
              Chọn nhiều voucher được phép dùng tại đây, rồi áp dụng.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-oasis-line px-3 py-1.5 text-sm font-semibold text-oasis-mute"
          >
            Đóng
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {vouchers.length === 0 ? (
            <p className="rounded-2xl bg-oasis-sand/60 px-4 py-6 text-center text-sm text-oasis-mute">
              Chưa có voucher nào dùng được ở khu này.
            </p>
          ) : (
            vouchers.map((o) => {
              const on = draftIds.includes(o.id);
              const disc = discountLabel(o);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className={`w-full rounded-2xl border p-3 text-left ${
                    on
                      ? "border-oasis-moss bg-emerald-50/80"
                      : "border-oasis-line/70 bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 text-xs font-black ${
                        on
                          ? "border-oasis-moss bg-oasis-moss text-white"
                          : "border-oasis-line bg-white text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    {o.image ? (
                      <div
                        className="h-14 w-14 shrink-0 rounded-xl bg-cover bg-center"
                        style={{ backgroundImage: `url('${o.image}')` }}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-oasis-ink">{o.title}</p>
                      <p className="mt-0.5 text-xs text-oasis-mute line-clamp-2">
                        {o.subtitle}
                      </p>
                      {o.sourceLabel ? (
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-oasis-gold">
                          {o.sourceLabel}
                        </p>
                      ) : null}
                      {disc ? (
                        <p className="mt-1 text-sm font-bold text-oasis-moss">
                          {disc}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-oasis-line/60 p-3">
          <button
            type="button"
            onClick={confirm}
            className="h-12 w-full rounded-2xl bg-oasis-deep text-sm font-bold text-oasis-sand"
          >
            {draftIds.length
              ? `Áp dụng ${draftIds.length} voucher`
              : "Bỏ chọn voucher"}
          </button>
        </div>
      </div>
    </div>
  );
}
