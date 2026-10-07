import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { ReceiptsBoard } from "@/components/receipts-board";
import { canWrite } from "@/lib/auth";
import { requireFeature, sessionCanFeature } from "@/lib/require-feature";
import { formatDate } from "@/lib/utils";

function payloadToDefaults(payload: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "boolean") out[k] = v ? "1" : "0";
    else if (v != null) out[k] = String(v);
  }
  return out;
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; saved?: string }>;
}) {
  const session = await requireFeature("receipts");
  const canEdit =
    canWrite(session.user.role) && (await sessionCanFeature(session, "receipts_write"));

  const { q: qParam } = await searchParams;
  const q = (qParam || "").trim();

  const where = q
    ? {
        OR: [
          { formNo: { contains: q.replace(/^HĐ-/i, "HD-"), mode: "insensitive" as const } },
          { memberCode: { contains: q, mode: "insensitive" as const } },
          {
            customer: {
              fullName: { contains: q, mode: "insensitive" as const },
            },
          },
          {
            customer: {
              customerCode: {
                contains: q.replace(/\s*-\s*G[ĐD]\s*$/i, ""),
                mode: "insensitive" as const,
              },
            },
          },
        ],
      }
    : undefined;

  const rows = await prisma.serviceContract.findMany({
    where,
    include: {
      customer: { select: { fullName: true } },
      createdBy: { select: { fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  function mapRow(r: (typeof rows)[number]) {
    const payload = (r.payload || {}) as Record<string, unknown>;
    const subtitle =
      r.type === "MEMBER"
        ? String(payload.planName || "Hội viên")
        : String(payload.serviceType || "Dịch vụ HLV");
    const status = r.status === "EDITED" ? "EDITED" : "EMPTY";
    return {
      id: r.id,
      type: r.type as "MEMBER" | "SERVICE",
      formNo: r.formNo,
      memberCode: r.memberCode,
      fullName: String(payload.fullName || r.customer?.fullName || "—"),
      subtitle,
      createdAtLabel: formatDate(r.createdAt),
      status: status as "EMPTY" | "EDITED",
      defaults: payloadToDefaults(payload),
    };
  }

  const memberRows = rows.filter((r) => r.type === "MEMBER").map(mapRow);
  const serviceRows = rows.filter((r) => r.type === "SERVICE").map(mapRow);

  return (
    <div>
      <PageHeader
        title="Receipt / Hợp đồng"
        description="Tạo khách → 2 mẫu sẵn · đỏ chưa thông tin · lưu form → đã chỉnh sửa"
      />
      <ReceiptsBoard
        memberRows={memberRows}
        serviceRows={serviceRows}
        staffName={session.user.name || ""}
        q={q}
        canEdit={canEdit}
      />
    </div>
  );
}
