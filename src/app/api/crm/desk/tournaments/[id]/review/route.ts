import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentDesk, tournamentDbError } from "@/lib/tournament-desk";
import { ATTENDANCE } from "@/lib/tournament";

export const dynamic = "force-dynamic";

/** Staff approve a paid signup, or turn the request down. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireTournamentDesk();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const checkInId = String(body.checkInId || "").trim();
  const decision = body.decision === "approve" || body.decision === "reject" ? body.decision : "";
  if (!checkInId || !decision) {
    return NextResponse.json({ error: "Thiếu đăng ký hoặc quyết định." }, { status: 400 });
  }
  try {
    const row = await prisma.appTournamentCheckIn.findFirst({
      where: { id: checkInId, tournamentId: id },
      include: {
        tournament: { select: { endsAt: true } },
        customer: { select: { fullName: true, phone: true } },
      },
    });
    if (!row) {
      return NextResponse.json({ error: "Không thấy đăng ký." }, { status: 404 });
    }
    if (row.attendance !== ATTENDANCE.PENDING) {
      return NextResponse.json(
        { error: "Chỉ xử lý đăng ký đang chờ duyệt." },
        { status: 400 }
      );
    }
    if (decision === "approve" && Date.now() >= row.tournament.endsAt.getTime()) {
      return NextResponse.json({ error: "Giải đã kết thúc." }, { status: 400 });
    }
    const attendance =
      decision === "approve" ? ATTENDANCE.REGISTERED : ATTENDANCE.CANCELLED;
    const staffName = gate.user.displayName || gate.user.username;
    await prisma.appTournamentCheckIn.update({
      where: { id: row.id },
      data: { attendance, checkedByName: staffName },
    });
    const name = row.customer.fullName || "Vận động viên";
    return NextResponse.json({
      ok: true,
      attendance,
      fullName: name,
      phone: row.customer.phone,
      message:
        decision === "approve"
          ? `Đã duyệt ${name}.`
          : `Đã từ chối ${name}.`,
    });
  } catch (err) {
    return tournamentDbError(err, "Không lưu được duyệt.");
  }
}
