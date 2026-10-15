import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { publicAppUrl } from "./services";

/** Mint / return opaque My Oasis QR token (not phone, not DB id). */
export async function ensureIdentityToken(customerId: string): Promise<string> {
  const row = await prisma.appCustomer.findUnique({
    where: { id: customerId },
    select: { identityToken: true },
  });
  if (row?.identityToken) return row.identityToken;

  for (let i = 0; i < 5; i++) {
    const token = `oq_${randomBytes(18).toString("base64url")}`;
    try {
      const updated = await prisma.appCustomer.update({
        where: { id: customerId },
        data: { identityToken: token },
        select: { identityToken: true },
      });
      if (updated.identityToken) return updated.identityToken;
    } catch {
      // unique collision — retry
    }
  }
  throw new Error("Không tạo được mã QR định danh.");
}

/** Payload staff scanners should read — opaque path only. */
export function identityQrPayload(token: string) {
  return `${publicAppUrl()}/c/${encodeURIComponent(token)}`;
}

export async function findCustomerByIdentityToken(token: string) {
  const clean = token.trim();
  if (!clean || clean.length < 8) return null;
  return prisma.appCustomer.findFirst({
    where: { identityToken: clean, status: "ACTIVE" },
    select: {
      id: true,
      customerCode: true,
      fullName: true,
      phone: true,
      phoneNormalized: true,
      phoneLast4: true,
      shortId: true,
      segment: true,
    },
  });
}
