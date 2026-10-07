import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { generateCustomerCode } from "./ids";
import { generateTempPassword, hashPassword } from "./password";
import { createCustomerSession } from "./session";

export async function createCustomerAccount() {
  const tempPassword = generateTempPassword(6);
  const passwordHash = await hashPassword(tempPassword);

  let customer = null;
  for (let i = 0; i < 6; i++) {
    const customerCode = generateCustomerCode();
    try {
      customer = await prisma.appCustomer.create({
        data: {
          customerCode,
          username: customerCode,
          passwordHash,
          status: "ACTIVE",
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
  if (!customer) {
    throw new Error("Could not allocate a unique customer code.");
  }

  await createCustomerSession(customer.id);

  return {
    customer,
    tempPassword,
  };
}
