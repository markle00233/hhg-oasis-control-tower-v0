import { prisma } from "@/lib/prisma";

/** Map session user id → DB user id (tránh FK lỗi). */
export async function resolveActorIdForSession(
  sessionUserId: string | undefined | null
): Promise<string | null> {
  if (!sessionUserId) return null;
  const exists = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { id: true },
  });
  return exists?.id ?? null;
}
