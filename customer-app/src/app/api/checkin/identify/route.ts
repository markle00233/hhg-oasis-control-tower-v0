import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findOrCreateByPhone, publicCustomer } from "@/lib/checkin";
import { namesMatch } from "@/lib/names";
import { phoneShortId } from "@/lib/phone";
import { setPendingCustomer } from "@/lib/device";
import { createCustomerSession } from "@/lib/session";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

/**
 * First-time / recovery identification.
 * Does NOT record service usage.
 * Sets short-lived pending cookie for confirm step.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || "phone").toLowerCase(); // phone | last4
    const fullName = String(body.fullName || body.name || "").trim();

    if (mode === "last4") {
      const last4 = String(body.last4 || body.phoneLast4 || "")
        .replace(/\D/g, "")
        .slice(0, 4);
      if (last4.length !== 4) {
        return NextResponse.json(
          { error: "Nhập đúng 4 số cuối." },
          { status: 400 }
        );
      }

      const candidates = await prisma.appCustomer.findMany({
        where: {
          status: "ACTIVE",
          OR: [{ phoneLast4: last4 }, { shortId: last4 }],
        },
        take: 10,
        orderBy: { updatedAt: "desc" },
      });

      if (candidates.length === 0) {
        return NextResponse.json(
          {
            error: "Không tìm thấy tài khoản với 4 số cuối này. Vui lòng nhập đầy đủ số điện thoại.",
            needFullPhone: true,
          },
          { status: 404 }
        );
      }

      if (candidates.length > 1) {
        // If name provided and uniquely matches, allow
        if (fullName.length >= 2) {
          const hits = candidates.filter(
            (c) => c.fullName && namesMatch(c.fullName, fullName)
          );
          if (hits.length === 1) {
            const c = hits[0]!;
            await setPendingCustomer(c.id);
            await createCustomerSession(c.id);
            return NextResponse.json({
              ok: true,
              askRemember: true,
              customer: publicCustomer(c),
              mode: "last4_named",
            });
          }
        }
        return NextResponse.json(
          {
            error:
              "Không thể xác định duy nhất tài khoản từ 4 số cuối này. Vui lòng nhập đầy đủ số điện thoại.",
            needFullPhone: true,
            ambiguous: true,
          },
          { status: 409 }
        );
      }

      const only = candidates[0]!;
      if (fullName.length >= 2 && only.fullName && !namesMatch(only.fullName, fullName)) {
        return NextResponse.json(
          {
            error: "Họ tên chưa khớp tài khoản. Thử lại hoặc nhập đầy đủ số điện thoại.",
            needFullPhone: true,
          },
          { status: 400 }
        );
      }
      if (fullName.length >= 2 && !only.fullName) {
        await prisma.appCustomer.update({
          where: { id: only.id },
          data: { fullName },
        });
        only.fullName = fullName;
      }
      await setPendingCustomer(only.id);
      await createCustomerSession(only.id);
      return NextResponse.json({
        ok: true,
        askRemember: true,
        customer: publicCustomer(only),
        mode: "last4",
      });
    }

    // Default: full phone + name
    const phone = String(body.phone || "").trim();
    const { customer, created } = await findOrCreateByPhone({
      phoneRaw: phone,
      fullName,
    });
    await setPendingCustomer(customer.id);
    await createCustomerSession(customer.id);

    return NextResponse.json({
      ok: true,
      created,
      askRemember: true,
      customer: publicCustomer(customer),
      phoneLast4: customer.phoneLast4 || phoneShortId(customer.phoneNormalized || ""),
      mode: "phone",
    });
  } catch (e) {
    console.error("[checkin/identify]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Identify failed" },
      { status: 400 }
    );
  }
}
