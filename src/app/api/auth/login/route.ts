import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toSafeUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { setSessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!username || !password) {
    return NextResponse.json(
      { error: "Tài khoản hoặc mật khẩu không đúng." },
      { status: 401 }
    );
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } });

    // Generic failure — do not reveal whether username exists.
    if (!user) {
      return NextResponse.json(
        { error: "Tài khoản hoặc mật khẩu không đúng." },
        { status: 401 }
      );
    }

    if (user.status === "DISABLED") {
      return NextResponse.json(
        { error: "Tài khoản đã bị vô hiệu hóa." },
        { status: 403 }
      );
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "Tài khoản hoặc mật khẩu không đúng." },
        { status: 401 }
      );
    }

    await setSessionCookie(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    return NextResponse.json({
      authenticated: true,
      user: toSafeUser(fresh),
      assignments: [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[auth/login]", msg);
    const dbDown =
      msg.includes("Can't reach database server") ||
      msg.includes("PrismaClientInitializationError") ||
      msg.includes("P1001");
    return NextResponse.json(
      {
        error: dbDown
          ? "Không kết nối được database. Kiểm tra DATABASE_URL / mạng, hoặc dùng API Vercel."
          : "Đăng nhập tạm lỗi. Thử lại sau.",
      },
      { status: 500 }
    );
  }
}
