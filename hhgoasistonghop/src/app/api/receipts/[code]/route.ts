import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { membershipToCsvRow, parseContractCode, toCsvFile } from "@/lib/contract";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await params;
  const contractCode = parseContractCode(decodeURIComponent(code));

  const membership = await prisma.membership.findFirst({
    where: {
      OR: [{ contractCode }, { membershipCode: contractCode }],
    },
    include: {
      customer: true,
      plan: true,
      createdBy: true,
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Không tìm thấy hợp đồng" }, { status: 404 });
  }

  const csv = toCsvFile([membershipToCsvRow(membership)]);
  const filename = `hop-dong-${membership.contractCode}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
