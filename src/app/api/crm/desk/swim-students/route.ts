import { NextRequest, NextResponse } from "next/server";
import { requireDeskZone } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { getSwimPackage } from "@/lib/swim-packages";

export const dynamic = "force-dynamic";

const ZONE = "SWIM_LESSON";

function serialize(row: {
  id: string;
  fullName: string;
  phone: string | null;
  packageId: string;
  packageLabel: string;
  sessionsTotal: number;
  sessionsLeft: number;
  bonusVisitsTotal: number;
  bonusVisitsLeft: number;
  status: string;
  note: string | null;
  startedAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    packageId: row.packageId,
    packageLabel: row.packageLabel,
    sessionsTotal: row.sessionsTotal,
    sessionsLeft: row.sessionsLeft,
    bonusVisitsTotal: row.bonusVisitsTotal,
    bonusVisitsLeft: row.bonusVisitsLeft,
    status: row.status,
    note: row.note,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** GET danh sách học viên bơi. */
export async function GET(req: NextRequest) {
  const gate = await requireDeskZone(ZONE);
  if ("error" in gate) return gate.error;

  const q = String(req.nextUrl.searchParams.get("q") || "")
    .trim()
    .toLowerCase();
  const status = String(req.nextUrl.searchParams.get("status") || "ACTIVE")
    .trim()
    .toUpperCase();

  const rows = await prisma.appSwimStudent.findMany({
    where: {
      ...(status && status !== "ALL" ? { status } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { phoneNormalized: { contains: q.replace(/\D/g, "") } },
              { packageLabel: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({
    ok: true,
    students: rows.map(serialize),
  });
}

/** POST thêm học viên. Body: { fullName, phone?, packageId, note? } */
export async function POST(req: NextRequest) {
  const gate = await requireDeskZone(ZONE);
  if ("error" in gate) return gate.error;

  try {
    const body = await req.json().catch(() => ({}));
    const fullName = String(body.fullName || "").trim().slice(0, 120);
    const phoneRaw = String(body.phone || "").trim();
    const packageId = String(body.packageId || "").trim();
    const note = String(body.note || "").trim().slice(0, 500) || null;
    const pkg = getSwimPackage(packageId);

    if (fullName.length < 2) {
      return NextResponse.json(
        { error: "Nhập họ tên học viên." },
        { status: 400 }
      );
    }
    if (!pkg) {
      return NextResponse.json({ error: "Chọn gói học." }, { status: 400 });
    }

    const sessionsTotal = pkg.sessions ?? 0;
    const phoneNormalized = phoneRaw ? normalizePhone(phoneRaw) : null;

    const row = await prisma.appSwimStudent.create({
      data: {
        fullName,
        phone: phoneRaw || null,
        phoneNormalized: phoneNormalized || null,
        packageId: pkg.id,
        packageLabel: `${pkg.programLabel} · ${pkg.name}`,
        sessionsTotal,
        sessionsLeft: sessionsTotal,
        bonusVisitsTotal: pkg.bonusVisits,
        bonusVisitsLeft: pkg.bonusVisits,
        status: "ACTIVE",
        note,
        startedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, student: serialize(row) });
  } catch (e) {
    console.error("[desk/swim-students POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/**
 * PATCH cập nhật / trừ buổi.
 * Body: { id, action?: "use-session"|"use-bonus"|"set", ...fields }
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireDeskZone(ZONE);
  if ("error" in gate) return gate.error;

  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
    }
    const existing = await prisma.appSwimStudent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
    }

    const action = String(body.action || "set").trim();

    if (action === "use-session") {
      if (existing.sessionsLeft <= 0 && existing.sessionsTotal > 0) {
        return NextResponse.json(
          { error: "Đã hết buổi học." },
          { status: 409 }
        );
      }
      const sessionsLeft = Math.max(0, existing.sessionsLeft - 1);
      const row = await prisma.appSwimStudent.update({
        where: { id },
        data: {
          sessionsLeft,
          status:
            sessionsLeft === 0 && existing.sessionsTotal > 0
              ? "DONE"
              : existing.status,
        },
      });
      return NextResponse.json({ ok: true, student: serialize(row) });
    }

    if (action === "use-bonus") {
      if (existing.bonusVisitsLeft <= 0) {
        return NextResponse.json(
          { error: "Đã hết lượt tự chọn." },
          { status: 409 }
        );
      }
      const row = await prisma.appSwimStudent.update({
        where: { id },
        data: { bonusVisitsLeft: existing.bonusVisitsLeft - 1 },
      });
      return NextResponse.json({ ok: true, student: serialize(row) });
    }

    const data: {
      fullName?: string;
      phone?: string | null;
      phoneNormalized?: string | null;
      status?: string;
      note?: string | null;
      sessionsLeft?: number;
      bonusVisitsLeft?: number;
    } = {};
    if (body.fullName != null) {
      const n = String(body.fullName).trim().slice(0, 120);
      if (n.length >= 2) data.fullName = n;
    }
    if (body.phone != null) {
      const phoneRaw = String(body.phone).trim();
      data.phone = phoneRaw || null;
      data.phoneNormalized = phoneRaw ? normalizePhone(phoneRaw) : null;
    }
    if (body.status != null) {
      const st = String(body.status).trim().toUpperCase();
      if (["ACTIVE", "PAUSED", "DONE"].includes(st)) data.status = st;
    }
    if (body.note != null) {
      data.note = String(body.note).trim().slice(0, 500) || null;
    }
    if (body.sessionsLeft != null) {
      data.sessionsLeft = Math.max(
        0,
        Math.min(existing.sessionsTotal || 999, Math.round(Number(body.sessionsLeft) || 0))
      );
    }
    if (body.bonusVisitsLeft != null) {
      data.bonusVisitsLeft = Math.max(
        0,
        Math.min(
          existing.bonusVisitsTotal || 999,
          Math.round(Number(body.bonusVisitsLeft) || 0)
        )
      );
    }

    const row = await prisma.appSwimStudent.update({
      where: { id },
      data,
    });
    return NextResponse.json({ ok: true, student: serialize(row) });
  } catch (e) {
    console.error("[desk/swim-students PATCH]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
