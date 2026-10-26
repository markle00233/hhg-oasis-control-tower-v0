import type { PrismaClient } from "@prisma/client";
import { ADMIN_PANEL_PASSWORD, ADMIN_PANEL_USERNAME } from "@/lib/admin-panel";
import { hashPassword } from "@/lib/password";

/** Create or refresh the global admin so the desk login screen keeps working. */
export async function ensureAdminPanelUser(
  prisma: PrismaClient
): Promise<"created" | "updated"> {
  const passwordHash = await hashPassword(ADMIN_PANEL_PASSWORD);
  const existing = await prisma.user.findUnique({
    where: { username: ADMIN_PANEL_USERNAME },
    select: { id: true },
  });
  if (!existing) {
    await prisma.user.create({
      data: {
        username: ADMIN_PANEL_USERNAME,
        displayName: ADMIN_PANEL_USERNAME,
        passwordHash,
        systemRole: "SYSTEM_ADMIN",
        status: "ACTIVE",
      },
    });
    return "created";
  }
  await prisma.user.update({
    where: { id: existing.id },
    data: {
      displayName: ADMIN_PANEL_USERNAME,
      passwordHash,
      systemRole: "SYSTEM_ADMIN",
      status: "ACTIVE",
    },
  });
  return "updated";
}
