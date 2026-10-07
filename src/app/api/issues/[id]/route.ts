import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { ensurePrimaryMember, logProjectEvent } from "@/lib/project-access";

type Ctx = { params: Promise<{ id: string }> };

/** Convert Issue → Task (Project) or Decision. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  const { id } = await ctx.params;
  const body = await req.json();
  const action = String(body.action || "");

  const issue = await prisma.issue.findUnique({
    where: { id },
    include: { unit: true },
  });
  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }
  if (String(issue.status).startsWith("CONVERTED")) {
    return NextResponse.json(
      { error: "Issue đã được chuyển trước đó" },
      { status: 400 }
    );
  }

  if (action === "CONVERT_TO_TASK") {
    const name =
      String(body.name || "").trim() ||
      `Issue: ${issue.category}${issue.areaLabel ? " · " + issue.areaLabel : ""}`;

    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          name: name.slice(0, 200),
          description: [issue.note, `Nguồn Issue ${issue.id}`]
            .filter(Boolean)
            .join("\n"),
          owner: gate.user.displayName || gate.user.username,
          status: "TODO",
          priority: "P2",
          unitId: issue.unitId,
          category: issue.category,
        },
      });
      await tx.issue.update({
        where: { id },
        data: {
          status: "CONVERTED_TASK",
          note: [issue.note, `→ Task ${p.id}`].filter(Boolean).join("\n"),
        },
      });
      return p;
    });

    await ensurePrimaryMember(project.id, gate.user.id);
    await logProjectEvent({
      projectId: project.id,
      actorUserId: gate.user.id,
      action: "FROM_ISSUE",
      detail: `Tạo từ Issue ${issue.id}`,
    });

    const full = await prisma.project.findUnique({
      where: { id: project.id },
      include: { unit: true, members: true },
    });
    const updatedIssue = await prisma.issue.findUnique({
      where: { id },
      include: { unit: true },
    });
    return NextResponse.json({ project: full, issue: updatedIssue });
  }

  if (action === "CONVERT_TO_DECISION") {
    const title =
      String(body.title || "").trim() ||
      `Quyết định từ Issue: ${issue.category}`;
    const count = await prisma.decision.count();
    const code = `QD-${String(count + 1).padStart(4, "0")}`;

    const decision = await prisma.$transaction(async (tx) => {
      const d = await tx.decision.create({
        data: {
          code,
          title: title.slice(0, 200),
          description: [issue.note, `Nguồn Issue ${issue.id}`]
            .filter(Boolean)
            .join("\n"),
          proposer: gate.user.displayName || gate.user.username,
          impact: "Issue vận hành cần quyết định xử lý",
          isBlocking: false,
          status: "PENDING",
        },
      });
      await tx.issue.update({
        where: { id },
        data: {
          status: "CONVERTED_DECISION",
          note: [issue.note, `→ Decision ${d.id}`].filter(Boolean).join("\n"),
        },
      });
      return d;
    });

    const updatedIssue = await prisma.issue.findUnique({
      where: { id },
      include: { unit: true },
    });
    return NextResponse.json({ decision, issue: updatedIssue });
  }

  return NextResponse.json(
    { error: "action phải là CONVERT_TO_TASK hoặc CONVERT_TO_DECISION" },
    { status: 400 }
  );
}
