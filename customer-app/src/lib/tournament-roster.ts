import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  ASSET_KIND,
  ATTENDANCE,
  CHECKIN_SOURCE,
  VOUCHER_STATUS,
  attendanceAfterWindow,
  cancelBlockReason,
  checkInBlockReason,
  isWithinTournamentWindow,
  newVoucherPassToken,
  registerBlockReason,
  registerWindowReason,
  rescheduleNote,
  tournamentDayLabel,
  tournamentGivesVoucher,
  tournamentStatusAt,
  TOURNAMENT_STATUS,
  TOURNAMENT_VOUCHER_ZONES,
  voucherTitle,
  ZONE_LABEL,
  parseVoucherZone,
} from "./tournament";

export type RosterResult =
  | { ok: true; already?: boolean; attendance: string; message: string }
  | { ok: false; status: number; error: string };

/** The screen derives status from the clock. These writes only keep the rows in step. */
function paced(run: (now: Date) => Promise<void>) {
  let at = 0;
  let pending: Promise<void> | null = null;
  return (now = new Date()) => {
    if (pending) return pending;
    if (Date.now() - at < 20_000) return Promise.resolve();
    pending = run(now)
      .then(() => {
        at = Date.now();
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}

/** Signed-up athletes who never arrive become Không đến once the event day ends. */
export const closeMissedAthletes = paced(async (now) => {
  await prisma.appTournamentCheckIn.updateMany({
    where: {
      attendance: ATTENDANCE.REGISTERED,
      checkedInAt: null,
      tournament: { endsAt: { lte: now } },
    },
    data: { attendance: ATTENDANCE.NO_SHOW },
  });
});

/** Writes Sắp diễn ra / Đang diễn ra / Đã kết thúc from the clock. */
export const syncTournamentStatuses = paced(async (now) => {
  await prisma.appTournament.updateMany({
    where: {
      endsAt: { lte: now },
      NOT: { status: TOURNAMENT_STATUS.ENDED },
    },
    data: { status: TOURNAMENT_STATUS.ENDED },
  });
  const open = await prisma.appTournament.findMany({
    where: { endsAt: { gt: now } },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      eventTime: true,
      status: true,
    },
  });
  const ids: Record<"UPCOMING" | "LIVE", string[]> = { UPCOMING: [], LIVE: [] };
  for (const row of open) {
    const next = tournamentStatusAt(row.startsAt, row.endsAt, row.eventTime, now);
    if (next !== "ENDED" && next !== row.status) ids[next].push(row.id);
  }
  await Promise.all(
    (["UPCOMING", "LIVE"] as const)
      .filter((status) => ids[status].length > 0)
      .map((status) =>
        prisma.appTournament.updateMany({
          where: { id: { in: ids[status] } },
          data: { status },
        })
      )
  );
});

export async function listTournaments(customerId: string) {
  const now = new Date();
  await closeMissedAthletes(now);
  await syncTournamentStatuses(now);
  const rows = await prisma.appTournament.findMany({
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      name: true,
      court: true,
      eventTime: true,
      startsAt: true,
      endsAt: true,
      originalStartsAt: true,
      originalEventTime: true,
      checkIns: {
        where: { customerId },
        select: { attendance: true },
        take: 1,
      },
      assets: {
        where: { kind: ASSET_KIND.GALLERY_LINK },
        select: { url: true },
        take: 1,
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    dayLabel: tournamentDayLabel(row.startsAt),
    court: row.court,
    eventTime: row.eventTime,
    galleryUrl: row.assets[0]?.url || null,
    startsAt: row.startsAt.toISOString(),
    status: tournamentStatusAt(row.startsAt, row.endsAt, row.eventTime, now),
    rescheduleNote: rescheduleNote({
      originalStartsAt: row.originalStartsAt,
      originalEventTime: row.originalEventTime,
      startsAt: row.startsAt,
      eventTime: row.eventTime,
    }),
    attendance: row.checkIns[0]
      ? attendanceAfterWindow(row.checkIns[0].attendance, row.endsAt, now)
      : null,
  }));
}

export async function joinTournament(
  customerId: string,
  tournamentId: string
): Promise<RosterResult> {
  const now = new Date();
  await closeMissedAthletes(now);
  const tournament = await prisma.appTournament.findUnique({
    where: { id: tournamentId },
  });
  if (!tournament) {
    return { ok: false, status: 404, error: "Không thấy giải." };
  }
  const closed = registerWindowReason(
    tournament.startsAt,
    tournament.endsAt,
    tournament.eventTime,
    now
  );
  if (closed) return { ok: false, status: 400, error: closed };
  const existing = await prisma.appTournamentCheckIn.findUnique({
    where: { tournamentId_customerId: { tournamentId, customerId } },
  });
  if (existing) {
    if (existing.attendance === ATTENDANCE.REGISTERED) {
      return {
        ok: true,
        already: true,
        attendance: ATTENDANCE.REGISTERED,
        message: "Bạn đã đăng ký.",
      };
    }
    return {
      ok: false,
      status: 400,
      error: registerBlockReason(existing.attendance) || "Không đăng ký được.",
    };
  }
  try {
    await prisma.appTournamentCheckIn.create({
      data: {
        tournamentId,
        customerId,
        source: CHECKIN_SOURCE.APP,
        attendance: ATTENDANCE.REGISTERED,
        checkedInAt: null,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        ok: true,
        already: true,
        attendance: ATTENDANCE.REGISTERED,
        message: "Bạn đã đăng ký.",
      };
    }
    throw err;
  }
  return {
    ok: true,
    attendance: ATTENDANCE.REGISTERED,
    message: "Đã đăng ký.",
  };
}

export async function cancelTournamentEntry(
  customerId: string,
  tournamentId: string
): Promise<RosterResult> {
  const now = new Date();
  await closeMissedAthletes(now);
  const tournament = await prisma.appTournament.findUnique({
    where: { id: tournamentId },
  });
  if (!tournament) {
    return { ok: false, status: 404, error: "Không thấy giải." };
  }
  const existing = await prisma.appTournamentCheckIn.findUnique({
    where: { tournamentId_customerId: { tournamentId, customerId } },
  });
  if (!existing) {
    return { ok: false, status: 404, error: "Bạn chưa đăng ký giải này." };
  }
  if (existing.attendance === ATTENDANCE.CANCELLED) {
    return {
      ok: true,
      already: true,
      attendance: ATTENDANCE.CANCELLED,
      message: "Bạn đã hủy đăng ký.",
    };
  }
  const reason = cancelBlockReason(existing.attendance, tournament.endsAt, now);
  if (reason) return { ok: false, status: 400, error: reason };
  await prisma.appTournamentCheckIn.update({
    where: { id: existing.id },
    data: { attendance: ATTENDANCE.CANCELLED },
  });
  return {
    ok: true,
    attendance: ATTENDANCE.CANCELLED,
    message: "Đã hủy đăng ký.",
  };
}

type VoucherRow = {
  status: string;
  passToken: string | null;
  redeemedZone: string | null;
  redeemedVnd: number | null;
};

export type ScanVoucher = {
  status: string;
  title: string;
  amountVnd: number;
  passToken: string | null;
  zoneLabel: string | null;
};

export type ScanEvent = {
  name: string;
  dayLabel: string;
  court: string | null;
  eventTime: string | null;
  summary: string | null;
  galleryUrl: string | null;
  resultsImage: string | null;
  discountVnd: number;
  status: string;
  rescheduleNote: string | null;
  open: boolean;
  ended: boolean;
  loggedIn: boolean;
  attendance: string | null;
  voucher: ScanVoucher | null;
};

function scanVoucher(
  discountVnd: number,
  voucher: VoucherRow | null
): ScanVoucher | null {
  if (!voucher || !tournamentGivesVoucher(discountVnd)) return null;
  const zone = parseVoucherZone(voucher.redeemedZone || "");
  return {
    status: voucher.status,
    title: voucherTitle(voucher.redeemedVnd || discountVnd),
    amountVnd: voucher.redeemedVnd || Math.max(0, Math.round(discountVnd)),
    passToken: voucher.passToken,
    zoneLabel: zone ? ZONE_LABEL[zone] : null,
  };
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
  if (!tournamentGivesVoucher(opts.discountVnd)) return null;
  const existing = await tx.appTournamentVoucher.findUnique({
    where: {
      tournamentId_customerId: {
        tournamentId: opts.tournamentId,
        customerId: opts.customerId,
      },
    },
  });
  if (existing?.passToken) return existing;
  const passToken = newVoucherPassToken();
  if (existing) {
    return tx.appTournamentVoucher.update({
      where: { id: existing.id },
      data: { passToken, passExpiresAt: opts.endsAt },
    });
  }
  return tx.appTournamentVoucher.create({
    data: {
      tournamentId: opts.tournamentId,
      customerId: opts.customerId,
      status: VOUCHER_STATUS.ISSUED,
      passToken,
      passExpiresAt: opts.endsAt,
    },
  });
}

async function eventByToken(token: string) {
  return prisma.appTournament.findUnique({
    where: { checkInToken: token },
    include: { assets: true },
  });
}

function presentEvent(
  tournament: NonNullable<Awaited<ReturnType<typeof eventByToken>>>,
  opts: {
    now: Date;
    loggedIn: boolean;
    attendance: string | null;
    voucher: VoucherRow | null;
  }
): ScanEvent {
  const gallery = tournament.assets.find((a) => a.kind === ASSET_KIND.GALLERY_LINK);
  const results = tournament.assets.find((a) => a.kind === ASSET_KIND.RESULTS_IMAGE);
  return {
    name: tournament.name,
    dayLabel: tournamentDayLabel(tournament.startsAt),
    court: tournament.court,
    eventTime: tournament.eventTime,
    summary: tournament.summary,
    galleryUrl: gallery?.url || null,
    resultsImage: results?.url || null,
    discountVnd: tournament.discountVnd,
    status: tournamentStatusAt(
      tournament.startsAt,
      tournament.endsAt,
      tournament.eventTime,
      opts.now
    ),
    rescheduleNote: rescheduleNote({
      originalStartsAt: tournament.originalStartsAt,
      originalEventTime: tournament.originalEventTime,
      startsAt: tournament.startsAt,
      eventTime: tournament.eventTime,
    }),
    open: isWithinTournamentWindow(tournament.startsAt, tournament.endsAt, opts.now),
    ended: opts.now.getTime() >= tournament.endsAt.getTime(),
    loggedIn: opts.loggedIn,
    attendance: opts.attendance
      ? attendanceAfterWindow(opts.attendance, tournament.endsAt, opts.now)
      : null,
    voucher: scanVoucher(tournament.discountVnd, opts.voucher),
  };
}

export async function loadScanEvent(token: string, customerId: string | null) {
  const now = new Date();
  await closeMissedAthletes(now);
  await syncTournamentStatuses(now);
  const tournament = await eventByToken(token);
  if (!tournament) return null;
  if (!customerId) {
    return presentEvent(tournament, {
      now,
      loggedIn: false,
      attendance: null,
      voucher: null,
    });
  }
  const [entry, voucher] = await Promise.all([
    prisma.appTournamentCheckIn.findUnique({
      where: { tournamentId_customerId: { tournamentId: tournament.id, customerId } },
    }),
    prisma.appTournamentVoucher.findUnique({
      where: { tournamentId_customerId: { tournamentId: tournament.id, customerId } },
    }),
  ]);
  let pass = voucher;
  if (
    entry?.attendance === ATTENDANCE.PRESENT &&
    voucher &&
    !voucher.passToken &&
    tournamentGivesVoucher(tournament.discountVnd) &&
    isWithinTournamentWindow(tournament.startsAt, tournament.endsAt, now)
  ) {
    pass = await prisma.appTournamentVoucher.update({
      where: { id: voucher.id },
      data: { passToken: newVoucherPassToken(), passExpiresAt: tournament.endsAt },
    });
  }
  return presentEvent(tournament, {
    now,
    loggedIn: true,
    attendance: entry?.attendance || null,
    voucher: pass,
  });
}

export async function scanCheckIn(customerId: string, token: string): Promise<
  | { ok: true; already: boolean; event: ScanEvent }
  | { ok: false; status: number; error: string }
> {
  const now = new Date();
  const tournament = await eventByToken(token);
  if (!tournament) return { ok: false, status: 404, error: "Không thấy giải." };
  if (!isWithinTournamentWindow(tournament.startsAt, tournament.endsAt, now)) {
    return { ok: false, status: 400, error: "Chỉ check-in trong ngày giải." };
  }
  const existing = await prisma.appTournamentCheckIn.findUnique({
    where: {
      tournamentId_customerId: { tournamentId: tournament.id, customerId },
    },
  });
  if (existing?.attendance === ATTENDANCE.PRESENT) {
    const event = await loadScanEvent(token, customerId);
    return { ok: true, already: true, event: event! };
  }
  if (!existing) {
    const closed = registerWindowReason(
      tournament.startsAt,
      tournament.endsAt,
      tournament.eventTime,
      now
    );
    if (closed) return { ok: false, status: 400, error: closed };
  }
  if (existing) {
    const reason = checkInBlockReason(existing.attendance);
    if (reason) {
      return {
        ok: false,
        status: 400,
        error: reason
          .replace("Vận động viên đã hủy.", "Bạn đã hủy đăng ký.")
          .replace("Vận động viên không đến.", "Bạn không còn trong danh sách giải này."),
      };
    }
  }
  try {
    await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.appTournamentCheckIn.update({
          where: { id: existing.id },
          data: {
            attendance: ATTENDANCE.PRESENT,
            checkedInAt: now,
            source: CHECKIN_SOURCE.QR,
          },
        });
      } else {
        await tx.appTournamentCheckIn.create({
          data: {
            tournamentId: tournament.id,
            customerId,
            source: CHECKIN_SOURCE.QR,
            attendance: ATTENDANCE.PRESENT,
            checkedInAt: now,
          },
        });
      }
      await issueVoucher(tx, {
        tournamentId: tournament.id,
        customerId,
        discountVnd: tournament.discountVnd,
        endsAt: tournament.endsAt,
      });
    });
  } catch (err) {
    if (
      !(err instanceof Prisma.PrismaClientKnownRequestError) ||
      err.code !== "P2002"
    ) {
      throw err;
    }
  }
  const event = await loadScanEvent(token, customerId);
  return { ok: true, already: false, event: event! };
}

export async function scanRegister(customerId: string, token: string): Promise<
  | { ok: true; already: boolean; event: ScanEvent }
  | { ok: false; status: number; error: string }
> {
  const tournament = await eventByToken(token);
  if (!tournament) return { ok: false, status: 404, error: "Không thấy giải." };
  const joined = await joinTournament(customerId, tournament.id);
  if (!joined.ok) return joined;
  const event = await loadScanEvent(token, customerId);
  return { ok: true, already: !!joined.already, event: event! };
}

export type WalletTournamentVoucher = {
  id: string;
  title: string;
  subtitle: string;
  zoneCode: "TOURNAMENT";
  zoneLabel: string;
  href: string;
  discountType: "amount";
  discountVnd: number;
  sourceLabel: string;
  exhausted: boolean;
  canUse: boolean;
  tournament: true;
  /** Desks this voucher can be scanned at. Same amount at every desk. */
  usableZones: string[];
  validUntilLabel: string | null;
  closedLabel: string | null;
};

/** Athlete wallet cards. Issued rows stay visible after the day; redeemed rows stay as đã dùng. */
export async function listWalletTournamentVouchers(customerId: string) {
  const now = new Date();
  const rows = await prisma.appTournamentVoucher.findMany({
    where: { customerId },
    include: {
      tournament: {
        select: {
          name: true,
          discountVnd: true,
          startsAt: true,
          endsAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const cards: WalletTournamentVoucher[] = [];
  const usableZones = TOURNAMENT_VOUCHER_ZONES.map((item) => item.zone);
  for (const row of rows) {
    const discount = row.redeemedVnd || row.tournament.discountVnd;
    if (!tournamentGivesVoucher(discount)) continue;
    const zone = parseVoucherZone(row.redeemedZone || "");
    const redeemed = row.status === VOUCHER_STATUS.REDEEMED;
    const expired =
      row.status === VOUCHER_STATUS.EXPIRED ||
      now.getTime() >= row.tournament.endsAt.getTime();
    let passToken = row.passToken;
    if (!passToken && row.status === VOUCHER_STATUS.ISSUED && !expired) {
      passToken = newVoucherPassToken();
      await prisma.appTournamentVoucher.update({
        where: { id: row.id },
        data: { passToken, passExpiresAt: row.tournament.endsAt },
      });
    }
    const canUse = !!passToken && row.status === VOUCHER_STATUS.ISSUED && !expired;
    cards.push({
      id: row.id,
      title: voucherTitle(discount),
      subtitle: redeemed
        ? `${row.tournament.name}${zone ? ` · Đã dùng tại ${ZONE_LABEL[zone]}` : ""}`
        : row.tournament.name,
      zoneCode: "TOURNAMENT",
      zoneLabel: "Giải đấu",
      href: passToken ? `/v/${encodeURIComponent(passToken)}` : "/tournaments",
      discountType: "amount",
      discountVnd: Math.max(0, Math.round(discount)),
      sourceLabel: "Voucher giải đấu",
      exhausted: !canUse,
      canUse,
      tournament: true,
      usableZones,
      validUntilLabel: tournamentDayLabel(row.tournament.startsAt),
      closedLabel: redeemed ? "Đã dùng" : expired ? "Hết ngày giải" : null,
    });
  }
  cards.sort((a, b) => Number(a.exhausted) - Number(b.exhausted));
  return cards;
}

/** Customer QR page for a tv_ pass. Spa vr_ passes stay on findVoucherPass. */
export async function tournamentVoucherPass(rawToken: string) {
  const token = decodeURIComponent(String(rawToken || "").trim()).replace(
    /^.*\/v\//,
    ""
  );
  if (!token.startsWith("tv_")) return null;
  const voucher = await prisma.appTournamentVoucher.findUnique({
    where: { passToken: token },
    include: {
      tournament: {
        select: { name: true, discountVnd: true, endsAt: true },
      },
      customer: {
        select: { fullName: true, customerCode: true, shortId: true },
      },
    },
  });
  if (!voucher) return null;
  const amount = voucher.redeemedVnd || voucher.tournament.discountVnd;
  const zone = parseVoucherZone(voucher.redeemedZone || "");
  const expired =
    voucher.status === VOUCHER_STATUS.EXPIRED ||
    Date.now() >= voucher.tournament.endsAt.getTime();
  const redeemed = voucher.status === VOUCHER_STATUS.REDEEMED;
  return {
    token,
    offerId: voucher.tournamentId,
    offerTitle: voucherTitle(amount),
    zoneCode: "TOURNAMENT",
    placeLabel: redeemed && zone ? `Đã dùng tại ${ZONE_LABEL[zone]}` : "Voucher giải đấu",
    detail: voucher.tournament.name,
    status: redeemed ? "SCANNED" : expired ? "EXPIRED" : "OPEN",
    expiresAt: (voucher.passExpiresAt || voucher.tournament.endsAt).toISOString(),
    scannedAt: voucher.redeemedAt ? voucher.redeemedAt.toISOString() : null,
    scannedByName: voucher.scannedByName,
    customerName: voucher.customer.fullName,
    customerCode: voucher.customer.customerCode,
    shortId: voucher.customer.shortId,
  };
}
