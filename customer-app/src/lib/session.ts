import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

export const CUSTOMER_COOKIE = "hhg_customer_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 90; // 90 days
const TOUCH_EVERY_MS = 10 * 60 * 1000; // throttle lastUsedAt writes

function getSecretKey() {
  const secret =
    process.env.CUSTOMER_SESSION_SECRET?.trim() ||
    process.env.HHG_SESSION_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      "CUSTOMER_SESSION_SECRET (or HHG_SESSION_SECRET) missing / too short (min 16)."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(customerId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(customerId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string
): Promise<{ customerId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const customerId = typeof payload.sub === "string" ? payload.sub : null;
    if (!customerId) return null;
    return { customerId };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function createCustomerSession(customerId: string): Promise<string> {
  const token = await createSessionToken(customerId);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000);
  await prisma.appCustomerSession.create({
    data: {
      customerId,
      sessionToken: token,
      expiresAt,
    },
  });
  const jar = await cookies();
  jar.set(CUSTOMER_COOKIE, token, sessionCookieOptions());
  return token;
}

export async function clearCustomerSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (token) {
    void prisma.appCustomerSession
      .deleteMany({ where: { sessionToken: token } })
      .catch(() => undefined);
  }
  jar.set(CUSTOMER_COOKIE, "", sessionCookieOptions(0));
}

/** One DB read. Optional throttled lastUsedAt update (non-blocking). */
export async function getSessionCustomer(opts?: { touch?: boolean }) {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;

  const verified = await verifySessionToken(token);
  if (!verified) return null;

  const row = await prisma.appCustomerSession.findUnique({
    where: { sessionToken: token },
    select: {
      id: true,
      expiresAt: true,
      lastUsedAt: true,
      customer: {
        select: {
          id: true,
          customerCode: true,
          username: true,
          status: true,
          createdAt: true,
          passwordHash: true,
          updatedAt: true,
          fullName: true,
          phone: true,
          phoneNormalized: true,
          phoneLast4: true,
          shortId: true,
          segment: true,
          intendedServices: true,
          adminConfirmedAt: true,
        },
      },
    },
  });
  if (!row || row.expiresAt < new Date()) {
    await clearCustomerSession().catch(() => undefined);
    return null;
  }
  if (row.customer.status !== "ACTIVE") return null;

  if (opts?.touch) {
    const stale = Date.now() - row.lastUsedAt.getTime() > TOUCH_EVERY_MS;
    if (stale) {
      void prisma.appCustomerSession
        .update({
          where: { id: row.id },
          data: { lastUsedAt: new Date() },
        })
        .catch(() => undefined);
    }
  }

  return row.customer;
}
