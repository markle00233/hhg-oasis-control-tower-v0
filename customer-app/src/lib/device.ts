import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";

export const DEVICE_COOKIE = "hhg_device_token";
export const PENDING_COOKIE = "hhg_checkin_pending";
export const DEVICE_MAX_AGE_SEC = 60 * 60 * 24 * 365; // 365 days rolling
export const PENDING_MAX_AGE_SEC = 60 * 15; // 15 min after identify

function cookieSecure() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function deviceSecret() {
  const secret =
    process.env.CUSTOMER_DEVICE_SECRET?.trim() ||
    process.env.CUSTOMER_SESSION_SECRET?.trim() ||
    process.env.HHG_SESSION_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error("CUSTOMER_DEVICE_SECRET / session secret missing (min 16).");
  }
  return secret;
}

export function hashDeviceToken(raw: string): string {
  return createHash("sha256")
    .update(`${deviceSecret()}:${raw}`)
    .digest("hex");
}

export function newDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

export function deviceCookieOptions(maxAge = DEVICE_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: "/",
    maxAge,
  };
}

export async function clearDeviceCookie() {
  const jar = await cookies();
  jar.set(DEVICE_COOKIE, "", deviceCookieOptions(0));
}

export async function setDeviceCookie(rawToken: string) {
  const jar = await cookies();
  jar.set(DEVICE_COOKIE, rawToken, deviceCookieOptions());
}

export type DeviceCustomer = {
  id: string;
  fullName: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  phoneLast4: string | null;
  customerCode: string;
  segment: string;
  deviceId: string;
};

/** Resolve customer from remember-device cookie. Touches lastSeenAt + rolls expiry. */
export async function resolveDeviceCustomer(): Promise<DeviceCustomer | null> {
  const jar = await cookies();
  const raw = jar.get(DEVICE_COOKIE)?.value;
  if (!raw) return null;

  const tokenHash = hashDeviceToken(raw);
  const now = new Date();
  const row = await prisma.appCustomerDevice.findUnique({
    where: { tokenHash },
    include: {
      customer: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          phoneNormalized: true,
          phoneLast4: true,
          shortId: true,
          customerCode: true,
          segment: true,
          status: true,
        },
      },
    },
  });

  if (
    !row ||
    row.revokedAt ||
    row.expiresAt < now ||
    row.customer.status !== "ACTIVE"
  ) {
    await clearDeviceCookie();
    return null;
  }

  const expiresAt = new Date(Date.now() + DEVICE_MAX_AGE_SEC * 1000);
  await prisma.appCustomerDevice.update({
    where: { id: row.id },
    data: { lastSeenAt: now, expiresAt },
  });
  await setDeviceCookie(raw);

  return {
    id: row.customer.id,
    fullName: row.customer.fullName,
    phone: row.customer.phone,
    phoneNormalized: row.customer.phoneNormalized,
    phoneLast4: row.customer.phoneLast4 || row.customer.shortId,
    customerCode: row.customer.customerCode,
    segment: row.customer.segment,
    deviceId: row.id,
  };
}

export async function createRememberDevice(customerId: string) {
  const raw = newDeviceToken();
  const tokenHash = hashDeviceToken(raw);
  const expiresAt = new Date(Date.now() + DEVICE_MAX_AGE_SEC * 1000);
  const device = await prisma.appCustomerDevice.create({
    data: { customerId, tokenHash, expiresAt, lastSeenAt: new Date() },
  });
  await setDeviceCookie(raw);
  await clearPendingCookie();
  return device;
}

export async function revokeCurrentDevice() {
  const jar = await cookies();
  const raw = jar.get(DEVICE_COOKIE)?.value;
  if (raw) {
    const tokenHash = hashDeviceToken(raw);
    await prisma.appCustomerDevice
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  await clearDeviceCookie();
  await clearPendingCookie();
}

function pendingKey() {
  return new TextEncoder().encode(deviceSecret());
}

export async function setPendingCustomer(customerId: string) {
  const token = await new SignJWT({ purpose: "checkin_pending" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(customerId)
    .setIssuedAt()
    .setExpirationTime(`${PENDING_MAX_AGE_SEC}s`)
    .sign(pendingKey());
  const jar = await cookies();
  jar.set(PENDING_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: PENDING_MAX_AGE_SEC,
  });
}

export async function clearPendingCookie() {
  const jar = await cookies();
  jar.set(PENDING_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 0,
  });
}

export async function readPendingCustomerId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, pendingKey());
    if (payload.purpose !== "checkin_pending") return null;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
