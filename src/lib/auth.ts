import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readSessionUserId } from "@/lib/session";

export type SafeUser = {
  id: string;
  username: string;
  displayName: string;
  systemRole: User["systemRole"];
  status: User["status"];
  avatarUrl: string | null;
  deskZone: string | null;
  lastLoginAt: Date | null;
};

/** Strip secrets — never include passwordHash. */
export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    systemRole: user.systemRole,
    status: user.status,
    avatarUrl: user.avatarUrl,
    deskZone: user.deskZone ?? null,
    lastLoginAt: user.lastLoginAt,
  };
}

export function isSystemAdmin(user: Pick<User, "systemRole">): boolean {
  return user.systemRole === "SYSTEM_ADMIN";
}

/** Zone-desk staff or SYSTEM_ADMIN. */
export function canAccessDeskZone(
  user: Pick<User, "systemRole" | "deskZone">,
  zoneCode: string
): boolean {
  if (isSystemAdmin(user)) return true;
  const z = zoneCode.trim().toUpperCase();
  return !!user.deskZone && user.deskZone.toUpperCase() === z;
}

/** Current User from trusted session cookie, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const userId = await readSessionUserId();
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  if (user.status !== "ACTIVE") return null;
  return user;
}

export async function requireAuth(): Promise<
  { user: User } | { error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { error: "Vui lòng chọn tài khoản để tiếp tục." },
        { status: 401 }
      ),
    };
  }
  return { user };
}

export async function requireSystemAdmin(): Promise<
  { user: User } | { error: NextResponse }
> {
  const auth = await requireAuth();
  if ("error" in auth) return auth;
  if (!isSystemAdmin(auth.user)) {
    return {
      error: NextResponse.json(
        { error: "Không có quyền hệ thống." },
        { status: 403 }
      ),
    };
  }
  return auth;
}

/** Desk quầy: SYSTEM_ADMIN mọi khu; acc khu chỉ đúng deskZone của mình. */
export async function requireDeskZone(
  zoneCode: string
): Promise<{ user: User } | { error: NextResponse }> {
  const auth = await requireAuth();
  if ("error" in auth) return auth;
  const zone = String(zoneCode || "").trim().toUpperCase();
  if (!zone) {
    return {
      error: NextResponse.json({ error: "Thiếu khu vực." }, { status: 400 }),
    };
  }
  if (!canAccessDeskZone(auth.user, zone)) {
    return {
      error: NextResponse.json(
        { error: "Tài khoản này không thuộc khu vực đã chọn." },
        { status: 403 }
      ),
    };
  }
  return auth;
}
