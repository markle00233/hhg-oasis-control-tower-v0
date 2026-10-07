import { prisma } from "@/lib/prisma";
import { parseContractCode } from "@/lib/contract";
import { buildReceiptFormData } from "@/lib/receipt-data";
import { ReceiptHlvContract, ReceiptMemberContract } from "@/components/receipt-contracts";
import { PrintToolbar } from "@/components/receipt-print-button";
import { notFound } from "next/navigation";

export default async function ReceiptPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { code } = await params;
  const { type: typeParam } = await searchParams;
  const type = typeParam === "hlv" ? "hlv" : "member";
  const contractCode = parseContractCode(decodeURIComponent(code));

  const membership = await prisma.membership.findFirst({
    where: {
      OR: [{ contractCode }, { membershipCode: contractCode }],
    },
    include: {
      customer: {
        select: {
          customerCode: true,
          fullName: true,
          phone: true,
          email: true,
          dateOfBirth: true,
          gender: true,
          note: true,
          familyGroupId: true,
        },
      },
      plan: true,
      createdBy: { select: { fullName: true, email: true } },
    },
  });

  if (!membership) notFound();

  const data = buildReceiptFormData(membership);
  const title =
    type === "hlv"
      ? `In Hợp đồng HLV · ${data.memberCode}`
      : `In Hợp đồng Hội viên · ${data.memberCode}`;

  return (
    <div className="min-h-screen bg-[#f3f4f6] print:bg-white">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 12mm; }
        }
      `}</style>
      <PrintToolbar title={title} />
      <div className="mx-auto max-w-[840px] py-4 print:py-0">
        {type === "hlv" ? (
          <ReceiptHlvContract data={data} />
        ) : (
          <ReceiptMemberContract data={data} />
        )}
      </div>
    </div>
  );
}
