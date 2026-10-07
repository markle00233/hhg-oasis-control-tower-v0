"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { departmentLabel } from "@/config/crm.config";
import { formatDateTime } from "@/lib/utils";

type Item = {
  id: string;
  title: string;
  detail: string | null;
  href: string | null;
  actorName: string;
  department: string | null;
  at: string;
  unread: boolean;
};

async function resolveUserId(sessionUserId: string) {
  if (sessionUserId !== "demo-admin") return sessionUserId;
  const fallback = await prisma.user.findFirst({
    where: { OR: [{ email: "1" }, { email: "admin@hhgo.local" }] },
    select: { id: true },
  });
  return fallback?.id ?? sessionUserId;
}

export async function getOpsNotices() {
  const session = await auth();
  if (!session?.user) return { unread: 0, items: [] as Item[] };

  const myId = await resolveUserId(session.user.id);
  const rows = await prisma.opsNotice.findMany({
    where: {
      OR: [{ actorId: null }, { actorId: { not: myId } }],
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      reads: { where: { userId: myId }, select: { userId: true } },
    },
  });

  const items: Item[] = rows.map((n) => ({
    id: n.id,
    title: n.title,
    detail: n.detail,
    href: n.href,
    actorName: n.actorName,
    department: n.department ? departmentLabel(n.department) : null,
    at: formatDateTime(n.createdAt),
    unread: n.reads.length === 0,
  }));

  return {
    unread: items.filter((i) => i.unread).length,
    items,
  };
}

export async function markOpsNoticesRead() {
  const session = await auth();
  if (!session?.user) return { ok: false as const };
  const myId = await resolveUserId(session.user.id);
  const unread = await prisma.opsNotice.findMany({
    where: {
      OR: [{ actorId: null }, { actorId: { not: myId } }],
      reads: { none: { userId: myId } },
    },
    select: { id: true },
    take: 50,
  });
  if (unread.length > 0) {
    await prisma.opsNoticeRead.createMany({
      data: unread.map((n) => ({ noticeId: n.id, userId: myId })),
      skipDuplicates: true,
    });
  }
  return { ok: true as const };
}
