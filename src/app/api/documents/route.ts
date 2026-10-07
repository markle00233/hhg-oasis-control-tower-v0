import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { DocEntityType, DocRelationType } from "@prisma/client";
import { getProjectAccess, canEditProject } from "@/lib/project-access";
import { forbidden } from "@/lib/rbac";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export async function GET(req: NextRequest) {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const unlinked = url.searchParams.get("unlinked") === "1";

  if (projectId) {
    const access = await getProjectAccess(projectId);
    if (!access.ok) return access.error;
    const links = await prisma.documentLink.findMany({
      where: {
        OR: [
          { projectId },
          { entityType: "PROJECT", entityId: projectId },
          { entityType: "TASK", entityId: projectId },
        ],
      },
      include: {
        document: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(
      links.map((l) => ({
        ...l.document,
        link: l,
        project: l.project,
        projectId: l.projectId || l.project?.id,
        projectName: l.project?.name,
      }))
    );
  }

  const docs = await prisma.document.findMany({
    include: {
      links: { include: { project: { select: { id: true, name: true } } } },
      uploadedBy: { select: { id: true, username: true, displayName: true } },
      unit: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const mapped = docs.map((d) => {
    const link = d.links.find((l) => l.projectId || l.project);
    return {
      ...d,
      projectId: link?.projectId || link?.project?.id || null,
      projectName: link?.project?.name || null,
    };
  });
  const filtered = unlinked ? mapped.filter((d) => !d.links.length) : mapped;
  return NextResponse.json(filtered);
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  const body = await req.json();
  const {
    fileName,
    dataUrl,
    fileType,
    note,
    unitName,
    projectId,
    entityType = "PROJECT",
    entityId,
    relationType = "GENERAL",
  } = body;

  if (!fileName || !dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return NextResponse.json({ error: "fileName + dataUrl required" }, { status: 400 });
  }
  if (dataUrl.length > 1_500_000) {
    return NextResponse.json(
      { error: "File quá lớn (giới hạn ~1MB sau encode). Hãy chọn PDF/ảnh nhỏ hơn." },
      { status: 400 }
    );
  }

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return NextResponse.json({ error: "dataUrl không hợp lệ" }, { status: 400 });
  }
  const mimeType = match[1];
  const lowerName = String(fileName).toLowerCase();
  const okExt =
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".webp") ||
    lowerName.endsWith(".gif");
  if (!ALLOWED_MIME.has(mimeType) && !okExt) {
    return NextResponse.json(
      { error: "Chỉ chấp nhận PDF hoặc ảnh (PNG/JPG/WEBP). File này không được hỗ trợ." },
      { status: 400 }
    );
  }

  const eid = String(entityId || projectId || "");
  if (projectId || (entityType === "PROJECT" && eid)) {
    const pid = String(projectId || eid);
    const access = await getProjectAccess(pid);
    if (!access.ok) return access.error;
    if (!canEditProject(access.role)) {
      return forbidden("Không có quyền tải tài liệu lên Task này");
    }
  }

  const buf = Buffer.from(match[2], "base64");

  let unitId: string | undefined;
  if (unitName) {
    const unit = await prisma.unit.findUnique({ where: { name: unitName } });
    unitId = unit?.id;
  }

  const count = await prisma.document.count();
  const code = `DOC-${String(count + 1001).padStart(5, "0")}`;
  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  // Vercel filesystem is ephemeral — keep payload inline in DB so download still works.
  const inlineStorage =
    process.env.VERCEL === "1" || process.env.DOCUMENT_STORAGE === "inline";
  let storageUrl: string;
  if (inlineStorage) {
    storageUrl = dataUrl;
  } else {
    const dir = path.join(process.cwd(), "public", "uploads", "docs");
    await mkdir(dir, { recursive: true });
    const stored = `${code}_${safeName}`;
    const abs = path.join(dir, stored);
    await writeFile(abs, buf);
    storageUrl = `/uploads/docs/${stored}`;
  }

  const entType = (Object.values(DocEntityType) as string[]).includes(entityType)
    ? (entityType as DocEntityType)
    : DocEntityType.PROJECT;
  const relType = (Object.values(DocRelationType) as string[]).includes(relationType)
    ? (relationType as DocRelationType)
    : DocRelationType.GENERAL;

  const doc = await prisma.document.create({
    data: {
      code,
      fileName: String(fileName).slice(0, 200),
      fileType: fileType || mimeType,
      mimeType,
      storageUrl,
      sizeBytes: buf.length,
      note: note || null,
      uploadedByUserId: gate.user.id,
      unitId,
      links: eid
        ? {
            create: {
              entityType: entType,
              entityId: eid,
              relationType: relType,
              projectId: projectId || (entType === "PROJECT" ? eid : null),
            },
          }
        : undefined,
    },
    include: {
      links: { include: { project: { select: { id: true, name: true } } } },
      uploadedBy: { select: { id: true, username: true, displayName: true } },
    },
  });

  return NextResponse.json(doc, { status: 201 });
}
