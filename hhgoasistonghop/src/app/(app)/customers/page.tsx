import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader } from "@/components/ui";
import { daysUntil, formatDate } from "@/lib/utils";
import { CustomerSearchBar } from "@/components/customer-search-bar";
import { buildCustomerSearchWhere, rankCustomerMatches } from "@/lib/customer-search";
import { Prisma } from "@prisma/client";
import { getPackageByCode } from "@/config/crm.config";
import {
  isDbSort,
  prismaOrderBy,
  type CustomerSortKey,
} from "@/components/customer-sort-th";
import {
  CustomersTableBody,
  type CustomerTableEntry,
  type CustomerTableMember,
} from "@/components/customers-table-body";
import { CustomersRefreshListener } from "@/components/customers-refresh-listener";
import { CustomersTableHead } from "@/components/customers-table-head";
import { canWrite } from "@/lib/auth";
import { requireFeature, sessionCanFeature } from "@/lib/require-feature";

const PAGE_SIZE = 15;
const EXPIRY_WARN_DAYS = 7;

function packageLabel(planCode: string, planName: string) {
  const pkg = getPackageByCode(planCode);
  return pkg?.name || planName;
}

function remainingTone(days: number, unused: boolean) {
  if (days <= EXPIRY_WARN_DAYS && unused) return "text-rose-800";
  if (days <= EXPIRY_WARN_DAYS) return "text-amber-800";
  if (days <= 14) return "text-slate-700";
  return "text-emerald-800";
}

function packageStatusOf(c: {
  memberships: { status: string; expiryDate: Date }[];
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const valid = c.memberships.some(
    (m) => m.status === "ACTIVE" && m.expiryDate >= today
  );
  if (valid) return 0;
  if (c.memberships.length > 0) return 1;
  return 2;
}

function minRemainingDays(c: {
  memberships: { status: string; expiryDate: Date }[];
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let min = Number.POSITIVE_INFINITY;
  for (const m of c.memberships) {
    if (m.status !== "ACTIVE") continue;
    const d = daysUntil(m.expiryDate);
    if (d != null && d >= 0 && d < min) min = d;
  }
  return Number.isFinite(min) ? min : 9999;
}

function maxPackageNumber(c: {
  memberships: { status: string; expiryDate: Date; plan: { planCode: string } }[];
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let max = 0;
  for (const m of c.memberships) {
    if (m.status !== "ACTIVE" || m.expiryDate < today) continue;
    const n = getPackageByCode(m.plan.planCode)?.sortIndex ?? 0;
    if (n > max) max = n;
  }
  return max;
}

function membershipAreaKey(c: {
  memberships: {
    status: string;
    expiryDate: Date;
    plan: { services: { service: { name: string } }[] };
  }[];
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const names = new Set<string>();
  for (const m of c.memberships) {
    if (m.status !== "ACTIVE" || m.expiryDate < today) continue;
    for (const ps of m.plan.services) names.add(ps.service.name);
  }
  return [...names].sort().join(",");
}

type MemCustomer = {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
  dateOfBirth: Date | null;
  note: string | null;
  personality: string | null;
  lastVisitAt: Date | null;
  totalVisits: number;
  memberships: {
    id: string;
    status: string;
    startDate: Date;
    expiryDate: Date;
    plan: {
      planCode: string;
      name: string;
      services: { service: { code: string; name: string } }[];
    };
  }[];
};

function toMemberRow(c: MemCustomer, isOwner: boolean): CustomerTableMember {
  const validMems = c.memberships.filter((m) => {
    if (m.status !== "ACTIVE") return false;
    const d = daysUntil(m.expiryDate);
    return d != null && d >= 0;
  });
  const mem = validMems[0] || c.memberships[0];
  const memServices = [
    ...new Map(
      validMems.flatMap((m) =>
        m.plan.services.map((ps) => [ps.service.code, ps.service] as const)
      )
    ).values(),
  ];

  const remainingLines = validMems
    .map((m) => {
      const days = daysUntil(m.expiryDate);
      if (days == null) return null;
      const unused =
        !c.lastVisitAt ||
        c.totalVisits === 0 ||
        c.lastVisitAt.getTime() < m.startDate.getTime();
      return {
        id: m.id,
        planCode: m.plan.planCode,
        planName: packageLabel(m.plan.planCode, m.plan.name),
        days,
        unused,
        tone: remainingTone(days, unused),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.days - b.days);

  const packageStatus =
    validMems.length > 0 ? "ACTIVE" : c.memberships.length > 0 ? "EXPIRED" : "NONE";

  return {
    id: c.id,
    customerCode: c.customerCode,
    fullName: c.fullName,
    phone: c.phone,
    dateOfBirth: c.dateOfBirth?.toISOString() ?? null,
    note: c.note,
    personality: c.personality,
    isOwner,
    packageStatus,
    packageBadges: validMems.map((m) => ({
      id: m.id,
      planCode: m.plan.planCode,
    })),
    memServices,
    memFallback: mem
      ? {
          planCode: mem.plan.planCode,
          planName: mem.plan.name,
          status: mem.status,
          services: mem.plan.services.map((ps) => ({
            code: ps.service.code,
            name: ps.service.name,
          })),
        }
      : null,
    remainingLines,
  };
}

function buildTableEntries(
  customers: (MemCustomer & {
    familyGroupId: string | null;
    familyGroup: {
      id: string;
      groupCode: string;
      name: string | null;
      phone: string;
      ownerId: string;
      members: MemCustomer[];
    } | null;
  })[]
): CustomerTableEntry[] {
  const seenFamilies = new Set<string>();
  const entries: CustomerTableEntry[] = [];

  for (const c of customers) {
    if (!c.familyGroupId || !c.familyGroup) {
      entries.push({ kind: "solo", customer: toMemberRow(c, false) });
      continue;
    }
    if (seenFamilies.has(c.familyGroupId)) continue;
    seenFamilies.add(c.familyGroupId);

    const group = c.familyGroup;
    const membersSorted = [...group.members].sort((a, b) => {
      if (a.id === group.ownerId) return -1;
      if (b.id === group.ownerId) return 1;
      return a.fullName.localeCompare(b.fullName, "vi");
    });
    const owner = membersSorted.find((m) => m.id === group.ownerId) || membersSorted[0];
    const memberRows = membersSorted.map((m) =>
      toMemberRow(m, m.id === group.ownerId)
    );
    const ownerRow = toMemberRow(owner, true);
    const anyActive = memberRows.some((m) => m.packageStatus === "ACTIVE");
    const anyMem = memberRows.some((m) => m.packageStatus !== "NONE");

    entries.push({
      kind: "family",
      groupId: group.id,
      displayCode: `${owner.customerCode} - GĐ`,
      familyName: group.name || `Gia đình ${owner.fullName}`,
      phone: group.phone,
      ownerId: group.ownerId,
      members: memberRows,
      summary: {
        id: group.id,
        customerCode: `${owner.customerCode} - GĐ`,
        fullName: group.name || `Gia đình ${owner.fullName}`,
        phone: group.phone,
        dateOfBirth: null,
        note: `${memberRows.length} thành viên`,
        personality: null,
        packageStatus: anyActive ? "ACTIVE" : anyMem ? "EXPIRED" : "NONE",
        packageBadges: ownerRow.packageBadges,
        memServices: ownerRow.memServices,
        memFallback: ownerRow.memFallback,
        remainingLines: ownerRow.remainingLines,
      },
    });
  }

  return entries;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireFeature("customers");
  const allowWrite =
    canWrite(session.user.role) && (await sessionCanFeature(session, "customers_write"));

  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const member = sp.member || "";
  const area = sp.area || "";
  const plan = sp.plan || "";
  const type = sp.type || "";
  const fCode = sp.fCode?.trim() || "";
  const fName = sp.fName?.trim() || "";
  const fPhone = sp.fPhone?.trim() || "";
  const fDob = sp.fDob?.trim() || "";
  const fNote = sp.fNote?.trim() || "";
  const fPersonality = sp.fPersonality?.trim() || "";
  const fRemain = sp.fRemain || "";
  const page = Math.max(1, Number(sp.page || 1));
  const sortRaw = sp.sort || "createdAt";
  const sort = (sortRaw === "name" ? "name" : sortRaw) as CustomerSortKey | string;
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const mul = dir === "asc" ? 1 : -1;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soonEnd = new Date(today);
  soonEnd.setDate(soonEnd.getDate() + EXPIRY_WARN_DAYS);

  const membershipFilters: Prisma.MembershipWhereInput[] = [];
  if (member === "yes") {
    membershipFilters.push({ status: "ACTIVE", expiryDate: { gte: today } });
  }
  if (area) {
    membershipFilters.push({
      status: "ACTIVE",
      expiryDate: { gte: today },
      plan: { services: { some: { service: { code: area } } } },
    });
  }
  if (plan) {
    membershipFilters.push({
      status: "ACTIVE",
      expiryDate: { gte: today },
      plan: { planCode: plan },
    });
  }

  const where: Prisma.CustomerWhereInput = {};
  const andParts: Prisma.CustomerWhereInput[] = [];

  const searchWhere = buildCustomerSearchWhere(q);
  if (searchWhere) andParts.push(searchWhere);

  if (fCode) {
    andParts.push({ customerCode: { contains: fCode, mode: "insensitive" } });
  }
  if (fName) {
    andParts.push({ fullName: { contains: fName, mode: "insensitive" } });
  }
  if (fPhone) {
    const digits = fPhone.replace(/\D/g, "");
    andParts.push({
      OR: [
        { phone: { contains: fPhone } },
        ...(digits ? [{ phoneNormalized: { contains: digits } }] : []),
      ],
    });
  }
  if (fNote) {
    andParts.push({ note: { contains: fNote, mode: "insensitive" } });
  }
  if (fPersonality) {
    andParts.push({ personality: { contains: fPersonality, mode: "insensitive" } });
  }

  if (type === "family") {
    andParts.push({ familyGroupId: { not: null } });
  } else if (type === "solo") {
    andParts.push({ familyGroupId: null });
  }

  if (fRemain === "soon") {
    andParts.push({
      memberships: {
        some: {
          status: "ACTIVE",
          expiryDate: { gte: today, lte: soonEnd },
        },
      },
    });
  } else if (fRemain === "ok") {
    andParts.push({
      memberships: {
        some: {
          status: "ACTIVE",
          expiryDate: { gt: soonEnd },
        },
      },
    });
  } else if (fRemain === "expired") {
    andParts.push({
      memberships: { none: { status: "ACTIVE", expiryDate: { gte: today } } },
    });
  }

  if (member === "no") {
    andParts.push({
      memberships: { none: { status: "ACTIVE", expiryDate: { gte: today } } },
    });
  } else {
    for (const f of membershipFilters) {
      andParts.push({ memberships: { some: f } });
    }
  }

  if (andParts.length === 1) Object.assign(where, andParts[0]);
  else if (andParts.length > 1) where.AND = andParts;

  const membershipInclude = {
    where: { status: { in: ["ACTIVE", "EXPIRED", "PAUSED"] } },
    include: {
      plan: {
        include: { services: { include: { service: true } } },
      },
    },
    orderBy: { expiryDate: "asc" as const },
  };

  const include = {
    memberships: membershipInclude,
    familyGroup: {
      include: {
        members: {
          include: { memberships: membershipInclude },
          orderBy: { fullName: "asc" as const },
        },
      },
    },
  };

  const totalBeforeDob = await prisma.customer.count({ where });

  let customers: Awaited<
    ReturnType<typeof prisma.customer.findMany<{ include: typeof include }>>
  >;

  const needMemoryPath = !isDbSort(sort) || !!q || !!fDob;

  if (!needMemoryPath) {
    customers = await prisma.customer.findMany({
      where,
      orderBy: prismaOrderBy(sort, dir),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include,
    });
  } else {
    const all = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 400,
      include,
    });
    let list = q ? rankCustomerMatches(all, q) : all;

    if (fDob) {
      const needle = fDob.toLowerCase();
      list = list.filter((c) => {
        if (!c.dateOfBirth) return false;
        const label = formatDate(c.dateOfBirth).toLowerCase();
        const iso = c.dateOfBirth.toISOString().slice(0, 10);
        return label.includes(needle) || iso.includes(needle);
      });
    }

    if (sort !== "createdAt" || q || fDob) {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        switch (sort) {
          case "code":
            cmp = a.customerCode.localeCompare(b.customerCode);
            break;
          case "name":
            cmp = a.fullName.localeCompare(b.fullName, "vi");
            break;
          case "phone":
            cmp = a.phone.localeCompare(b.phone);
            break;
          case "dob":
            cmp =
              (a.dateOfBirth?.getTime() ?? 0) - (b.dateOfBirth?.getTime() ?? 0);
            break;
          case "note":
            cmp = (a.note || "").localeCompare(b.note || "", "vi");
            break;
          case "personality":
            cmp = (a.personality || "").localeCompare(b.personality || "", "vi");
            break;
          case "goi":
            cmp = maxPackageNumber(a) - maxPackageNumber(b);
            break;
          case "membership":
            cmp = membershipAreaKey(a).localeCompare(membershipAreaKey(b), "vi");
            break;
          case "remaining":
            cmp = minRemainingDays(a) - minRemainingDays(b);
            break;
          case "status":
            cmp = packageStatusOf(a) - packageStatusOf(b);
            break;
          case "createdAt":
          default:
            cmp = a.createdAt.getTime() - b.createdAt.getTime();
            break;
        }
        return cmp * mul;
      });
    }

    customers = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }

  const total = fDob
    ? (
        await prisma.customer.findMany({
          where,
          select: { dateOfBirth: true },
          take: 400,
        })
      ).filter((c) => {
        if (!c.dateOfBirth) return false;
        const needle = fDob.toLowerCase();
        const label = formatDate(c.dateOfBirth).toLowerCase();
        const iso = c.dateOfBirth.toISOString().slice(0, 10);
        return label.includes(needle) || iso.includes(needle);
      }).length
    : totalBeforeDob;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sortKey = (isDbSort(sort) ||
  ["goi", "membership", "remaining", "status"].includes(sort)
    ? sort
    : "createdAt") as CustomerSortKey;

  const entries = buildTableEntries(customers);

  return (
    <div>
      <CustomersRefreshListener />
      <PageHeader
        title="Customers"
        description={`${total} khách hàng · gia đình thu gọn (ID … - GĐ)`}
        actions={
          allowWrite ? (
            <Link href="/customers/new">
              <Button>+ Tạo khách</Button>
            </Link>
          ) : undefined
        }
      />

      <CustomerSearchBar />

      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead>
              <CustomersTableHead
                currentSort={sortKey}
                currentDir={dir}
                searchParams={sp}
              />
            </thead>
            <tbody>
              <CustomersTableBody entries={entries} />
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted">
          <span>
            Trang {page}/{totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                className="rounded-lg border px-3 py-1.5 hover:bg-slate-50"
                href={`/customers?${new URLSearchParams({ ...sp, page: String(page - 1) } as Record<string, string>)}`}
              >
                Trước
              </Link>
            )}
            {page < totalPages && (
              <Link
                className="rounded-lg border px-3 py-1.5 hover:bg-slate-50"
                href={`/customers?${new URLSearchParams({ ...sp, page: String(page + 1) } as Record<string, string>)}`}
              >
                Sau
              </Link>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
