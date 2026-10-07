import { prisma } from "@/lib/prisma";

export async function notifyOps(params: {
  actorId: string | null;
  title: string;
  detail?: string;
  href?: string;
}) {
  try {
    const actor = params.actorId
      ? await prisma.user.findUnique({
          where: { id: params.actorId },
          select: { fullName: true, department: true },
        })
      : null;
    await prisma.opsNotice.create({
      data: {
        actorId: params.actorId,
        actorName: actor?.fullName || "Nhân viên",
        department: actor?.department || null,
        title: params.title,
        detail: params.detail ?? null,
        href: params.href ?? null,
      },
    });
  } catch (err) {
    console.error("[notifyOps]", err);
  }
}
