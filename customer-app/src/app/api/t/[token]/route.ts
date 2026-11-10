import { NextRequest, NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/session";
import { loadScanEvent, scanCheckIn, scanRegister } from "@/lib/tournament-roster";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

function cleanToken(raw: string) {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await ctx.params;
    const customer = await getSessionCustomer();
    const event = await loadScanEvent(cleanToken(token), customer?.id || null);
    if (!event) {
      return NextResponse.json({ error: "Không thấy giải." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, event });
  } catch (err) {
    console.error("[t]", err);
    return NextResponse.json({ error: "Không tải được giải." }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const customer = await getSessionCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Đăng nhập để tiếp tục." }, { status: 401 });
    }
    const { token } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const intent = body.intent === "register" ? "register" : "check-in";
    const result =
      intent === "register"
        ? await scanRegister(customer.id, cleanToken(token))
        : await scanCheckIn(customer.id, cleanToken(token));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[t]", err);
    return NextResponse.json({ error: "Không lưu được." }, { status: 500 });
  }
}
