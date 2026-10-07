import { prisma } from "@/lib/prisma";
import { MemberWordDocument, ServiceWordDocument } from "@/components/receipt-word-editors";
import { PrintToolbar } from "@/components/receipt-print-button";
import { notFound } from "next/navigation";

function payloadToDefaults(
  formNo: string,
  memberCode: string,
  payload: Record<string, unknown>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "boolean") out[k] = v ? "1" : "0";
    else if (v != null) out[k] = String(v);
  }
  out.formNoHint = formNo.replace(/^HD-/, "HĐ-");
  out.memberCode = memberCode || out.memberCode || "";
  if (payload.isFamily === true) out.isFamily = "1";
  if (payload.isFamily === false) out.isFamily = "0";
  return out;
}

export default async function ReceiptDocPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type: typeParam } = await searchParams;

  const row = await prisma.serviceContract.findUnique({ where: { id } });
  if (!row) notFound();

  const isService = typeParam === "service" || row.type === "SERVICE";
  const defaults = payloadToDefaults(
    row.formNo,
    row.memberCode,
    row.payload as Record<string, unknown>
  );
  const title = isService
    ? `In Hợp đồng dịch vụ · ${row.memberCode}`
    : `In Hợp đồng Hội viên · ${row.memberCode}`;

  return (
    <div className="min-h-screen bg-[#f3f4f6] print:bg-white">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 10mm; }
        }
      `}</style>
      <PrintToolbar title={title} />
      <div className="mx-auto max-w-[920px] py-4 print:py-0">
        {isService ? (
          <ServiceWordDocument defaults={defaults} readOnly />
        ) : (
          <MemberWordDocument defaults={defaults} readOnly />
        )}
      </div>
    </div>
  );
}
