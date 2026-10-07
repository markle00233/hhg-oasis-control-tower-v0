import { NextResponse } from "next/server";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

/**
 * Customer self-order disabled — staff places orders on Control Tower /desk.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Gọi món đã chuyển sang quầy. Vui lòng xác nhận check-in; nhân viên sẽ chọn món giúp bạn.",
    },
    { status: 410 }
  );
}
