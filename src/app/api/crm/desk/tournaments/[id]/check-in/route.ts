import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/password";
import { normalizePhone, phoneShortId } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import {
  requireTournamentDesk,
  tournamentDbError,
} from "@/lib/tournament-desk";
import {
  ATTENDANCE,
  CHECKIN_SOURCE,
  VOUCHER_STATUS,
  checkInBlockReason,
  isWithinTournamentWindow,
  newVoucherPassToken,
  registerBlockReason,
  registerWindowReason,
  tournamentGivesVoucher,
} from "@/lib/tournament";

export const dynamic = "force-dynamic";

function generateCustomerCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let body = "";
  for (let i = 0; i < 6; i++) body += alphabet[bytes[i]! % alphabet.length];
  return `CUS-${body}`;
}

function phoneKeys(raw: string) {
  const digits = normalizePhone(raw);
  const display = digits.startsWith("0") ? digits : `0${digits}`;
  return {
    display,
    keys: Array.from(
      new Set(
        [digits, display, digits.replace(/^0+/, "")]
          .map((p) => p.trim())
          .filter((p) => p.length >= 9)
      )
    ),
  };
}

function athleteName(customer: { fullName: string | null }, typed: string) {
  return customer.fullName || typed || "Vận động viên";
}

async function issueVoucher(
  tx: Prisma.TransactionClient,
  opts: {
    tournamentId: string;
    customerId: string;
    discountVnd: number;
    endsAt: Date;
  }
) {
  if (!tournamentGivesVoucher(opts.discountVnd)) return;
  const existing = await tx.appTournamentVoucher.findUnique({
    where: {
      tournamentId_customerId: {
        tournamentId: opts.tournamentId,
        customerId: opts.customerId,
      },
    },
  });
  if (existing) {
    if (!existing.passToken) {
      await tx.appTournamentVoucher.update({
        where: { id: existing.id },
        data: { passToken: newVoucherPassToken(), passExpiresAt: opts.endsAt },
      });
    }
    return;
  }
  await tx.appTournamentVoucher.create({
    data: {
      tournamentId: opts.tournamentId,
      customerId: opts.customerId,
      status: VOUCHER_STATUS.ISSUED,
      passToken: newVoucherPassToken(),
      passExpiresAt: opts.endsAt,
    },
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireTournamentDesk();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const intent = body.intent === "register" ? "register" : "check-in";
  const customerId = String(body.customerId || "").trim();
  const fullName = String(body.fullName || "").trim().slice(0, 120);
  const phoneRaw = String(body.phone || "").trim();

  try {
    const tournament = await prisma.appTournament.findUnique({ where: { id } });
    if (!tournament) {
      return NextResponse.json({ error: "Không thấy giải." }, { status: 404 });
    }
    const now = new Date();
    if (intent === "check-in") {
      if (!isWithinTournamentWindow(tournament.startsAt, tournament.endsAt, now)) {
        return NextResponse.json(
          { error: "Chỉ check-in trong ngày giải." },
          { status: 400 }
        );
      }
    } else {
      const closed = registerWindowReason(
        tournament.startsAt,
        tournament.endsAt,
        tournament.eventTime,
        now
      );
      if (closed) {
        return NextResponse.json({ error: closed }, { status: 400 });
      }
    }

    let customer = customerId
      ? await prisma.appCustomer.findFirst({
          where: { id: customerId, status: "ACTIVE" },
        })
      : null;

    if (!customer && phoneRaw) {
      const { display, keys } = phoneKeys(phoneRaw);
      if (display.length < 9 || display.length > 11) {
        return NextResponse.json(
          { error: "SĐT không hợp lệ (9–11 số)." },
          { status: 400 }
        );
      }
      customer = await prisma.appCustomer.findFirst({
        where: {
          OR: [
            { phoneNormalized: { in: keys } },
            { phone: { in: keys } },
            { username: { in: keys } },
          ],
        },
        orderBy: { createdAt: "asc" },
      });
      if (!customer) {
        if (!fullName) {
          return NextResponse.json(
            { error: "Khách chưa có tài khoản. Nhập tên vận động viên." },
            { status: 400 }
          );
        }
        const password =
          display.length >= 8 ? display : `Oasis${display}`.padEnd(8, "0");
        const passwordHash = await hashPassword(password);
        const shortId = phoneShortId(display);
        for (let i = 0; i < 6; i++) {
          const customerCode = generateCustomerCode();
          try {
            customer = await prisma.appCustomer.create({
              data: {
                customerCode,
                username: display,
                passwordHash,
                status: "ACTIVE",
                fullName,
                phone: display,
                phoneNormalized: display,
                phoneLast4: shortId,
                shortId,
                segment: "WALK_IN",
                identityToken: `oq_${randomBytes(18).toString("base64url")}`,
                adminConfirmedAt: new Date(),
                adminNote:
                  intent === "register"
                    ? `Đăng ký giải ${tournament.name}`
                    : `Check-in giải ${tournament.name}`,
              },
            });
            break;
          } catch (e) {
            if (
              e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code === "P2002"
            ) {
              continue;
            }
            throw e;
          }
        }
      } else if (!customer.fullName && fullName) {
        customer = await prisma.appCustomer.update({
          where: { id: customer.id },
          data: { fullName },
        });
      }
    }

    if (!customer) {
      return NextResponse.json(
        { error: "Nhập số điện thoại vận động viên." },
        { status: 400 }
      );
    }

    const name = athleteName(customer, fullName);
    const staffName = gate.user.displayName || gate.user.username;
    const existing = await prisma.appTournamentCheckIn.findUnique({
      where: {
        tournamentId_customerId: {
          tournamentId: id,
          customerId: customer.id,
        },
      },
    });

    if (intent === "register") {
      if (
        existing?.attendance === ATTENDANCE.REGISTERED ||
        existing?.attendance === ATTENDANCE.PENDING
      ) {
        if (existing.attendance === ATTENDANCE.PENDING) {
          await prisma.appTournamentCheckIn.update({
            where: { id: existing.id },
            data: {
              attendance: ATTENDANCE.REGISTERED,
              checkedByName: staffName,
            },
          });
          return NextResponse.json({
            ok: true,
            already: false,
            fullName: name,
            attendance: ATTENDANCE.REGISTERED,
            message: `Đã duyệt ${name}.`,
          });
        }
        return NextResponse.json({
          ok: true,
          already: true,
          fullName: name,
          attendance: ATTENDANCE.REGISTERED,
          message: `${name} đã đăng ký.`,
        });
      }
      if (existing) {
        return NextResponse.json(
          { error: registerBlockReason(existing.attendance) || "Không đăng ký được." },
          { status: 400 }
        );
      }
      await prisma.appTournamentCheckIn.create({
        data: {
          tournamentId: id,
          customerId: customer.id,
          source: CHECKIN_SOURCE.STAFF,
          attendance: ATTENDANCE.REGISTERED,
          checkedInAt: null,
          checkedByName: staffName,
        },
      });
      return NextResponse.json({
        ok: true,
        already: false,
        fullName: name,
        attendance: ATTENDANCE.REGISTERED,
        message: `Đã đăng ký ${name}.`,
      });
    }

    if (existing?.attendance === ATTENDANCE.PRESENT) {
      return NextResponse.json({
        ok: true,
        already: true,
        fullName: name,
        attendance: ATTENDANCE.PRESENT,
        message: `${name} đã check-in.`,
      });
    }
    if (existing) {
      const reason = checkInBlockReason(existing.attendance);
      if (reason) {
        return NextResponse.json({ error: reason }, { status: 400 });
      }
      await prisma.$transaction(async (tx) => {
        await tx.appTournamentCheckIn.update({
          where: { id: existing.id },
          data: {
            attendance: ATTENDANCE.PRESENT,
            checkedInAt: now,
            source: CHECKIN_SOURCE.STAFF,
            checkedByName: staffName,
          },
        });
        await issueVoucher(tx, {
          tournamentId: id,
          customerId: customer.id,
          discountVnd: tournament.discountVnd,
          endsAt: tournament.endsAt,
        });
      });
      return NextResponse.json({
        ok: true,
        already: false,
        fullName: name,
        attendance: ATTENDANCE.PRESENT,
        message: `Đã check-in ${name}.`,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.appTournamentCheckIn.create({
        data: {
          tournamentId: id,
          customerId: customer.id,
          source: CHECKIN_SOURCE.STAFF,
          attendance: ATTENDANCE.PRESENT,
          checkedInAt: now,
          checkedByName: staffName,
        },
      });
      await issueVoucher(tx, {
        tournamentId: id,
        customerId: customer.id,
        discountVnd: tournament.discountVnd,
        endsAt: tournament.endsAt,
      });
    });

    return NextResponse.json({
      ok: true,
      already: false,
      fullName: name,
      attendance: ATTENDANCE.PRESENT,
      message: `Đã check-in ${name}.`,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json({ ok: true, already: true });
    }
    return tournamentDbError(err, "Không lưu được vận động viên.");
  }
}
