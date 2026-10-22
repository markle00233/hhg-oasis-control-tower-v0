"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { OrderQrSuccess } from "@/components/OrderQrSuccess";
import {
  VoucherApplyButton,
  VoucherPickerModal,
} from "@/components/VoucherPicker";
import { PointsBalanceBar } from "@/components/PointsBalanceBar";
import { SwimLessonHome } from "@/components/SwimLessonHome";
import {
  PointsRedeemControl,
  TicketPointsRedeem,
} from "@/components/PointsRedeemControl";
import {
  applyOffersDiscount,
  HOME_SERVICES,
  type HomeOffer,
} from "@/lib/home-services";
import {
  formatPkgPriceShort,
  OLYMPIC_ACCESSORIES,
  OLYMPIC_MONTHLY,
  OLYMPIC_PACKAGES,
  SPA_CATEGORIES,
  SPA_MENU,
  VIP_AMENITIES,
  VIP_DEALS,
  VIP_PREPAID,
  type ServicePackage,
} from "@/lib/service-catalogs";
import {
  computeGuestPointsRedeem,
  isSwimTicketId,
  REDEEM_DRINK_MAX_VND,
} from "@/lib/points-redeem";
import {
  formatMembershipPayLabel,
  sameDayMembershipDiscountVnd,
  sameDayMembershipPriceVnd,
} from "@/lib/same-day-membership";

const META: Record<string, { title: string; body: string; accent: string }> = {
  OLYMPIC_POOL: {
    title: "Hồ Olympic",
    body: "Vé lẻ · Gói tháng (+ voucher HHG, −10% nếu đăng ký cùng ngày với đơn bơi) · Phụ kiện (từ 02 món −10%). Tích điểm: 10K trước giảm = 1 điểm.",
    accent: "#1e3a8a",
  },
  GYM: {
    title: "Gym",
    body: "Chọn gói → Áp voucher (nếu có) → tạo QR mang quầy.",
    accent: "#3730a3",
  },
  VIP_RESORT: {
    title: "VIP Resort",
    body: "Chọn tiện ích / ưu đãi / thẻ → có thể áp nhiều voucher → tạo QR.",
    accent: "#92400e",
  },
  SPA: {
    title: "Oasis Spa",
    body: "Chọn dịch vụ / gói (Giờ Vàng · Date · Family) · chỉnh số lượng · tạo QR mang quầy.",
    accent: "#9f1239",
  },
  LONG_NUONG: {
    title: "Lòng Nướng Chí Phèo",
    body: "Chọn set · chỉnh số lượng · tạo QR mang quầy.",
    accent: "#9a3412",
  },
};

const GYM_PACKAGES: ServicePackage[] = [
  {
    id: "gym-day",
    category: "gym",
    nameVi: "Vé ngày",
    priceVnd: 80_000,
    note: "Gym trong ngày",
  },
  {
    id: "gym-month",
    category: "gym",
    nameVi: "Gói tháng",
    priceVnd: 600_000,
    note: "30 ngày",
  },
];

const LONG_NUONG_PACKAGES: ServicePackage[] = [
  {
    id: "ln-set-a",
    category: "fnb",
    nameVi: "Set A",
    priceVnd: 199_000,
  },
  {
    id: "ln-set-b",
    category: "fnb",
    nameVi: "Set B",
    priceVnd: 299_000,
  },
  {
    id: "ln-set-c",
    category: "fnb",
    nameVi: "Set C",
    priceVnd: 399_000,
  },
];

type SelMap = Record<string, number>; // id → qty

function toggleId(prev: SelMap, id: string): SelMap {
  const next = { ...prev };
  if (next[id]) delete next[id];
  else next[id] = 1;
  return next;
}

function setQty(prev: SelMap, id: string, qty: number): SelMap {
  const next = { ...prev };
  const q = Math.max(0, Math.min(20, qty));
  if (q <= 0) delete next[id];
  else next[id] = q;
  return next;
}

function PackageCard({
  p,
  selected,
  qty,
  onToggle,
  onQty,
  showQty,
  disabled,
  appliedOffers,
  onOpenVoucher,
  onClearVoucher,
  pointsBalance,
  redeemTier,
  canRedeem50,
  canRedeem100,
  onRedeemChange,
  sameDaySaleVnd,
  ticketRedeemQty,
  ticketRedeemMax,
  onTicketRedeem,
}: {
  p: ServicePackage;
  selected: boolean;
  qty: number;
  onToggle: () => void;
  onQty: (n: number) => void;
  showQty?: boolean;
  disabled?: boolean;
  appliedOffers?: HomeOffer[];
  onOpenVoucher?: () => void;
  onClearVoucher?: () => void;
  pointsBalance?: number;
  redeemTier?: 50 | 100 | null;
  canRedeem50?: boolean;
  canRedeem100?: boolean;
  onRedeemChange?: (tier: 50 | 100 | null) => void;
  sameDaySaleVnd?: number | null;
  ticketRedeemQty?: number;
  ticketRedeemMax?: number;
  onTicketRedeem?: (qty: number) => void;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[24px] bg-white shadow-soft ring-offset-2 ${
        selected ? "ring-2 ring-oasis-deep" : ""
      } ${disabled ? "opacity-55" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="w-full text-left disabled:cursor-not-allowed"
      >
        {p.image ? (
          <div
            className="h-32 w-full bg-cover bg-center"
            style={{ backgroundImage: `url('${p.image}')` }}
          />
        ) : null}
        <div className="flex items-start gap-3 p-4">
          <span
            className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 text-xs font-black ${
              selected
                ? "border-oasis-deep bg-oasis-deep text-oasis-sand"
                : "border-oasis-line bg-white text-transparent"
            }`}
          >
            ✓
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold text-oasis-ink">
                  {p.nameVi}
                </p>
                {p.nameEn ? (
                  <p className="text-xs text-oasis-mute">{p.nameEn}</p>
                ) : null}
              </div>
              <p className="shrink-0 text-right font-mono text-lg font-bold text-oasis-moss">
                {sameDaySaleVnd != null && sameDaySaleVnd < p.priceVnd ? (
                  <>
                    <span className="mr-1 text-sm font-medium text-oasis-mute line-through">
                      {formatPkgPriceShort(p)}
                    </span>
                    {formatMembershipPayLabel(sameDaySaleVnd)}
                  </>
                ) : (
                  formatPkgPriceShort(p)
                )}
              </p>
            </div>
            {p.durationMin ? (
              <p className="mt-1 text-sm text-oasis-mute">
                {p.durationMin >= 60 && p.durationMin % 60 === 0
                  ? `${p.durationMin / 60} giờ`
                  : `${p.durationMin} phút`}
              </p>
            ) : null}
            {p.note ? (
              <p className="mt-1 text-xs font-semibold text-oasis-mute">{p.note}</p>
            ) : null}
            {p.includes?.length ? (
              <ul className="mt-2 space-y-0.5 text-xs text-oasis-mute">
                {p.includes.map((line) => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </button>
      {selected && (onOpenVoucher || showQty || onRedeemChange || onTicketRedeem) ? (
        <div className="space-y-2 border-t border-oasis-line/50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
          {onOpenVoucher ? (
            <VoucherApplyButton
              appliedOffers={appliedOffers}
              onOpen={onOpenVoucher}
              onClear={onClearVoucher}
            />
          ) : null}
          {showQty ? (
            <div
              className={`flex items-center gap-2 ${onOpenVoucher ? "ml-auto" : ""}`}
            >
              <span className="text-xs font-semibold text-oasis-mute">
                Số lượng
              </span>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-xl bg-oasis-sand font-bold"
                onClick={() => onQty(qty - 1)}
              >
                −
              </button>
              <span className="w-6 text-center font-bold">{qty}</span>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-xl bg-oasis-deep text-oasis-sand font-bold"
                onClick={() => onQty(qty + 1)}
              >
                +
              </button>
            </div>
          ) : null}
          </div>
          {onRedeemChange ? (
            <PointsRedeemControl
              pointsBalance={pointsBalance ?? 0}
              redeemTier={redeemTier ?? null}
              canRedeem50={!!canRedeem50}
              canRedeem100={!!canRedeem100}
              onChange={onRedeemChange}
            />
          ) : null}
          {onTicketRedeem ? (
            <TicketPointsRedeem
              pointsBalance={pointsBalance ?? 0}
              orderQty={qty}
              redeemQty={ticketRedeemQty ?? 0}
              maxQty={ticketRedeemMax ?? 0}
              unitPriceVnd={p.priceVnd}
              onChange={onTicketRedeem}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ServiceInfoPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const router = useRouter();
  const { code: raw } = use(params);
  const code = decodeURIComponent(raw).toUpperCase();

  useEffect(() => {
    if (code === "SAUNA" || code === "JACUZZI") {
      router.replace("/services/VIP_RESORT");
    }
    if (code === "RESORT_POOL") {
      router.replace("/services/GYM");
    }
    if (code === "CHI_PHEO") {
      router.replace("/services/LONG_NUONG");
    }
  }, [code, router]);

  const homeMeta = HOME_SERVICES.find((s) => s.code === code);
  const meta = META[code] || {
    title: homeMeta?.name || code,
    body: "Dịch vụ Oasis.",
    accent: homeMeta?.fg || "#0b1220",
  };

  const [spaCat, setSpaCat] = useState(
    SPA_CATEGORIES.find((c) => c.id === "gio-vang")?.id ||
      SPA_CATEGORIES[0]?.id ||
      "goi-duong"
  );
  const [selected, setSelected] = useState<SelMap>({});
  const [amenitySel, setAmenitySel] = useState<Record<string, boolean>>({});
  const [showQr, setShowQr] = useState(false);
  const [cartToken, setCartToken] = useState("");
  const [cartStatus, setCartStatus] = useState("PENDING_APPROVAL");
  const [cartPayload, setCartPayload] = useState<string | null>(null);
  const [cartCustomer, setCartCustomer] = useState<{
    fullName?: string;
    customerCode?: string;
  }>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [walletOffers, setWalletOffers] = useState<HomeOffer[]>([]);
  const [appliedOffers, setAppliedOffers] = useState<HomeOffer[]>([]);
  const [voucherPickerOpen, setVoucherPickerOpen] = useState(false);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [redeemTier, setRedeemTier] = useState<50 | 100 | null>(null);
  const [ticketRedeem, setTicketRedeem] = useState<Record<string, number>>({});
  const [membershipLocked, setMembershipLocked] = useState(false);
  const [membershipExpiresLabel, setMembershipExpiresLabel] = useState<
    string | null
  >(null);
  const [sameDayMembership, setSameDayMembership] = useState(false);
  const [profile, setProfile] = useState<{
    fullName: string;
    phone: string;
  } | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");

  const orderQtyOnly = code === "SPA" || code === "LONG_NUONG";

  useEffect(() => {
    if (orderQtyOnly) return;
    let cancelled = false;
    (async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      if (me.ok) {
        const md = await me.json();
        if (!cancelled && md.authenticated) {
          setPointsBalance(Number(md.customer?.pointsBalance) || 0);
          setMembershipLocked(!!md.customer?.membershipLocked || !!md.customer?.vip);
          setMembershipExpiresLabel(md.customer?.vipExpiresLabel || null);
          setSameDayMembership(!!md.customer?.sameDayMembershipDiscount);
          const fullName = String(md.customer?.fullName || "").trim();
          const phone = String(md.customer?.phone || "").trim();
          setDraftName(fullName);
          setDraftPhone(phone);
          if (fullName && phone) setProfile({ fullName, phone });
        }
      }
      const res = await fetch("/api/me/offers", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (cancelled) return;
      const wallet = Array.isArray(data.wallet) ? data.wallet : [];
      const zoneAliases =
        code === "SPA" || code === "SAUNA"
          ? ["SPA", "SAUNA"]
          : code === "LONG_NUONG" || code === "CHI_PHEO"
            ? ["LONG_NUONG", "CHI_PHEO"]
            : [code];
      const zoneOffers = wallet.filter((o: HomeOffer) =>
        zoneAliases.includes(String(o.zoneCode || "").toUpperCase())
      );
      setWalletOffers(zoneOffers);
      const fromUrl =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("voucher")
          : null;
      if (fromUrl) {
        const hit = zoneOffers.find((o: HomeOffer) => o.id === fromUrl);
        if (hit) setAppliedOffers([hit]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, orderQtyOnly]);

  const allCatalog = useMemo(() => {
    if (code === "OLYMPIC_POOL")
      return [...OLYMPIC_PACKAGES, ...OLYMPIC_MONTHLY, ...OLYMPIC_ACCESSORIES];
    if (code === "SPA") return SPA_MENU;
    if (code === "VIP_RESORT") return [...VIP_DEALS, ...VIP_PREPAID];
    if (code === "GYM") return GYM_PACKAGES;
    if (code === "LONG_NUONG") return LONG_NUONG_PACKAGES;
    return [];
  }, [code]);

  const spaItems = useMemo(
    () => SPA_MENU.filter((p) => p.category === spaCat),
    [spaCat]
  );

  const selectedPkgs = useMemo(() => {
    return allCatalog
      .filter((p) => selected[p.id])
      .map((p) => ({ pkg: p, qty: selected[p.id] || 1 }));
  }, [allCatalog, selected]);

  const selectedAmenities = useMemo(
    () => VIP_AMENITIES.filter((a) => amenitySel[a.id]),
    [amenitySel]
  );

  const accessoryIds = useMemo(
    () => new Set(OLYMPIC_ACCESSORIES.map((p) => p.id)),
    []
  );

  const accessoryQty = useMemo(() => {
    let n = 0;
    for (const { pkg, qty } of selectedPkgs) {
      if (accessoryIds.has(pkg.id)) n += qty;
    }
    return n;
  }, [selectedPkgs, accessoryIds]);

  const accessorySubtotal = useMemo(() => {
    let s = 0;
    for (const { pkg, qty } of selectedPkgs) {
      if (accessoryIds.has(pkg.id)) s += pkg.priceVnd * qty;
    }
    return s;
  }, [selectedPkgs, accessoryIds]);

  /** Mua ≥2 phụ kiện → −10% phần phụ kiện (trước voucher). */
  const accessoryAutoDiscount =
    code === "OLYMPIC_POOL" && accessoryQty >= 2
      ? Math.round(accessorySubtotal * 0.1)
      : 0;

  const membershipSubtotal = useMemo(() => {
    let s = 0;
    for (const { pkg, qty } of selectedPkgs) {
      if (/^oly-\d+m$/i.test(pkg.id)) s += pkg.priceVnd * qty;
    }
    return s;
  }, [selectedPkgs]);

  const membershipAutoDiscount =
    code === "OLYMPIC_POOL" && sameDayMembership
      ? sameDayMembershipDiscountVnd(membershipSubtotal)
      : 0;

  const subtotalVnd = useMemo(() => {
    let s = 0;
    for (const { pkg, qty } of selectedPkgs) {
      s += pkg.priceVnd * qty;
    }
    return s;
  }, [selectedPkgs]);

  const afterAccessoryVnd = Math.max(
    0,
    subtotalVnd - accessoryAutoDiscount - membershipAutoDiscount
  );

  const priced = useMemo(
    () => applyOffersDiscount(afterAccessoryVnd, appliedOffers),
    [afterAccessoryVnd, appliedOffers]
  );

  const redeemItems = useMemo(
    () =>
      selectedPkgs.map(({ pkg, qty }) => ({
        id: pkg.id,
        priceVnd: pkg.priceVnd,
        qty,
        redeemQty: isSwimTicketId(pkg.id) ? ticketRedeem[pkg.id] || 0 : 0,
      })),
    [selectedPkgs, ticketRedeem]
  );
  const swimRedeemUnits = redeemItems.reduce(
    (n, i) => n + (isSwimTicketId(i.id) ? i.redeemQty : 0),
    0
  );
  const canRedeem50 =
    pointsBalance >= 50 &&
    redeemItems.some((i) => i.priceVnd > 0 && i.priceVnd <= REDEEM_DRINK_MAX_VND);
  const canRedeem100 = false;
  const redeemPreview =
    swimRedeemUnits > 0
      ? computeGuestPointsRedeem({
          zoneCode: code,
          tier: 100,
          items: redeemItems,
        })
      : redeemTier
        ? computeGuestPointsRedeem({
            zoneCode: code,
            tier: redeemTier,
            items: redeemItems,
          })
        : null;
  const pointsDiscount = redeemPreview?.ok ? redeemPreview.discountVnd : 0;
  const totalVnd = Math.max(0, priced.totalVnd - pointsDiscount);
  const totalDiscountVnd =
    accessoryAutoDiscount +
    membershipAutoDiscount +
    priced.discountVnd +
    pointsDiscount;

  const voucherField = {
    appliedOffers,
    onOpenVoucher: () => setVoucherPickerOpen(true),
    onClearVoucher: () => setAppliedOffers([]),
    pointsBalance,
    redeemTier,
    canRedeem50,
    canRedeem100,
    onRedeemChange: setRedeemTier,
  };

  const count =
    selectedPkgs.reduce((n, x) => n + x.qty, 0) + selectedAmenities.length;

  const detailLines = useMemo(() => {
    const lines: string[] = [meta.title];
    for (const a of selectedAmenities) {
      lines.push(`· ${a.nameVi}`);
    }
    for (const { pkg, qty } of selectedPkgs) {
      const price =
        pkg.priceVnd > 0
          ? ` · ${formatPkgPriceShort(pkg)}${qty > 1 ? ` ×${qty}` : ""}`
          : qty > 1
            ? ` ×${qty}`
            : "";
      lines.push(`· ${pkg.nameVi}${price}`);
    }
    if (accessoryAutoDiscount > 0) {
      lines.push(
        `Phụ kiện −10% (−${new Intl.NumberFormat("vi-VN").format(accessoryAutoDiscount)}đ)`
      );
    }
    if (membershipAutoDiscount > 0) {
      lines.push(
        `Gói tháng −10% cùng ngày đơn bơi (−${new Intl.NumberFormat("vi-VN").format(membershipAutoDiscount)}đ)`
      );
    }
    for (const line of priced.lines) {
      if (line.discountVnd > 0) {
        lines.push(
          `Voucher ${line.offer.title} −${new Intl.NumberFormat("vi-VN").format(line.discountVnd)}đ`
        );
      } else if (line.offer.discountType === "perk") {
        lines.push(`Voucher ${line.offer.title}`);
      }
    }
    if ((swimRedeemUnits > 0 || redeemTier) && pointsDiscount > 0) {
      const pointCost = swimRedeemUnits > 0 ? swimRedeemUnits * 100 : redeemTier;
      lines.push(
        `Đổi ${pointCost} điểm −${new Intl.NumberFormat("vi-VN").format(pointsDiscount)}đ`
      );
    }
    if (totalVnd > 0 || subtotalVnd > 0) {
      lines.push(
        `Tổng ~ ${new Intl.NumberFormat("vi-VN").format(totalVnd)}đ`
      );
    }
    return lines;
  }, [
    meta.title,
    selectedAmenities,
    selectedPkgs,
    totalVnd,
    subtotalVnd,
    priced.lines,
    accessoryAutoDiscount,
    membershipAutoDiscount,
    redeemTier,
    swimRedeemUnits,
    pointsDiscount,
  ]);

  const profileReady = !!(profile?.fullName && profile?.phone);
  const profileSaved =
    profileReady &&
    draftName.trim() === profile?.fullName &&
    draftPhone.trim() === profile?.phone;
  const selectedMonthly = selectedPkgs.some(({ pkg }) =>
    /^oly-\d+m$/i.test(pkg.id)
  );

  async function saveProfile(): Promise<{ fullName: string; phone: string } | null> {
    setProfileBusy(true);
    setProfileError("");
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: draftName.trim(),
          phone: draftPhone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không lưu được hồ sơ");
      const next = {
        fullName: String(data.customer?.fullName || draftName).trim(),
        phone: String(data.customer?.phone || draftPhone).trim(),
      };
      setProfile(next);
      setDraftName(next.fullName);
      setDraftPhone(next.phone);
      return next;
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Lưu hồ sơ thất bại");
      return null;
    } finally {
      setProfileBusy(false);
    }
  }

  async function createCartQr() {
    if (count < 1 || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      let guestFullName = draftName.trim() || profile?.fullName || "";
      let guestPhone = draftPhone.trim() || profile?.phone || "";
      if (selectedMonthly) {
        if (guestFullName.length < 2 || guestPhone.length < 9) {
          const message =
            "Nhập họ tên và số điện thoại dưới gói tháng trước khi gửi.";
          setProfileError(message);
          throw new Error(message);
        }
        if (!profileSaved) {
          const saved = await saveProfile();
          if (!saved) return;
          guestFullName = saved.fullName;
          guestPhone = saved.phone;
        }
      }
      const items = [
        ...selectedAmenities.map((a) => ({
          id: a.id,
          nameVi: a.nameVi,
          qty: 1,
          priceVnd: 0,
          note: a.blurb,
        })),
        ...selectedPkgs.map(({ pkg, qty }) => ({
          id: pkg.id,
          nameVi: pkg.nameVi,
          qty,
          priceVnd: pkg.priceVnd,
          note: pkg.note,
          ...(isSwimTicketId(pkg.id) && (ticketRedeem[pkg.id] || 0) > 0
            ? { pointsRedeemQty: ticketRedeem[pkg.id] }
            : {}),
        })),
      ];
      if (swimRedeemUnits > 0) {
        const check = computeGuestPointsRedeem({
          zoneCode: code,
          tier: 100,
          items: redeemItems,
        });
        if (!check.ok) throw new Error(check.error || "Không đổi điểm được");
      } else if (redeemTier) {
        const check = computeGuestPointsRedeem({
          zoneCode: code,
          tier: redeemTier,
          items: redeemItems,
        });
        if (!check.ok) throw new Error(check.error || "Không đổi điểm được");
      }
      const res = await fetch("/api/me/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          zoneCode: code,
          zoneName: meta.title,
          items,
          offerIds: appliedOffers.map((o) => o.id),
          discountVnd: accessoryAutoDiscount + priced.discountVnd,
          pointsRedeemTier: swimRedeemUnits > 0 ? 100 : redeemTier,
          ...(swimRedeemUnits > 0 ? { pointsRedeemUnits: swimRedeemUnits } : {}),
          ...(selectedMonthly
            ? { guestFullName, guestPhone }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không gửi được yêu cầu");
      if (typeof data.pointsBalance === "number") {
        setPointsBalance(data.pointsBalance);
      }
      setCartToken(data.cart?.token || "");
      setCartStatus(data.cart?.status || "PENDING_APPROVAL");
      setCartPayload(data.payload || null);
      setCartCustomer(data.customer || {});
      setShowQr(true);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Lỗi gửi yêu cầu");
    } finally {
      setCreating(false);
    }
  }

  if (showQr && cartToken && count > 0) {
    return (
      <Shell showNav={false}>
        <OrderQrSuccess
          title="Đã duyệt — mã QR dịch vụ"
          subtitle="QR mang toàn bộ dịch vụ đã chọn — đưa nhân viên quét."
          detailLines={detailLines}
          cartToken={cartToken}
          initialStatus={cartStatus}
          payload={cartPayload}
          customerName={cartCustomer.fullName}
          customerCode={cartCustomer.customerCode}
          onDone={() => {
            setShowQr(false);
            setCartToken("");
            setCartPayload(null);
            setSelected({});
            setAmenitySel({});
          }}
        />
      </Shell>
    );
  }

  const createBar = count > 0 && (
    <div className="space-y-2">
      {createError ? (
        <p className="text-sm font-semibold text-oasis-coral">{createError}</p>
      ) : null}
      <div className="flex items-center gap-3 rounded-[22px] bg-oasis-ink p-3 text-oasis-sand shadow-soft">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-lime-300/90">
            Đã chọn — QR mang tất cả
          </p>
          <p className="mt-0.5 font-bold">
            {count} mục
            {subtotalVnd > 0
              ? ` · ~${new Intl.NumberFormat("vi-VN").format(totalVnd)}đ`
              : ""}
            {totalDiscountVnd > 0
              ? ` (−${new Intl.NumberFormat("vi-VN").format(totalDiscountVnd)}đ)`
              : ""}
          </p>
        </div>
        <button
          type="button"
          disabled={creating}
          onClick={() => void createCartQr()}
          className="h-12 shrink-0 rounded-2xl bg-lime-300 px-5 font-bold text-[#0b1220] disabled:opacity-50"
        >
          {creating ? "…" : "Gửi yêu cầu"}
        </button>
      </div>
    </div>
  );

  /** Sit above BottomNav (z-50), not under it */
  const stickyBar = count > 0 && (
    <div className="fixed inset-x-0 z-[60] border-t border-oasis-line/60 bg-white/95 px-4 pt-3 backdrop-blur pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-lg">{createBar}</div>
    </div>
  );

  return (
    <Shell>
      <div className={`animate-rise space-y-5 ${count > 0 ? "pb-36" : ""}`}>
        <Link href="/home" className="text-sm font-semibold text-oasis-mute">
          ← Home
        </Link>

        <div
          className="overflow-hidden rounded-[28px] p-6 text-white shadow-soft"
          style={{ background: meta.accent }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">
            Dịch vụ · chọn nhiều
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold">
            {meta.title}
          </h1>
          <p className="mt-3 text-sm text-white/80">{meta.body}</p>
          {code === "SPA" || code === "VIP_RESORT" ? (
            <p className="mt-2 text-xs text-white/60">Hotline Spa 0919 430 553</p>
          ) : null}
        </div>

        {orderQtyOnly ? null : <PointsBalanceBar points={pointsBalance} />}

        {code === "OLYMPIC_POOL" ? (
          <>
            <section className="space-y-3">
              <h2 className="font-display text-xl font-semibold text-oasis-ink">
                Vé lẻ
              </h2>
              {OLYMPIC_PACKAGES.map((p) => {
                const orderQty = selected[p.id] || 1;
                const otherUnits = Object.entries(ticketRedeem).reduce(
                  (n, [id, q]) => (id === p.id ? n : n + (q || 0)),
                  0
                );
                const redeemMax = Math.min(
                  orderQty,
                  Math.max(0, Math.floor(pointsBalance / 100) - otherUnits)
                );
                return (
                  <PackageCard
                    key={p.id}
                    p={p}
                    selected={!!selected[p.id]}
                    qty={orderQty}
                    showQty
                    {...voucherField}
                    canRedeem100={false}
                    onRedeemChange={undefined}
                    ticketRedeemQty={selected[p.id] ? ticketRedeem[p.id] || 0 : 0}
                    ticketRedeemMax={selected[p.id] ? redeemMax : 0}
                    onTicketRedeem={(n) =>
                      setTicketRedeem((prev) => {
                        const next = Math.max(0, Math.min(redeemMax, n));
                        return { ...prev, [p.id]: next };
                      })
                    }
                    onToggle={() => {
                      setSelected((s) => toggleId(s, p.id));
                      setTicketRedeem((prev) => ({ ...prev, [p.id]: 0 }));
                    }}
                    onQty={(n) => {
                      const q = Math.max(0, Math.min(20, n));
                      setSelected((s) => setQty(s, p.id, n));
                      setTicketRedeem((prev) => ({
                        ...prev,
                        [p.id]: Math.min(prev[p.id] || 0, q),
                      }));
                    }}
                  />
                );
              })}
            </section>
            <SwimLessonHome showBanner={false} />
            <section className="space-y-3">
              <h2 className="font-display text-xl font-semibold text-oasis-ink">
                Gói tháng + quyền lợi
              </h2>
              <p className="text-xs text-oasis-mute">
                {membershipLocked
                  ? `Đang dùng gói hội viên${
                      membershipExpiresLabel
                        ? ` đến ${membershipExpiresLabel}`
                        : ""
                    }. Hết hạn mới chọn gói mới.`
                  : "1 gói / lần · hết hạn về khách thường mới chọn tiếp. Kèm voucher HHG (LN, Mía Ơi, Spa…). Đã bơi hôm nay rồi đăng ký gói → −10%."}
              </p>
              {OLYMPIC_MONTHLY.map((p) => (
                <PackageCard
                  key={p.id}
                  p={p}
                  selected={!!selected[p.id]}
                  qty={selected[p.id] || 1}
                  showQty={false}
                  disabled={membershipLocked}
                  sameDaySaleVnd={
                    sameDayMembership
                      ? sameDayMembershipPriceVnd(p.priceVnd)
                      : null
                  }
                  {...voucherField}
                  onToggle={() => {
                    if (membershipLocked) return;
                    setSelected((s) => toggleId(s, p.id));
                  }}
                  onQty={(n) => setSelected((s) => setQty(s, p.id, n))}
                />
              ))}
            </section>
            {!membershipLocked ? (
              <div className="space-y-2 rounded-[22px] bg-white p-4 shadow-soft">
                <p className="text-sm font-semibold text-oasis-ink">
                  Nhập họ tên + SĐT trước khi Upgrade
                </p>
                <p className="text-xs text-oasis-mute">
                  Quầy cần thấy đúng tên, ID và số điện thoại trên yêu cầu duyệt.
                </p>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Họ và tên"
                  className="h-11 w-full rounded-2xl border border-oasis-ink/10 bg-white px-3 text-sm outline-none focus:border-oasis-moss"
                />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={draftPhone}
                  onChange={(e) => setDraftPhone(e.target.value)}
                  placeholder="Số điện thoại"
                  className="h-11 w-full rounded-2xl border border-oasis-ink/10 bg-white px-3 text-sm outline-none focus:border-oasis-moss"
                />
                <button
                  type="button"
                  disabled={
                    profileBusy ||
                    profileSaved ||
                    !draftName.trim() ||
                    !draftPhone.trim()
                  }
                  onClick={() => void saveProfile()}
                  className="h-11 w-full rounded-2xl bg-oasis-moss text-sm font-bold text-white disabled:opacity-50"
                >
                  {profileBusy ? "…" : profileSaved ? "Đã lưu hồ sơ" : "Lưu hồ sơ"}
                </button>
                {profileError ? (
                  <p className="text-sm font-semibold text-oasis-coral">{profileError}</p>
                ) : null}
              </div>
            ) : null}
            <section className="space-y-3">
              <h2 className="font-display text-xl font-semibold text-oasis-ink">
                Phụ kiện
              </h2>
              <p className="text-xs text-oasis-mute">
                Mua từ 02 món phụ kiện → tự giảm 10% phần phụ kiện trước khi tạo
                QR
                {accessoryAutoDiscount > 0
                  ? ` · đang −${new Intl.NumberFormat("vi-VN").format(accessoryAutoDiscount)}đ`
                  : ""}
                .
              </p>
              {OLYMPIC_ACCESSORIES.map((p) => (
                <PackageCard
                  key={p.id}
                  p={p}
                  selected={!!selected[p.id]}
                  qty={selected[p.id] || 1}
                  showQty
                  {...voucherField}
                  onToggle={() => setSelected((s) => toggleId(s, p.id))}
                  onQty={(n) => setSelected((s) => setQty(s, p.id, n))}
                />
              ))}
            </section>
          </>
        ) : null}

        {code === "GYM" || code === "LONG_NUONG" ? (
          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold text-oasis-ink">
              {code === "GYM" ? "Gói Gym" : "Set · multiple choice"}
            </h2>
            {(code === "GYM" ? GYM_PACKAGES : LONG_NUONG_PACKAGES).map((p) => (
              <PackageCard
                key={p.id}
                p={p}
                selected={!!selected[p.id]}
                qty={selected[p.id] || 1}
                showQty
                {...(code === "LONG_NUONG" ? {} : voucherField)}
                onToggle={() => setSelected((s) => toggleId(s, p.id))}
                onQty={(n) => setSelected((s) => setQty(s, p.id, n))}
              />
            ))}
          </section>
        ) : null}

        {code === "SPA" ? (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {SPA_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSpaCat(c.id)}
                  className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold ${
                    spaCat === c.id
                      ? "bg-oasis-deep text-oasis-sand"
                      : "bg-white/80 text-oasis-mute"
                  }`}
                >
                  {c.nameVi}
                </button>
              ))}
            </div>
            <p className="text-xs text-oasis-mute">
              Tick nhiều mục — giữ lựa chọn khi đổi tab. Đã chọn:{" "}
              <strong>{Object.keys(selected).length}</strong>
            </p>
            <section className="space-y-3">
              <h2 className="font-display text-xl font-semibold text-oasis-ink">
                {SPA_CATEGORIES.find((c) => c.id === spaCat)?.nameVi}
              </h2>
              {spaItems.map((p) => (
                <PackageCard
                  key={p.id}
                  p={p}
                  selected={!!selected[p.id]}
                  qty={selected[p.id] || 1}
                  showQty={p.priceVnd > 0 && p.category !== "the"}
                  onToggle={() => setSelected((s) => toggleId(s, p.id))}
                  onQty={(n) => setSelected((s) => setQty(s, p.id, n))}
                />
              ))}
            </section>
          </>
        ) : null}

        {code === "VIP_RESORT" ? (
          <>
            <section className="space-y-3">
              <h2 className="font-display text-xl font-semibold text-oasis-ink">
                Tiện ích VIP · chọn nhiều
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {VIP_AMENITIES.map((a) => {
                  const on = !!amenitySel[a.id];
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() =>
                        setAmenitySel((prev) => ({
                          ...prev,
                          [a.id]: !prev[a.id],
                        }))
                      }
                      className={`rounded-[22px] p-4 text-left shadow-soft ring-offset-2 ${
                        on ? "ring-2 ring-oasis-deep" : ""
                      }`}
                      style={{ background: a.bg, color: a.fg }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black tracking-wide">
                          {a.mark}
                        </span>
                        <span
                          className={`grid h-5 w-5 place-items-center rounded border-2 text-[10px] font-black ${
                            on
                              ? "border-current bg-current text-white"
                              : "border-current/40"
                          }`}
                        >
                          {on ? "✓" : ""}
                        </span>
                      </div>
                      <p className="mt-2 font-display text-lg font-semibold">
                        {a.nameVi}
                      </p>
                      <p className="mt-1 text-xs opacity-80">{a.blurb}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-xl font-semibold text-oasis-ink">
                Quà / ưu đãi
              </h2>
              {VIP_DEALS.map((p) => (
                <PackageCard
                  key={p.id}
                  p={p}
                  selected={!!selected[p.id]}
                  qty={selected[p.id] || 1}
                  showQty
                  {...voucherField}
                  onToggle={() => setSelected((s) => toggleId(s, p.id))}
                  onQty={(n) => setSelected((s) => setQty(s, p.id, n))}
                />
              ))}
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-xl font-semibold text-oasis-ink">
                Thẻ trả trước
              </h2>
              {VIP_PREPAID.map((p) => (
                <PackageCard
                  key={p.id}
                  p={p}
                  selected={!!selected[p.id]}
                  qty={selected[p.id] || 1}
                  showQty
                  {...voucherField}
                  onToggle={() => setSelected((s) => toggleId(s, p.id))}
                  onQty={(n) => setSelected((s) => setQty(s, p.id, n))}
                />
              ))}
            </section>
          </>
        ) : null}

        {!["OLYMPIC_POOL", "SPA", "VIP_RESORT", "GYM", "LONG_NUONG"].includes(
          code
        ) ? (
          <Link
            href="/qr"
            className="flex h-14 items-center justify-center rounded-2xl bg-oasis-deep text-base font-bold text-oasis-sand"
          >
            Hiện My Oasis QR
          </Link>
        ) : (
          <>
            {/* Inline CTA — luôn thấy khi scroll hết list (không phụ thuộc sticky) */}
            {createBar}
            <Link
              href="/account"
              className="block pb-2 text-center text-sm font-semibold text-oasis-mute"
            >
              Chưa dùng liền → trang cá nhân
            </Link>
          </>
        )}
      </div>
      {stickyBar}
      <VoucherPickerModal
        open={voucherPickerOpen}
        zoneLabel={meta.title}
        vouchers={walletOffers}
        appliedIds={appliedOffers.map((o) => o.id)}
        onApply={(offers) => setAppliedOffers(offers)}
        onClose={() => setVoucherPickerOpen(false)}
      />
    </Shell>
  );
}
