import { prisma } from "@/lib/prisma";
import {
  ATTENDANCE,
  TOURNAMENT_STATUS,
  tournamentStatusAt,
  type TournamentStatus,
} from "@/lib/tournament";

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

/** Writes Sắp diễn ra / Đang diễn ra / Đã kết thúc from the clock. Staff cannot pick it. */
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
  const ids: Record<Exclude<TournamentStatus, "ENDED">, string[]> = {
    UPCOMING: [],
    LIVE: [],
  };
  for (const row of open) {
    const next = tournamentStatusAt(row.startsAt, row.endsAt, row.eventTime, now);
    if (next !== TOURNAMENT_STATUS.ENDED && next !== row.status) ids[next].push(row.id);
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
