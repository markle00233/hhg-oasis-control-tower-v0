import { prisma } from "./prisma";

/** Resolve My Oasis QR opaque token → customer (staff desk). */
export async function findCustomerByIdentityToken(token: string) {
  const clean = decodeURIComponent(token.trim()).replace(/^.*\/c\//, "");
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
