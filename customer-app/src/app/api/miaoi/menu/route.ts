import { NextResponse } from "next/server";
import { MIAOI_CATEGORIES, MIAOI_MENU } from "@/lib/miaoi-menu";

export const preferredRegion = "sin1";

export async function GET() {
  return NextResponse.json({
    ok: true,
    categories: MIAOI_CATEGORIES,
    items: MIAOI_MENU,
  });
}
