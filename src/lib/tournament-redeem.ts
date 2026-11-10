import { prisma } from "@/lib/prisma";
import {
  VOUCHER_STATUS,
  discountForZone,
  isWithinTournamentWindow,
  redeemZoneForDesk,
  voucherPassFromScan,
  voucherTitle,
  ZONE_LABEL,
} from "@/lib/tournament";

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

/** Staff scan of an athlete voucher (tv_…). One use, on the event day, at any offered desk. */
export async function redeemTournamentVoucherScan(opts: {
  raw: string;
  deskZone: string;
  staffName: string;
}) {
  const token = voucherPassFromScan(opts.raw);
  if (!token) return null;
  const zone = redeemZoneForDesk(opts.deskZone);
  if (!zone) {
    throw httpError(
      "Voucher vận động viên dùng tại Mía Ơi, Olympic, Spa hoặc Lòng Nướng.",
      400
    );
  }
  const voucher = await prisma.appTournamentVoucher.findUnique({
    where: { passToken: token },
    include: {
      tournament: true,
      customer: {
        select: {
          id: true,
          customerCode: true,
          fullName: true,
          phone: true,
          shortId: true,
          phoneLast4: true,
          segment: true,
        },
      },
    },
  });
  if (!voucher) throw httpError("QR voucher không hợp lệ.", 404);
  const amount = discountForZone(voucher.tournament, zone);
  if (amount <= 0) throw httpError("Giải này không tặng voucher.", 400);
  if (
    !isWithinTournamentWindow(voucher.tournament.startsAt, voucher.tournament.endsAt)
  ) {
    throw httpError("Voucher chỉ dùng trong ngày giải.", 400);
  }
  if (voucher.status === VOUCHER_STATUS.REDEEMED) {
    return {
      already: true,
      title: voucherTitle(voucher.redeemedVnd || amount),
      zoneLabel: ZONE_LABEL[zone],
      redeemedAt: voucher.redeemedAt,
      customer: voucher.customer,
    };
  }
  if (voucher.status !== VOUCHER_STATUS.ISSUED) {
    throw httpError("Voucher không còn dùng được.", 400);
  }
  const redeemedAt = new Date();
  const saved = await prisma.appTournamentVoucher.updateMany({
    where: { id: voucher.id, status: VOUCHER_STATUS.ISSUED },
    data: {
      status: VOUCHER_STATUS.REDEEMED,
      redeemedZone: zone,
      redeemedVnd: amount,
      redeemedAt,
      scannedByName: opts.staffName,
    },
  });
  if (saved.count === 0) {
    return {
      already: true,
      title: voucherTitle(amount),
      zoneLabel: ZONE_LABEL[zone],
      redeemedAt,
      customer: voucher.customer,
    };
  }
  return {
    already: false,
    title: voucherTitle(amount),
    zoneLabel: ZONE_LABEL[zone],
    redeemedAt,
    customer: voucher.customer,
  };
}
