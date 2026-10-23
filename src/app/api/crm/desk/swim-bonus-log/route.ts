import { NextRequest, NextResponse } from "next/server";
import { canAccessDeskZone, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Log lượt tự chọn của một học viên — Admin hoặc quầy học bơi. */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (!canAccessDeskZone(auth.user, "SWIM_LESSON")) {
    return NextResponse.json(
      { error: "Không có quyền xem nhật ký." },
      { status: 403 }
    );
  }

  const studentId = String(req.nextUrl.searchParams.get("studentId") || "").trim();
  if (!studentId) {
    return NextResponse.json({ error: "Thiếu học viên." }, { status: 400 });
  }

  const student = await prisma.appSwimStudent.findUnique({
    where: { id: studentId },
    select: { id: true, fullName: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Không tìm thấy học viên." }, { status: 404 });
  }

  const logs = await prisma.appSwimBonusLog.findMany({
    where: { studentId },
    select: { id: true, purpose: true, usedAt: true },
    orderBy: { usedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    ok: true,
    student,
    logs: logs.map((row) => ({
      id: row.id,
      purpose: row.purpose,
      usedAt: row.usedAt.toISOString(),
    })),
  });
}
