import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { generateCustomerCode } from "./ids";
import { generateTempPassword, hashPassword } from "./password";
import { isValidPhone, normalizePhone, phoneShortId } from "./phone";

export const USAGE_DEDUP_MS = 60_000;

export type PublicService = {
  id: string;
  serviceCode: string;
  serviceName: string;
  slug: string | null;
  qrToken: string | null;
};

export async function resolveService(tokenOrCode: string): Promise<PublicService | null> {
  const key = tokenOrCode.trim();
  if (!key) return null;
  const upper = key.toUpperCase();
  const slug = key.toLowerCase();

  const service = await prisma.appService.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { qrToken: key },
        { qrToken: upper },
        { serviceCode: upper },
        { slug },
        { slug: upper.toLowerCase() },
      ],
    },
    select: {
      id: true,
      serviceCode: true,
      serviceName: true,
      slug: true,
      qrToken: true,
    },
  });
  return service;
}

export function publicCustomer(c: {
  id: string;
  fullName: string | null;
  phone: string | null;
  phoneLast4?: string | null;
  shortId?: string | null;
  customerCode: string;
  segment: string;
}) {
  return {
    id: c.id,
    name: c.fullName || "Khách",
    phone: c.phone,
    phoneLast4: c.phoneLast4 || c.shortId || null,
    customerCode: c.customerCode,
    segment: c.segment,
  };
}

/** Find or create customer by full phone + name. */
export async function findOrCreateByPhone(opts: {
  phoneRaw: string;
  fullName: string;
}) {
  if (!isValidPhone(opts.phoneRaw)) {
    throw new Error("Số điện thoại không hợp lệ.");
  }
  const name = opts.fullName.trim();
  if (name.length < 2) throw new Error("Nhập họ và tên.");

  const phoneNormalized = normalizePhone(opts.phoneRaw);
  const phoneLast4 = phoneShortId(phoneNormalized);

  const existing = await prisma.appCustomer.findUnique({
    where: { phoneNormalized },
  });
  if (existing) {
    const updated = await prisma.appCustomer.update({
      where: { id: existing.id },
      data: {
        fullName: name,
        phone: opts.phoneRaw.trim(),
        phoneLast4,
        shortId: phoneLast4,
        status: "ACTIVE",
      },
    });
    return { customer: updated, created: false };
  }

  const tempPassword = generateTempPassword(6);
  const passwordHash = await hashPassword(tempPassword);
  let customer = null;
  for (let i = 0; i < 6; i++) {
    const customerCode = generateCustomerCode();
    try {
      customer = await prisma.appCustomer.create({
        data: {
          customerCode,
          username: phoneNormalized,
          passwordHash,
          status: "ACTIVE",
          fullName: name,
          phone: opts.phoneRaw.trim(),
          phoneNormalized,
          phoneLast4,
          shortId: phoneLast4,
          segment: "WALK_IN",
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
  if (!customer) throw new Error("Không tạo được tài khoản khách.");
  return { customer, created: true, tempPassword };
}

export async function recordServiceUsage(opts: {
  customerId: string;
  serviceId: string;
  deviceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const recent = await prisma.appServiceEvent.findFirst({
    where: {
      customerId: opts.customerId,
      serviceId: opts.serviceId,
      eventType: "SERVICE_USE",
      createdAt: { gte: new Date(Date.now() - USAGE_DEDUP_MS) },
    },
    orderBy: { createdAt: "desc" },
    include: {
      service: { select: { serviceCode: true, serviceName: true } },
    },
  });
  if (recent) {
    return { event: recent, duplicate: true as const };
  }

  const event = await prisma.appServiceEvent.create({
    data: {
      customerId: opts.customerId,
      serviceId: opts.serviceId,
      deviceId: opts.deviceId || null,
      eventType: "SERVICE_USE",
      metadata: {
        source: "qr_checkin",
        ...(opts.metadata || {}),
      },
    },
    include: {
      service: { select: { serviceCode: true, serviceName: true } },
    },
  });
  return { event, duplicate: false as const };
}

/** Ensure services have slug + qrToken for /s/[token] routes. */
export async function ensureServiceTokens() {
  const services = await prisma.appService.findMany({
    where: { OR: [{ qrToken: null }, { slug: null }] },
  });
  for (const s of services) {
    const slug = (s.serviceCode || s.id).toLowerCase().replace(/_/g, "-");
    await prisma.appService.update({
      where: { id: s.id },
      data: {
        slug: s.slug || slug,
        qrToken: s.qrToken || s.serviceCode,
      },
    });
  }
}
