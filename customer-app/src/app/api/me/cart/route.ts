import { NextRequest, NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import {
  CART_STATUS,
  createServiceCart,
  serviceCartQrPayload,
  type CartItemInput,
} from "@/lib/service-cart";
import { parseCartTableRef } from "@/lib/long-nuong";
import {
  computeGuestPointsRedeem,
  redeemPoints,
  settlePointsOnCancel,
} from "@/lib/points";
import { prisma } from "@/lib/prisma";
import { isStaffScanVoucher } from "@/lib/voucher-pass";
import { bookingIdsInItems, relabelItemNames } from "@/lib/vn-time";
import {
  officialOlympicOrderItem,
  olympicOrderQtyLocked,
} from "@/lib/service-catalogs";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

function parseVoucherOfferIds(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as { id?: string }).id || "");
    if (id.startsWith("voucher-")) {
      return id
        .slice("voucher-".length)
        .split("+")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const note = String((row as { note?: string }).note || "");
    const fromNote = note.match(/hhg-oly-[\w-]+/g);
    if (fromNote?.length) return Array.from(new Set(fromNote));
  }
  return [];
}

/** Create multi-service request — PENDING until desk confirms → OPEN QR. */
export async function POST(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const zoneCode = String(body.zoneCode || "").trim().toUpperCase();
    const zoneName = String(body.zoneName || "").trim() || undefined;
    let items = Array.isArray(body.items)
      ? (body.items as CartItemInput[])
      : [];
    const offerIds = Array.from(
      new Set(
        [
          ...(Array.isArray(body.offerIds) ? body.offerIds : []),
          body.offerId,
        ]
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )
    );
    let discountVnd = Math.max(0, Math.round(Number(body.discountVnd) || 0));
    if (offerIds.includes("hhg-oly-ln-100k")) {
      const bill = items.reduce((sum, item) => {
        const id = String(item.id || "");
        if (
          id.startsWith("voucher-") ||
          id.startsWith("disc-") ||
          id.startsWith("points-redeem-")
        ) {
          return sum;
        }
        return (
          sum +
          Math.max(0, Math.round(Number(item.priceVnd) || 0)) *
            Math.max(0, Math.round(Number(item.qty) || 0))
        );
      }, 0);
      if (bill < 500_000) {
        return NextResponse.json(
          {
            error:
              "Voucher Lòng Nướng 100K chỉ áp khi hoá đơn từ 500.000đ.",
          },
          { status: 400 }
        );
      }
    }
    const pointsRedeemTierRaw = Math.round(
      Number(body.pointsRedeemTier) || 0
    );
    const pointsZone =
      zoneCode === "MIA_OI" ||
      zoneCode === "MIA_OLYMPIC" ||
      zoneCode === "OLYMPIC_POOL" ||
      zoneCode === "OLYMPIC";
    const pointsRedeemTier =
      pointsZone &&
      (pointsRedeemTierRaw === 50 || pointsRedeemTierRaw === 100)
        ? pointsRedeemTierRaw
        : null;
    if (!pointsZone) {
      items = items
        .filter((item) => !String(item.id || "").startsWith("points-redeem-"))
        .map((item) => {
          if (!item.pointsRedeemQty) return item;
          const rest = { ...item };
          delete rest.pointsRedeemQty;
          return rest;
        });
    }

    if (!zoneCode) {
      return NextResponse.json({ error: "Thiếu khu vực." }, { status: 400 });
    }

    if (
      zoneCode === "OLYMPIC_POOL" ||
      zoneCode === "OLYMPIC" ||
      zoneCode === "MIA_OLYMPIC"
    ) {
      items = items.map((item) => {
        const id = String(item.id || "");
        const official = officialOlympicOrderItem(id);
        if (!official) return item;
        return {
          ...item,
          nameVi: official.nameVi,
          priceVnd: official.priceVnd,
          note: official.note,
          qty: olympicOrderQtyLocked(id) ? 1 : item.qty,
        };
      });
    }

    // Đồng bộ họ tên + SĐT nếu client gửi kèm (Upgrade / checkin thiếu hồ sơ).
    const guestFullName = String(body.guestFullName || "").trim().slice(0, 120);
    const guestPhone = String(body.guestPhone || "").trim();
    const { cartItemsIncludeMembership } = await import(
      "@/lib/membership-theme"
    );
    const isMembershipUpgrade = cartItemsIncludeMembership(items);
    let customerRecord = customer;

    if (isMembershipUpgrade) {
      const { isVipActive } = await import("@/lib/vip");
      if (
        isVipActive({
          segment: customer.segment,
          vipExpiresAt: customer.vipExpiresAt,
        })
      ) {
        const exp = customer.vipExpiresAt
          ? new Date(customer.vipExpiresAt).toLocaleDateString("vi-VN")
          : null;
        return NextResponse.json(
          {
            error: exp
              ? `Bạn đang dùng ${customer.vipPlanLabel || "gói hội viên"} đến ${exp}. Hết hạn mới được chọn gói mới (không nâng/hạ gói khi còn hạn).`
              : "Bạn đang dùng gói hội viên. Hết hạn mới được chọn gói mới.",
          },
          { status: 409 }
        );
      }
      const openCarts = await prisma.appServiceCart.findMany({
        where: {
          customerId: customer.id,
          status: { in: [CART_STATUS.PENDING, CART_STATUS.OPEN] },
        },
        select: { id: true, items: true, status: true },
        take: 30,
      });
      if (openCarts.some((c) => cartItemsIncludeMembership(c.items))) {
        return NextResponse.json(
          {
            error:
              "Bạn đã có yêu cầu nâng cấp đang chờ duyệt / chưa dùng. Không gửi thêm gói khác.",
          },
          { status: 409 }
        );
      }
    }

    if (guestFullName || guestPhone || isMembershipUpgrade) {
      const { isValidPhone, normalizePhone, phoneShortId } = await import(
        "@/lib/phone"
      );
      const name =
        guestFullName ||
        String(customer.fullName || "").trim();
      const phoneRaw =
        guestPhone ||
        String(customer.phone || customer.phoneNormalized || "").trim();
      if (isMembershipUpgrade && (name.length < 2 || !isValidPhone(phoneRaw))) {
        return NextResponse.json(
          {
            error:
              "Nâng cấp hội viên cần họ tên và số điện thoại để quầy duyệt.",
          },
          { status: 400 }
        );
      }
      if (name.length >= 2 && isValidPhone(phoneRaw)) {
        const phoneNormalized = normalizePhone(phoneRaw);
        const phoneLast4 = phoneShortId(phoneNormalized);
        const clash = await prisma.appCustomer.findFirst({
          where: {
            phoneNormalized,
            id: { not: customer.id },
            status: "ACTIVE",
          },
          select: { id: true },
        });
        if (clash) {
          return NextResponse.json(
            {
              error:
                "SĐT này đã gắn tài khoản khác. Đăng nhập đúng SĐT hoặc dùng số khác.",
            },
            { status: 409 }
          );
        }
        customerRecord = await prisma.appCustomer.update({
          where: { id: customer.id },
          data: {
            fullName: name,
            phone: phoneRaw,
            phoneNormalized,
            phoneLast4,
            shortId: phoneLast4,
          },
        });
      }
    }

    // Voucher hội viên: chỉ trong hạn gói (từ ngày nâng cấp → vipExpiresAt)
    {
      const {
        isDurationMembershipVoucher,
        isLimitedMembershipVoucher,
      } = await import("@/lib/hhg-vouchers");
      const { isVipActive } = await import("@/lib/vip");
      const { ensureMembershipVoucherQty } = await import(
        "@/lib/membership-voucher-qty"
      );
      const membershipOffers = offerIds.filter((id) =>
        isDurationMembershipVoucher(id)
      );
      if (membershipOffers.length) {
        if (
          !isVipActive({
            segment: customerRecord.segment,
            vipExpiresAt: customerRecord.vipExpiresAt,
          })
        ) {
          const exp = customerRecord.vipExpiresAt
            ? new Date(customerRecord.vipExpiresAt).toLocaleDateString("vi-VN")
            : null;
          return NextResponse.json(
            {
              error: exp
                ? `Voucher hội viên hết hạn cùng gói (đã hết ${exp}).`
                : "Voucher hội viên chỉ dùng trong thời hạn gói.",
            },
            { status: 409 }
          );
        }
        for (const offerId of membershipOffers) {
          if (!isLimitedMembershipVoucher(offerId)) continue;
          await ensureMembershipVoucherQty(prisma, {
            customerId: customerRecord.id,
            offerId,
          });
          const row = await prisma.appCollectedOffer.findUnique({
            where: {
              customerId_offerId: {
                customerId: customerRecord.id,
                offerId,
              },
            },
            select: { status: true, qtyTotal: true, qtyRemaining: true },
          });
          if (!row || row.status !== "COLLECTED") {
            return NextResponse.json(
              { error: "Không có voucher hội viên để áp." },
              { status: 404 }
            );
          }
          if (row.qtyTotal != null && (row.qtyRemaining ?? 0) <= 0) {
            return NextResponse.json(
              {
                error: `Đã hết lượt voucher (0/${row.qtyTotal}). Không dùng thêm được.`,
              },
              { status: 409 }
            );
          }
        }
      }
    }

    let pointsRedeemDiscountVnd = 0;
    let pointsRedeemUnits = 0;
    if (pointsRedeemTier) {
      const check = computeGuestPointsRedeem({
        zoneCode,
        tier: pointsRedeemTier,
        units: Math.max(0, Math.round(Number(body.pointsRedeemUnits) || 0)) || undefined,
        items: items.map((i) => ({
          id: String(i.id || ""),
          priceVnd: Math.max(0, Math.round(Number(i.priceVnd) || 0)),
          qty: Math.max(0, Math.round(Number(i.qty) || 0)),
          redeemQty: Math.max(0, Math.round(Number(i.pointsRedeemQty) || 0)),
        })),
      });
      if (!check.ok) {
        return NextResponse.json(
          { error: check.error || "Không đổi điểm được." },
          { status: 400 }
        );
      }
      const bal = customerRecord.pointsBalance ?? 0;
      if (bal < check.cost) {
        return NextResponse.json(
          {
            error: `Không đủ điểm (cần ${check.cost}, đang có ${bal}).`,
          },
          { status: 400 }
        );
      }
      pointsRedeemDiscountVnd = check.discountVnd;
      pointsRedeemUnits = check.units;
      if (pointsRedeemTier === 50 || pointsRedeemTier === 100) {
        items = items.map((item, index) => {
          const alloc = check.allocations.find((a) => a.index === index);
          const redeemQty = alloc?.redeemQty || 0;
          if (redeemQty <= 0) {
            const rest = { ...item };
            delete rest.pointsRedeemQty;
            return rest;
          }
          return { ...item, pointsRedeemQty: redeemQty };
        });
      }
    }

    if (isMembershipUpgrade) {
      const { OLYMPIC_MONTHLY } = await import("@/lib/service-catalogs");
      const { isOlympicMembershipPackageId } = await import(
        "@/lib/membership-theme"
      );
      const {
        isSameDayMembershipEligible,
        sameDayMembershipDiscountVnd,
      } = await import("@/lib/same-day-membership");
      items = items.map((i) => {
        if (!isOlympicMembershipPackageId(i.id)) return i;
        const pkg = OLYMPIC_MONTHLY.find((p) => p.id === i.id);
        if (!pkg) return i;
        return { ...i, priceVnd: pkg.priceVnd, qty: 1 };
      });
      const eligible = await isSameDayMembershipEligible(prisma, {
        id: customerRecord.id,
      });
      if (eligible) {
        const membershipSubtotal = items
          .filter((i) => isOlympicMembershipPackageId(i.id))
          .reduce(
            (s, i) =>
              s +
              Math.max(0, Math.round(Number(i.priceVnd) || 0)) *
                Math.max(0, Math.round(Number(i.qty) || 0)),
            0
          );
        const extra = sameDayMembershipDiscountVnd(membershipSubtotal);
        if (extra > 0) {
          discountVnd += extra;
          items = [
            ...items,
            {
              id: "disc-same-day-membership",
              nameVi: "Giảm 10% gói tháng (cùng ngày với đơn bơi)",
              qty: 1,
              priceVnd: 0,
              note: `−${extra.toLocaleString("vi-VN")}đ`,
            },
          ];
        }
      }
    }

    // Mía Ơi: giảm 5%/10% theo gói VIP trong hạn — không phải voucher.
    if (zoneCode === "MIA_OI") {
      const { isVipActive } = await import("@/lib/vip");
      const {
        MIA_MEMBERSHIP_DISC_PREFIX,
        tierFromPlanLabel,
        miaOiDiscountPercentForTier,
        miaOiMembershipDiscountVnd,
      } = await import("@/lib/membership-theme");
      if (
        isVipActive({
          segment: customerRecord.segment,
          vipExpiresAt: customerRecord.vipExpiresAt,
        })
      ) {
        const pct = miaOiDiscountPercentForTier(
          tierFromPlanLabel(customerRecord.vipPlanLabel)
        );
        const productSub = items.reduce((s, i) => {
          const id = String(i.id || "");
          if (
            id.startsWith("voucher-") ||
            id.startsWith("points-redeem-") ||
            id.startsWith("disc-")
          ) {
            return s;
          }
          return (
            s +
            Math.max(0, Math.round(Number(i.priceVnd) || 0)) *
              Math.max(0, Math.round(Number(i.qty) || 0))
          );
        }, 0);
        const memberOff = miaOiMembershipDiscountVnd(
          Math.max(0, productSub - pointsRedeemDiscountVnd),
          pct
        );
        if (memberOff > 0) {
          discountVnd += memberOff;
          items = [
            ...items,
            {
              id: `${MIA_MEMBERSHIP_DISC_PREFIX}-${pct}`,
              nameVi: `Giảm ${pct}% hội viên Mía Ơi`,
              qty: 1,
              priceVnd: 0,
              note: `−${memberOff.toLocaleString("vi-VN")}đ · trong hạn gói`,
            },
          ];
        }
      }
    }

    const {
      cart,
      payload,
      discountVnd: applied,
      offerIds: savedOfferIds,
      pointsRedeemTier: savedTier,
      pointsRedeemCost: savedCost,
    } = await createServiceCart({
      customerId: customerRecord.id,
      zoneCode,
      zoneName,
      items,
      discountVnd,
      offerIds,
      pointsRedeemTier,
      pointsRedeemUnits,
      pointsRedeemDiscountVnd,
    });

    // Đốt voucher thường; hội viên có số lần → trừ 1 (0/N vẫn hiện, không dùng thêm).
    const {
      isDurationMembershipVoucher,
      isLimitedMembershipVoucher,
    } = await import("@/lib/hhg-vouchers");
    const {
      consumeMembershipVoucherUse,
    } = await import("@/lib/membership-voucher-qty");
    const burnIds = savedOfferIds.filter(
      (id) => !isDurationMembershipVoucher(id) && !isStaffScanVoucher(id)
    );
    const membershipUseIds = savedOfferIds.filter(
      (id) => isDurationMembershipVoucher(id) && !isStaffScanVoucher(id)
    );
    if (burnIds.length) {
      await prisma.appCollectedOffer
        .updateMany({
          where: {
            customerId: customerRecord.id,
            offerId: { in: burnIds },
            status: "COLLECTED",
          },
          data: { status: "USED", usedAt: new Date() },
        })
        .catch(() => undefined);
    }
    for (const offerId of membershipUseIds) {
      try {
        if (isLimitedMembershipVoucher(offerId)) {
          await consumeMembershipVoucherUse(prisma, {
            customerId: customerRecord.id,
            offerId,
          });
        }
      } catch (err) {
        const status =
          err && typeof err === "object" && "status" in err
            ? Number((err as { status: number }).status) || 500
            : 500;
        await prisma.appServiceCart
          .update({
            where: { id: cart.id },
            data: { status: CART_STATUS.CANCELLED },
          })
          .catch(() => undefined);
        if (status < 500) {
          return NextResponse.json(
            { error: err instanceof Error ? err.message : "Voucher hết lượt" },
            { status }
          );
        }
        console.error("[me/cart membership voucher]", err);
        return NextResponse.json(
          { error: "Không trừ được lượt voucher." },
          { status: 500 }
        );
      }
    }

    let pointsBalance = customerRecord.pointsBalance ?? 0;
    if (savedTier) {
      const burned = savedCost || savedTier;
      const pts = await redeemPoints({
        customerId: customerRecord.id,
        cost: burned,
        refType: "SERVICE_CART",
        refId: cart.id,
        note: `Đổi ${burned} điểm · ${zoneCode} · QR ${cart.token.slice(-6)}`,
      });
      pointsBalance = pts.balance;
    }

    return NextResponse.json({
      ok: true,
      cart: {
        id: cart.id,
        token: cart.token,
        zoneCode: cart.zoneCode,
        zoneName: cart.zoneName,
        items: cart.items,
        totalVnd: cart.totalVnd,
        status: cart.status,
        expiresAt: cart.expiresAt,
      },
      discountVnd: applied,
      pointsRedeemTier: savedTier,
      pointsBalance,
      /** Only usable after desk approves (status OPEN) */
      payload: cart.status === CART_STATUS.OPEN ? payload : null,
      customer: {
        fullName: customerRecord.fullName,
        phone: customerRecord.phone,
        shortId: customerRecord.phoneLast4 || customerRecord.shortId,
        customerCode: customerRecord.customerCode,
      },
    });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e
        ? Number((e as { status: number }).status) || 500
        : 500;
    if (status < 500) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed" },
        { status }
      );
    }
    console.error("[me/cart POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** Customer deletes unused ticket → CANCELLED (desk shows Xóa). */
export async function DELETE(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const token = String(
      body.token || req.nextUrl.searchParams.get("token") || ""
    ).trim();
    if (!token) {
      return NextResponse.json({ error: "Thiếu token" }, { status: 400 });
    }
    const cart = await prisma.appServiceCart.findFirst({
      where: { token, customerId: customer.id },
    });
    if (!cart) {
      return NextResponse.json({ error: "Không tìm thấy vé" }, { status: 404 });
    }
    if (cart.status === CART_STATUS.USED) {
      return NextResponse.json(
        { error: "Vé đã dùng, không xoá được." },
        { status: 409 }
      );
    }
    await prisma.appServiceCart.update({
      where: { id: cart.id },
      data: { status: CART_STATUS.CANCELLED },
    });
    const settled = await settlePointsOnCancel({
      customerId: customer.id,
      refIds: [cart.id],
      note: "Hoàn điểm · khách xoá vé",
    }).catch((err) => {
      console.error("[me/cart DELETE refund]", err);
      return null;
    });
    // Hoàn lượt voucher hội viên đã trừ khi tạo vé
    {
      const { isLimitedMembershipVoucher } = await import("@/lib/hhg-vouchers");
      const { refundMembershipVoucherUse } = await import(
        "@/lib/membership-voucher-qty"
      );
      const offerIdsFromCart = parseVoucherOfferIds(cart.items);
      for (const offerId of offerIdsFromCart) {
        if (!isLimitedMembershipVoucher(offerId)) continue;
        await refundMembershipVoucherUse(prisma, {
          customerId: customer.id,
          offerId,
        }).catch((err) =>
          console.error("[me/cart DELETE voucher refund]", err)
        );
      }
    }
    if (cart.zoneCode.toUpperCase() === "LONG_NUONG") {
      const ref = parseCartTableRef(cart.items);
      if (ref.bookingId) {
        await prisma.appBooking
          .updateMany({
            where: {
              id: ref.bookingId,
              status: {
                in: ["PENDING", "CONFIRMED", "ARRIVED", "CHECKED_IN"],
              },
            },
            data: { status: "CANCELLED" },
          })
          .catch(() => undefined);
      }
      if (ref.resourceId) {
        const active = await prisma.appResourceSession.findFirst({
          where: { resourceId: ref.resourceId, status: "OCCUPIED" },
        });
        if (!active) {
          await prisma.appResource
            .updateMany({
              where: { id: ref.resourceId, status: "RESERVED" },
              data: { status: "AVAILABLE" },
            })
            .catch(() => undefined);
        }
      }
    }
    return NextResponse.json({
      ok: true,
      status: CART_STATUS.CANCELLED,
      pointsBalance: settled?.balance ?? null,
      pointsRefunded: settled?.refunded ?? 0,
      pointsClawed: settled?.clawed ?? 0,
    });
  } catch (e) {
    console.error("[me/cart DELETE]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/**
 * List pending + open (+ rejected) carts.
 * ?token=sc_… → lightweight status poll (no list).
 */
export async function GET(req: NextRequest) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = String(req.nextUrl.searchParams.get("token") || "").trim();
    if (token) {
      const cart = await prisma.appServiceCart.findFirst({
        where: { token, customerId: customer.id },
        select: {
          token: true,
          status: true,
          zoneCode: true,
          zoneName: true,
          totalVnd: true,
          adminNote: true,
          updatedAt: true,
        },
      });
      if (!cart) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        token: cart.token,
        status: cart.status,
        zoneCode: cart.zoneCode,
        zoneName: cart.zoneName,
        totalVnd: cart.totalVnd,
        adminNote: cart.adminNote,
        payload:
          cart.status === CART_STATUS.OPEN
            ? serviceCartQrPayload(cart.token)
            : null,
      });
    }

    const now = new Date();
    const carts = await prisma.appServiceCart.findMany({
      where: {
        customerId: customer.id,
        OR: [
          { status: CART_STATUS.PENDING, expiresAt: { gt: now } },
          { status: CART_STATUS.OPEN, expiresAt: { gt: now } },
          {
            status: CART_STATUS.REJECTED,
            updatedAt: { gte: new Date(Date.now() - 48 * 3600_000) },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    const ids = [
      ...new Set(carts.flatMap((c) => bookingIdsInItems(c.items))),
    ];
    const clocks = new Map<string, { startAt: Date; endAt: Date }>();
    if (ids.length) {
      const found = await prisma.appBooking.findMany({
        where: { id: { in: ids } },
        select: { id: true, startAt: true, endAt: true },
      });
      for (const b of found) clocks.set(b.id, b);
    }
    return NextResponse.json({
      ok: true,
      carts: carts.map((c) => ({
        ...c,
        items: relabelItemNames(c.items, clocks),
        payload:
          c.status === CART_STATUS.OPEN
            ? serviceCartQrPayload(c.token)
            : null,
      })),
    });
  } catch (e) {
    console.error("[me/cart GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
