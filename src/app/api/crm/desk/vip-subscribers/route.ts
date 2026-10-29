import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/auth";
import { packageIdFromVipPlanLabel } from "@/lib/hhg-vouchers";
import { getPoolItem } from "@/lib/olympic-pool-menu";
import {
  reconcileOlympicMembership,
  vipStartedAtFromExpiry,
} from "@/lib/olympic-membership";
import { prisma } from "@/lib/prisma";

/** Active VIP packages for the admin panel. */
export async function GET() {
  const gate = await requireSystemAdmin();
  if ("error" in gate) return gate.error;

  const now = new Date();
  const rows = await prisma.appCustomer.findMany({
    where: {
      segment: "VIP",
      OR: [{ vipExpiresAt: null }, { vipExpiresAt: { gt: now } }],
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      phoneNormalized: true,
      vipPlanLabel: true,
      vipStartedAt: true,
      vipExpiresAt: true,
    },
  });

  const subscribers = (
    await Promise.all(
      rows.map(async (row) => {
        let started = row.vipStartedAt;
        if (!started && row.vipExpiresAt) {
          started = vipStartedAtFromExpiry(row.vipExpiresAt, row.vipPlanLabel);
          if (started) {
            await prisma.appCustomer
              .update({
                where: { id: row.id },
                data: { vipStartedAt: started },
              })
              .catch((err) => {
                console.error("[vip-subscribers] start backfill", err);
              });
          }
        }
        const aligned = await reconcileOlympicMembership(prisma, {
          id: row.id,
          vipPlanLabel: row.vipPlanLabel,
          vipStartedAt: started,
          vipExpiresAt: row.vipExpiresAt,
        });
        return {
          id: row.id,
          fullName: row.fullName?.trim() || "—",
          phone: row.phone || row.phoneNormalized || "—",
          planLabel: aligned.vipPlanLabel?.trim() || "Gói VIP",
          startedAt: aligned.vipStartedAt?.toISOString() || null,
          expiresAt: aligned.vipExpiresAt?.toISOString() || null,
        };
      })
    )
  )
    .sort((a, b) => {
      const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return tb - ta;
    });

  const withStaff = await attachShiftStaff(subscribers);
  return NextResponse.json({
    ok: true,
    count: withStaff.length,
    subscribers: withStaff,
  });
}

function cleanStaff(name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.toLowerCase() === "desk") return "";
  return trimmed;
}

function cartShiftStaff(items: unknown) {
  if (!Array.isArray(items)) return "";
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const item = row as { id?: string; staffName?: string };
    if (String(item.id || "") !== "__staff") continue;
    return cleanStaff(String(item.staffName || ""));
  }
  return "";
}

/** Olympic labels map to oly-*. A VIP package label must not match those ids. */
function planPackageId(label: string) {
  if (/vip/i.test(label)) return null;
  return packageIdFromVipPlanLabel(label);
}

function matchesPlan(
  itemId: string,
  nameVi: string,
  planLabel: string,
  packageId: string | null
) {
  const name = nameVi.trim();
  if (name && name === planLabel.trim()) return true;
  if (!packageId) return false;
  if (itemId === packageId) return true;
  return name === (getPoolItem(packageId)?.nameVi || "");
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const list = grouped.get(id);
    if (list) list.push(row);
    else grouped.set(id, [row]);
  }
  return grouped;
}

/** Staff who sold the package: the matching order, or the cart they approved. */
async function attachShiftStaff<
  T extends { id: string; planLabel: string; startedAt: string | null },
>(rows: T[]): Promise<(T & { staffName: string | null })[]> {
  if (!rows.length) return rows.map((row) => ({ ...row, staffName: null }));
  const ids = rows.map((row) => row.id);
  const [orders, carts] = await Promise.all([
    prisma.appOrder.findMany({
      where: { customerId: { in: ids } },
      select: {
        customerId: true,
        createdAt: true,
        createdById: true,
        items: { select: { itemId: true, nameVi: true } },
      },
    }),
    prisma.appServiceCart.findMany({
      where: { customerId: { in: ids } },
      select: {
        customerId: true,
        items: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  const userIds = [
    ...new Set(
      orders
        .map((order) => order.createdById)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, username: true },
      })
    : [];
  const userName = new Map(
    users.map((user) => [
      user.id,
      cleanStaff(user.displayName || user.username),
    ])
  );

  const ordersByCustomer = groupBy(orders, (order) => order.customerId);
  const cartsByCustomer = groupBy(carts, (cart) => cart.customerId);

  return rows.map((row) => {
    const packageId = planPackageId(row.planLabel);
    const target = row.startedAt ? new Date(row.startedAt).getTime() : 0;
    const hits: { at: number; name: string }[] = [];
    for (const order of ordersByCustomer.get(row.id) || []) {
      if (!order.createdById) continue;
      const matched = order.items.some((item) =>
        matchesPlan(item.itemId, item.nameVi, row.planLabel, packageId)
      );
      if (!matched) continue;
      const name = userName.get(order.createdById) || "";
      if (name) hits.push({ at: order.createdAt.getTime(), name });
    }
    for (const cart of cartsByCustomer.get(row.id) || []) {
      if (!Array.isArray(cart.items)) continue;
      const matched = cart.items.some((item) => {
        if (!item || typeof item !== "object") return false;
        const line = item as { id?: string; nameVi?: string };
        if (String(line.id || "").startsWith("__")) return false;
        return matchesPlan(
          String(line.id || ""),
          String(line.nameVi || ""),
          row.planLabel,
          packageId
        );
      });
      if (!matched) continue;
      const name = cartShiftStaff(cart.items);
      if (name) hits.push({ at: cart.updatedAt.getTime(), name });
    }
    hits.sort(
      (a, b) => Math.abs(a.at - target) - Math.abs(b.at - target) || b.at - a.at
    );
    return { ...row, staffName: hits[0]?.name || null };
  });
}
