import { NextRequest, NextResponse } from "next/server";
import type { SystemRole, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSystemAdmin, toSafeUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

/**
 * GET /api/users
 *
 * V1 product tradeoff: ACTIVE account directory is readable without login
 * so General Overview Account Switcher (P2) can list names before auth.
 * Only safe public fields — never passwordHash.
 */
export async function GET() {
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: { username: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      systemRole: true,
      status: true,
    },
  });

  return NextResponse.json({
    ok: true,
    users,
    // Public ACTIVE directory for Account Switcher (General Overview). Secrets never included.
  });
}

/**
 * POST /api/users — SYSTEM_ADMIN only. Creates identity; no UnitAssignment.
 */
export async function POST(req: NextRequest) {
  const gate = await requireSystemAdmin();
  if ("error" in gate) return gate.error;

  let body: {
    username?: string;
    displayName?: string;
    password?: string;
    systemRole?: SystemRole;
    status?: UserStatus;
    avatarUrl?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = String(body.username || "")
    .trim()
    .toUpperCase();
  const displayName = String(body.displayName || username).trim();
  const password = String(body.password || "");
  const systemRole: SystemRole =
    body.systemRole === "SYSTEM_ADMIN" ? "SYSTEM_ADMIN" : "STANDARD_USER";
  const status: UserStatus =
    body.status === "DISABLED" ? "DISABLED" : "ACTIVE";

  if (!username || !/^[A-Z0-9_]+$/.test(username)) {
    return NextResponse.json(
      { error: "username không hợp lệ (A-Z, 0-9, _)." },
      { status: 400 }
    );
  }

  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        displayName,
        passwordHash,
        systemRole,
        status,
        avatarUrl: body.avatarUrl ?? null,
      },
    });
    return NextResponse.json(
      { ok: true, user: toSafeUser(user) },
      { status: 201 }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Create failed";
    if (String(msg).includes("Unique") || String(e).includes("Unique")) {
      return NextResponse.json(
        { error: "username đã tồn tại." },
        { status: 409 }
      );
    }
    if (msg.includes("Password must")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: "Không tạo được tài khoản." }, { status: 500 });
  }
}
