import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export async function writeAudit(opts: {
  actorType: "STAFF" | "CUSTOMER" | "SYSTEM";
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  zoneCode?: string | null;
  payload?: Record<string, unknown>;
}) {
  try {
    await prisma.appAuditLog.create({
      data: {
        actorType: opts.actorType,
        actorId: opts.actorId || null,
        action: opts.action,
        entityType: opts.entityType,
        entityId: opts.entityId || null,
        zoneCode: opts.zoneCode || null,
        payload: opts.payload
          ? (opts.payload as Prisma.InputJsonValue)
          : undefined,
      },
    });
  } catch (e) {
    console.error("[audit]", e);
  }
}
