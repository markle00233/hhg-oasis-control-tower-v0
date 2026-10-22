import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { generateCustomerCode } from "./ids";
import { generateTempPassword, hashPassword } from "./password";
import { canonicalPhone, phoneKeys, phoneShortId } from "./phone";
import { createCustomerSession } from "./session";

export async function findCustomerByPhone(phoneRaw: string) {
  const keys = phoneKeys(phoneRaw);
  if (!keys.length) return null;
  const last9 = keys[0]!.slice(-9);
  return prisma.appCustomer.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        ...keys.flatMap((k) => [
          { phoneNormalized: k },
          { username: k },
          { phone: k },
        ]),
        { phoneNormalized: { endsWith: last9 } },
        { phone: { contains: last9 } },
      ],
    },
  });
}

export async function createCustomerAccount(opts?: {
  fullName?: string;
  phone?: string;
}) {
  const fullName = String(opts?.fullName || "").trim().slice(0, 120);
  const phoneRaw = String(opts?.phone || "").trim();
  const phoneDisplay = phoneRaw ? canonicalPhone(phoneRaw) : "";
  const passwordPlain =
    phoneDisplay.length >= 8
      ? phoneDisplay
      : generateTempPassword(6);
  const passwordHash = await hashPassword(passwordPlain);

  let customer = null;
  for (let i = 0; i < 6; i++) {
    const customerCode = generateCustomerCode();
    const username = phoneDisplay || customerCode;
    try {
      customer = await prisma.appCustomer.create({
        data: {
          customerCode,
          username,
          passwordHash,
          status: "ACTIVE",
          ...(fullName ? { fullName } : {}),
          ...(phoneDisplay
            ? {
                phone: phoneDisplay,
                phoneNormalized: phoneDisplay,
                phoneLast4: phoneShortId(phoneDisplay),
                shortId: phoneShortId(phoneDisplay),
              }
            : {}),
        },
      });
      break;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        if (phoneDisplay) {
          throw Object.assign(
            new Error("Số điện thoại này đã được gắn với tài khoản khác."),
            { status: 409 }
          );
        }
        continue;
      }
      throw e;
    }
  }
  if (!customer) {
    throw new Error("Could not allocate a unique customer code.");
  }

  await createCustomerSession(customer.id);

  return {
    customer,
    tempPassword: phoneDisplay ? null : passwordPlain,
  };
}
