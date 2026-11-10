import { NextResponse } from "next/server";
import * as QRCode from "qrcode";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let text = "";
  let width = 280;
  let margin = 1;
  let dark: string | undefined;
  let light: string | undefined;
  try {
    const body = (await request.json()) as {
      text?: unknown;
      width?: unknown;
      margin?: unknown;
      dark?: unknown;
      light?: unknown;
    };
    if (typeof body.text === "string") text = body.text.trim().slice(0, 2048);
    if (typeof body.width === "number" && body.width >= 64 && body.width <= 1024) {
      width = Math.round(body.width);
    }
    if (typeof body.margin === "number" && body.margin >= 0 && body.margin <= 8) {
      margin = Math.round(body.margin);
    }
    if (typeof body.dark === "string" && /^#[0-9a-fA-F]{3,8}$/.test(body.dark)) dark = body.dark;
    if (typeof body.light === "string" && /^#[0-9a-fA-F]{3,8}$/.test(body.light)) light = body.light;
  } catch {
    text = "";
  }
  if (!text) {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }
  const dataUrl = await QRCode.toDataURL(text, {
    width,
    margin,
    color: dark || light ? { dark, light } : undefined,
  });
  return NextResponse.json({ dataUrl });
}
