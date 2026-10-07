import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, ProjectMemberRole } from "@prisma/client";
import {
  canManageMembers,
  canTouchProject,
  clampProgress,
  ensurePrimaryMember,
  findUserByOwnerLabel,
  getProjectAccess,
  logProjectEvent,
  projectInclude,
} from "@/lib/project-access";
import {
  allStepsComplete,
  canActOnStep,
  canEditMainTask,
  canEditWorkPlanStructure,
  deriveQuadrant,
  gateTaskAction,
  isPrimaryMember,
  isReviewerUser,
  legacyPriorityToMatrix,
  matrixToLegacyPriority,
  normalizeTaskStatus,
  resolveActorRole,
  viewerContext,
  type ProjectLike,
} from "@/lib/task-workflow";
import { computeDeadlineRisk } from "@/lib/task-risk";

type Ctx = { params: Promise<{ id: string }> };

type ProofItem = { name: string; dataUrl: string };
type StepProofList = ProofItem[];

const DEFAULT_LABELS = [
  "Chuẩn bị / khảo sát",
  "Triển khai chính",
  "Kiểm tra & chỉnh sửa",
  "Hoàn tất & bàn giao",
];
const MAX_STEPS = 20;
const MAX_PROOFS_PER_STEP = 12;

function readinessFromFlags(flags: string): number {
  if (!flags.length) return 0;
  const done = [...flags].filter((c) => c === "1").length;
  return Math.round((done / flags.length) * 100);
}

function normalizeLabels(raw: unknown, minLen = 4): string[] {
  const fromDb = Array.isArray(raw)
    ? raw.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  if (fromDb.length >= 1) return fromDb.slice(0, MAX_STEPS);
  return DEFAULT_LABELS.slice(0, Math.max(4, minLen));
}

function normalizeFlags(raw: unknown, len: number): string {
  let s = String(raw ?? "").replace(/[^01]/g, "");
  if (!s) s = "0".repeat(len);
  if (s.length < len) s = s.padEnd(len, "0");
  if (s.length > len) s = s.slice(0, len);
  return s;
}

function coerceProofItem(item: unknown): ProofItem | null {
  if (!item || typeof item !== "object") return null;
  const name = String((item as { name?: string }).name || "").slice(0, 120);
  const dataUrl = String((item as { dataUrl?: string }).dataUrl || "");
  if (!dataUrl.startsWith("data:image/")) return null;
  if (dataUrl.length > 900_000) return null;
  return { name: name || "proof.jpg", dataUrl };
}

function coerceProofList(item: unknown): StepProofList {
  if (Array.isArray(item)) {
    return item
      .map(coerceProofItem)
      .filter((x): x is ProofItem => !!x)
      .slice(0, MAX_PROOFS_PER_STEP);
  }
  const one = coerceProofItem(item);
  return one ? [one] : [];
}

function normalizeProofs(raw: unknown, len: number): StepProofList[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: len }, (_, i) => coerceProofList(arr[i]));
}

function normalizeDeadlines(raw: unknown, len: number): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: len }, (_, i) => {
    const v = String(arr[i] || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    if (/^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test(v)) return v;
    return "";
  });
}

function normalizeOwners(raw: unknown, len: number): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: len }, (_, i) =>
    String(arr[i] || "")
      .trim()
      .slice(0, 120)
  );
}

function coerceDeadline(raw: unknown): string {
  const v = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test(v)) return v;
  return "";
}

function resolveStepCount(existing: {
  stepFlags: string | null;
  stepLabels: unknown;
  readiness: number | null;
}): { labels: string[]; flags: string; proofsLen: number } {
  const labelLen = Array.isArray(existing.stepLabels)
    ? existing.stepLabels.filter((x) => String(x || "").trim()).length
    : 0;
  const flagLen = String(existing.stepFlags || "").replace(/[^01]/g, "").length;
  const len = Math.min(MAX_STEPS, Math.max(4, labelLen || 0, flagLen || 0, 4));
  const labels = normalizeLabels(existing.stepLabels, len);
  while (labels.length < len) {
    labels.push(DEFAULT_LABELS[labels.length] || `Hạng mục ${labels.length + 1}`);
  }
  let flags = normalizeFlags(existing.stepFlags, labels.length);
  if (flags === "0".repeat(labels.length) && Number(existing.readiness || 0) >= 25) {
    const legacyN = Math.min(labels.length, Math.floor(Number(existing.readiness) / 25));
    flags = "1".repeat(legacyN) + "0".repeat(labels.length - legacyN);
  }
  return { labels, flags, proofsLen: labels.length };
}

function withViewerContext<T extends Record<string, unknown>>(
  project: T,
  user: Parameters<typeof viewerContext>[0]
) {
  const important =
    project.important != null
      ? !!project.important
      : legacyPriorityToMatrix(String(project.priority || "P2")).important;
  const urgent =
    project.urgent != null
      ? !!project.urgent
      : legacyPriorityToMatrix(String(project.priority || "P2")).urgent;
  const ctx = viewerContext(user, {
    status: String(project.status || "TODO"),
    acknowledgedAt: (project.acknowledgedAt as Date | null) ?? null,
    reviewerUserId: (project.reviewerUserId as string | null) ?? null,
    assignedByUserId: (project.assignedByUserId as string | null) ?? null,
    requireAfterProof: project.requireAfterProof !== false,
    proofRequired: (project.proofRequired as boolean | null) ?? null,
    stepFlags: String(project.stepFlags || ""),
    stepProofs: project.stepProofs as ProjectLike["stepProofs"],
    owner: (project.owner as string | null) ?? null,
    members: (project.members as { userId: string; role: ProjectMemberRole }[]) || [],
    stepLabels: project.stepLabels,
    currentStepIndex: (project.currentStepIndex as number | null) ?? null,
    pendingChangeRequest: project.pendingChangeRequest,
    collabIssues: project.collabIssues,
  });
  ctx.quadrant = deriveQuadrant(important, urgent);
  const risk = computeDeadlineRisk({
    status: String(project.status || "TODO"),
    deadline: (project.deadline as string | null) ?? null,
    stepFlags: String(project.stepFlags || ""),
    stepLabels: project.stepLabels,
    stepEstimates: project.stepEstimates,
    estimatedDurationMinutes: (project.estimatedDurationMinutes as number | null) ?? null,
    currentStepIndex: (project.currentStepIndex as number | null) ?? null,
  } as Parameters<typeof computeDeadlineRisk>[0]);
  return {
    ...project,
    important,
    urgent,
    quadrant: ctx.quadrant,
    deadlineRisk: risk.risk,
    deadlineRiskReason: risk.reason,
    remainingWorkMinutes: risk.remainingMinutes,
    availableWorkMinutes: risk.availableMinutes,
    workPlanProgress: ctx.progress,
    currentStep: ctx.currentStep,
    viewerContext: ctx,
  };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const access = await getProjectAccess(id);
  if (!access.ok) return access.error;
  const project = await prisma.project.findUnique({
    where: { id },
    include: projectInclude(),
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(withViewerContext(project as unknown as Record<string, unknown>, access.user));
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const access = await getProjectAccess(id);
  if (!access.ok) return access.error;

  const body = await req.json();
  const existing = await prisma.project.findUnique({
    where: { id },
    include: {
      tasks: { orderBy: { createdAt: "asc" } },
      members: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const actorRole = resolveActorRole(access.user, existing);
  const projectLike = {
    ...existing,
    members: existing.members,
  };
  const isReviewAction =
    body.action === "APPROVE" || body.action === "REQUEST_REVISION";
  const reviewerOnly =
    !canTouchProject(access.role) &&
    (isReviewerUser(access.user, projectLike) || isReviewAction);

  if (!canTouchProject(access.role) && !isReviewerUser(access.user, projectLike)) {
    return NextResponse.json({ error: "Chỉ xem — không được sửa" }, { status: 403 });
  }
  if (reviewerOnly && !isReviewAction) {
    return NextResponse.json(
      { error: "Reviewer chỉ Approve / Request Revision" },
      { status: 403 }
    );
  }

  const data: Record<string, unknown> = {};
  const events: {
    action: string;
    detail?: string;
    oldValue?: string | null;
    newValue?: string | null;
  }[] = [];
  let resolved = resolveStepCount(existing);
  const statusNow = normalizeTaskStatus(existing.status);
  const locked =
    statusNow === "IN_REVIEW" || statusNow === "DONE";

  if (!Array.isArray(existing.stepLabels) || !existing.stepLabels.length) {
    const fromTasks = (existing.tasks || [])
      .map((t) => String(t.title || "").trim())
      .filter(Boolean);
    if (fromTasks.length) {
      const labels = [...resolved.labels];
      for (let i = 0; i < labels.length && i < fromTasks.length; i++) labels[i] = fromTasks[i];
      resolved = { ...resolved, labels };
    }
  }

  // ── Workflow actions (status only via actions) ───────────────────────────
  if (body.action) {
    const action = String(body.action);
    const gate = gateTaskAction(action, access.user, projectLike);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.error },
        { status: gate.status || 400 }
      );
    }

    if (action === "ACKNOWLEDGE") {
      data.acknowledgedAt = new Date();
      data.acknowledgedByUserId = access.user.id;
      events.push({
        action: "TASK_ACKNOWLEDGED",
        detail: "Owner đã nhận / đã biết Task",
        newValue: new Date().toISOString(),
      });
    } else if (action === "FORCE_ACKNOWLEDGE") {
      const reason = String(body.reason || body.note || "").trim();
      if (!reason) {
        return NextResponse.json(
          { error: "FORCE ACKNOWLEDGE bắt buộc reason" },
          { status: 400 }
        );
      }
      data.acknowledgedAt = new Date();
      data.acknowledgedByUserId = access.user.id;
      events.push({
        action: "TASK_FORCE_ACKNOWLEDGED",
        detail: `Admin force ack: ${reason}`,
        newValue: new Date().toISOString(),
      });
    } else if (action === "START") {
      data.status = "DOING";
      // Start does not replace Owner Acknowledge — only auto-ack if actor is Owner
      if (!existing.acknowledgedAt && isPrimaryMember(access.user, projectLike)) {
        data.acknowledgedAt = new Date();
        data.acknowledgedByUserId = access.user.id;
      }
      events.push({
        action: "TASK_STARTED",
        oldValue: existing.status,
        newValue: "DOING",
        detail: "Bắt đầu",
      });
    } else if (action === "MARK_WAITING") {
      const waitingFor = String(body.waitingFor || "").trim();
      const reason = String(body.waitingReason || body.reason || body.note || "").trim();
      if (!waitingFor || !reason) {
        return NextResponse.json(
          { error: "WAITING bắt buộc Waiting For và Reason" },
          { status: 400 }
        );
      }
      data.status = "WAITING";
      data.waitingFor = waitingFor.slice(0, 120);
      data.waitingReason = reason.slice(0, 500);
      data.waitingExpectedDate = body.waitingExpectedDate
        ? coerceDeadline(body.waitingExpectedDate) || String(body.waitingExpectedDate).slice(0, 32)
        : null;
      events.push({
        action: "TASK_WAITING",
        oldValue: existing.status,
        newValue: "WAITING",
        detail: `${waitingFor}: ${reason}`,
      });
    } else if (action === "REPORT_BLOCKED") {
      const title = String(body.blockerTitle || body.note || "").trim();
      const desc = String(body.blockerDescription || body.description || body.note || "").trim();
      if (!title || !desc) {
        return NextResponse.json(
          { error: "BLOCKED bắt buộc Blocker title và Description" },
          { status: 400 }
        );
      }
      data.status = "BLOCKED";
      data.blockerTitle = title.slice(0, 160);
      data.blockerDescription = desc.slice(0, 1000);
      events.push({
        action: "TASK_BLOCKED",
        oldValue: existing.status,
        newValue: "BLOCKED",
        detail: title,
      });
    } else if (action === "PAUSE") {
      const reason = String(body.pauseReason || body.reason || body.note || "").trim();
      if (!reason) {
        return NextResponse.json({ error: "PAUSE bắt buộc Pause reason" }, { status: 400 });
      }
      data.status = "PAUSED";
      data.pauseReason = reason.slice(0, 500);
      if (body.pausedBecauseProjectId) {
        data.pausedBecauseProjectId = String(body.pausedBecauseProjectId);
      }
      events.push({
        action: "TASK_PAUSED",
        oldValue: existing.status,
        newValue: "PAUSED",
        detail: reason,
      });
    } else if (action === "RESUME") {
      data.status = "DOING";
      data.waitingFor = null;
      data.waitingReason = null;
      data.waitingExpectedDate = null;
      data.pauseReason = null;
      data.pausedBecauseProjectId = null;
      events.push({
        action: "TASK_RESUMED",
        oldValue: existing.status,
        newValue: "DOING",
        detail: "Resume work",
      });
    } else if (action === "RESOLVE_AND_RESUME") {
      data.status = "DOING";
      data.blockerTitle = null;
      data.blockerDescription = null;
      events.push({
        action: "TASK_UNBLOCKED",
        oldValue: existing.status,
        newValue: "DOING",
        detail: String(body.note || "Resolve & Resume").slice(0, 500),
      });
    } else if (action === "SUBMIT_FOR_REVIEW" || action === "FORCE_SUBMIT_FOR_REVIEW") {
      if (action === "FORCE_SUBMIT_FOR_REVIEW") {
        const reason = String(body.reason || body.note || "").trim();
        if (!reason) {
          return NextResponse.json(
            { error: "FORCE SUBMIT bắt buộc reason" },
            { status: 400 }
          );
        }
        events.push({
          action: "FORCE_SUBMITTED_FOR_REVIEW",
          oldValue: existing.status,
          newValue: "IN_REVIEW",
          detail: `Admin force submit: ${reason}`,
        });
      } else {
        events.push({
          action: "SUBMITTED_FOR_REVIEW",
          oldValue: existing.status,
          newValue: "IN_REVIEW",
          detail: "Owner Submit for Review",
        });
      }
      data.status = "IN_REVIEW";
      data.revisionNote = null;
    } else if (action === "APPROVE") {
      data.status = "DONE";
      data.readiness = 100;
      data.revisionNote = null;
      if (allStepsComplete(existing.stepFlags)) {
        data.stepFlags = String(existing.stepFlags || "").replace(/[^01]/g, "");
      }
      events.push({
        action: "TASK_APPROVED",
        oldValue: existing.status,
        newValue: "DONE",
        detail: "Reviewer Approve",
      });
    } else if (action === "REQUEST_REVISION") {
      const note = String(body.revisionNote || body.note || "").trim();
      if (!note) {
        return NextResponse.json(
          { error: "Request Revision bắt buộc Note" },
          { status: 400 }
        );
      }
      data.status = "DOING";
      data.revisionNote = note.slice(0, 1000);
      events.push({
        action: "REVISION_REQUESTED",
        oldValue: existing.status,
        newValue: "DOING",
        detail: note.slice(0, 500),
      });
    } else if (action === "SET_CURRENT_STEP") {
      const idx = Number(body.stepIndex ?? body.currentStepIndex);
      if (Number.isNaN(idx) || idx < 0 || idx >= resolved.labels.length) {
        return NextResponse.json({ error: "currentStepIndex invalid" }, { status: 400 });
      }
      data.currentStepIndex = idx;
      events.push({
        action: "CURRENT_STEP_CHANGED",
        oldValue: existing.currentStepIndex != null ? String(existing.currentStepIndex) : null,
        newValue: String(idx),
        detail: resolved.labels[idx],
      });
    } else if (action === "REQUEST_DEADLINE_CHANGE") {
      const requested = coerceDeadline(body.requestedDeadline) || String(body.requestedDeadline || "").trim();
      const reason = String(body.reason || "").trim();
      if (!requested || !reason) {
        return NextResponse.json(
          { error: "Cần Requested Deadline và Reason" },
          { status: 400 }
        );
      }
      if (existing.pendingChangeRequest) {
        return NextResponse.json(
          { error: "Đã có change request đang chờ — đợi Admin xử lý" },
          { status: 400 }
        );
      }
      data.pendingChangeRequest = {
        type: "DEADLINE",
        currentDeadline: existing.deadline,
        requestedDeadline: requested,
        reason: reason.slice(0, 500),
        requestedByUserId: access.user.id,
        requestedByName: access.user.displayName || access.user.username,
        requestedAt: new Date().toISOString(),
      };
      events.push({
        action: "DEADLINE_CHANGE_REQUESTED",
        oldValue: existing.deadline,
        newValue: requested,
        detail: reason.slice(0, 500),
      });
    } else if (action === "REQUEST_PRIORITY_CHANGE") {
      if (body.important == null || body.urgent == null) {
        return NextResponse.json(
          { error: "Cần Important và Urgent đề xuất" },
          { status: 400 }
        );
      }
      const reason = String(body.reason || "").trim();
      if (!reason) {
        return NextResponse.json({ error: "Cần Reason" }, { status: 400 });
      }
      if (existing.pendingChangeRequest) {
        return NextResponse.json(
          { error: "Đã có change request đang chờ — đợi Admin xử lý" },
          { status: 400 }
        );
      }
      const reqImportant = !!body.important;
      const reqUrgent = !!body.urgent;
      data.pendingChangeRequest = {
        type: "PRIORITY",
        currentImportant: existing.important,
        currentUrgent: existing.urgent,
        requestedImportant: reqImportant,
        requestedUrgent: reqUrgent,
        reason: reason.slice(0, 500),
        requestedByUserId: access.user.id,
        requestedByName: access.user.displayName || access.user.username,
        requestedAt: new Date().toISOString(),
      };
      events.push({
        action: "PRIORITY_CHANGE_REQUESTED",
        detail: reason.slice(0, 500),
        newValue: deriveQuadrant(reqImportant, reqUrgent) || "",
      });
    } else if (action === "APPROVE_CHANGE_REQUEST") {
      const pending = existing.pendingChangeRequest as Record<string, unknown> | null;
      if (!pending || typeof pending !== "object") {
        return NextResponse.json({ error: "Không có change request" }, { status: 400 });
      }
      if (pending.type === "DEADLINE") {
        data.deadline = String(pending.requestedDeadline || "") || null;
        data.pendingChangeRequest = null;
        events.push({
          action: "DEADLINE_CHANGE_APPROVED",
          oldValue: String(pending.currentDeadline || existing.deadline || ""),
          newValue: String(pending.requestedDeadline || ""),
          detail: `Approved · ${String(pending.reason || "")} · by ${access.user.displayName}`,
        });
      } else if (pending.type === "PRIORITY") {
        const imp = !!pending.requestedImportant;
        const urg = !!pending.requestedUrgent;
        data.important = imp;
        data.urgent = urg;
        data.priority = matrixToLegacyPriority(imp, urg);
        data.pendingChangeRequest = null;
        events.push({
          action: "PRIORITY_CHANGE_APPROVED",
          detail: `Approved · ${String(pending.reason || "")} · by ${access.user.displayName}`,
          newValue: deriveQuadrant(imp, urg) || "",
        });
      } else {
        return NextResponse.json({ error: "Change request type không hỗ trợ" }, { status: 400 });
      }
    } else if (action === "REJECT_CHANGE_REQUEST") {
      const pending = existing.pendingChangeRequest as Record<string, unknown> | null;
      if (!pending || typeof pending !== "object") {
        return NextResponse.json({ error: "Không có change request" }, { status: 400 });
      }
      const note = String(body.reason || body.note || "Rejected").trim();
      data.pendingChangeRequest = null;
      events.push({
        action:
          pending.type === "DEADLINE"
            ? "DEADLINE_CHANGE_REJECTED"
            : "PRIORITY_CHANGE_REJECTED",
        detail: note.slice(0, 500),
        oldValue: JSON.stringify(pending).slice(0, 400),
      });
    } else if (action === "REPORT_ISSUE_TO_OWNER") {
      const title = String(body.title || body.issueTitle || "").trim();
      const desc = String(body.description || body.issueDescription || "").trim();
      const stepIndex =
        body.stepIndex != null ? Number(body.stepIndex) : null;
      if (!title || !desc) {
        return NextResponse.json(
          { error: "Issue title và Description bắt buộc" },
          { status: 400 }
        );
      }
      const issues = Array.isArray(existing.collabIssues)
        ? [...(existing.collabIssues as object[])]
        : [];
      const issue = {
        id: `iss_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        stepIndex: stepIndex != null && !Number.isNaN(stepIndex) ? stepIndex : null,
        title: title.slice(0, 160),
        description: desc.slice(0, 1000),
        reportedByUserId: access.user.id,
        reportedByName: access.user.displayName || access.user.username,
        status: "OPEN",
        createdAt: new Date().toISOString(),
      };
      issues.push(issue);
      data.collabIssues = issues as unknown as Prisma.InputJsonValue;
      events.push({
        action: "COLLABORATOR_ISSUE_REPORTED",
        detail: title,
        newValue: issue.id,
      });
    } else if (action === "ACKNOWLEDGE_ISSUE") {
      const issueId = String(body.issueId || "").trim();
      const issues = Array.isArray(existing.collabIssues)
        ? (existing.collabIssues as Record<string, unknown>[]).map((x) => ({ ...x }))
        : [];
      const found = issues.find((x) => String(x.id) === issueId);
      if (!found) {
        return NextResponse.json({ error: "Issue không tồn tại" }, { status: 404 });
      }
      found.status = "ACKNOWLEDGED";
      found.acknowledgedAt = new Date().toISOString();
      data.collabIssues = issues as unknown as Prisma.InputJsonValue;
      events.push({
        action: "ISSUE_ACKNOWLEDGED",
        detail: String(found.title || issueId),
        newValue: issueId,
      });
    } else if (action === "ESCALATE_ISSUE_TO_BLOCKER") {
      const issueId = String(body.issueId || "").trim();
      const issues = Array.isArray(existing.collabIssues)
        ? (existing.collabIssues as Record<string, unknown>[]).map((x) => ({ ...x }))
        : [];
      const found = issues.find((x) => String(x.id) === issueId);
      if (!found) {
        return NextResponse.json({ error: "Issue không tồn tại" }, { status: 404 });
      }
      found.status = "ESCALATED";
      found.escalatedAt = new Date().toISOString();
      data.collabIssues = issues as unknown as Prisma.InputJsonValue;
      data.status = "BLOCKED";
      data.blockerTitle = String(found.title || "Escalated issue").slice(0, 160);
      data.blockerDescription = String(found.description || "").slice(0, 1000);
      events.push({
        action: "ISSUE_ESCALATED_TO_BLOCKER",
        oldValue: existing.status,
        newValue: "BLOCKED",
        detail: String(found.title || issueId),
      });
    }
  }

  // ── Members ──────────────────────────────────────────────────────────────
  if (body.setPrimaryUserId || body.addCollaboratorUserId || body.removeMemberUserId) {
    if (!canManageMembers(access.role) && actorRole !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ phụ trách chính mới đổi thành viên" }, { status: 403 });
    }
    if (statusNow === "DONE") {
      return NextResponse.json({ error: "Task DONE — không đổi thành viên" }, { status: 400 });
    }
  }
  if (body.setPrimaryUserId) {
    const uid = String(body.setPrimaryUserId);
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user) return NextResponse.json({ error: "User không tồn tại" }, { status: 400 });
    await prisma.projectMember.updateMany({
      where: { projectId: id, role: ProjectMemberRole.PRIMARY },
      data: { role: ProjectMemberRole.COLLABORATOR },
    });
    await ensurePrimaryMember(id, uid);
    data.owner = user.displayName || user.username;
    events.push({ action: "PRIMARY", oldValue: existing.owner, newValue: data.owner as string, detail: "Đổi phụ trách chính" });
  }
  if (body.addCollaboratorUserId) {
    const uid = String(body.addCollaboratorUserId);
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId: uid } },
      create: { projectId: id, userId: uid, role: ProjectMemberRole.COLLABORATOR },
      update: { role: ProjectMemberRole.COLLABORATOR },
    });
    events.push({ action: "MEMBER_ADD", newValue: uid, detail: "Thêm phối hợp" });
  }
  if (body.removeMemberUserId) {
    const uid = String(body.removeMemberUserId);
    const target = existing.members.find((m) => m.userId === uid);
    if (target?.role === ProjectMemberRole.PRIMARY) {
      return NextResponse.json({ error: "Không xóa phụ trách chính" }, { status: 400 });
    }
    await prisma.projectMember.deleteMany({ where: { projectId: id, userId: uid } });
    events.push({ action: "MEMBER_REMOVE", oldValue: uid, detail: "Gỡ thành viên" });
  }

  // ── Work Plan structure ──────────────────────────────────────────────────
  const structureTouch =
    body.addStep != null ||
    body.removeStep != null ||
    Array.isArray(body.stepLabels) ||
    Array.isArray(body.stepDeadlines) ||
    Array.isArray(body.stepOwners);

  if (structureTouch) {
    if (!canEditWorkPlanStructure(actorRole)) {
      return NextResponse.json(
        { error: "Collaborator không được sửa cấu trúc Work Plan" },
        { status: 403 }
      );
    }
    if (locked) {
      return NextResponse.json(
        { error: "Task đang IN_REVIEW hoặc DONE — không sửa Work Plan" },
        { status: 400 }
      );
    }
  }

  if (body.addStep != null) {
    const title = String(body.addStep || "").trim().slice(0, 120);
    if (!title) return NextResponse.json({ error: "Tên công việc trống" }, { status: 400 });
    if (resolved.labels.length >= MAX_STEPS) {
      return NextResponse.json({ error: `Tối đa ${MAX_STEPS} hạng mục` }, { status: 400 });
    }
    const labels = [...resolved.labels, title];
    const flags = resolved.flags + "0";
    const proofs = normalizeProofs(existing.stepProofs, resolved.proofsLen);
    proofs.push([]);
    const deadlines = normalizeDeadlines(existing.stepDeadlines, resolved.proofsLen);
    deadlines.push(coerceDeadline(body.stepDeadline));
    const owners = normalizeOwners(existing.stepOwners, resolved.proofsLen);
    owners.push(String(body.stepOwner || "").trim().slice(0, 120));
    const estimates = Array.from({ length: resolved.proofsLen }, (_, i) => {
      const arr = Array.isArray(existing.stepEstimates) ? existing.stepEstimates : [];
      const v = arr[i];
      return v == null || v === "" ? null : Number(v);
    });
    const est =
      body.stepEstimateMinutes != null && body.stepEstimateMinutes !== ""
        ? Math.max(0, Math.round(Number(body.stepEstimateMinutes)) || 0)
        : null;
    estimates.push(est);
    data.stepLabels = labels as unknown as Prisma.InputJsonValue;
    data.stepFlags = flags;
    data.stepProofs = proofs as unknown as Prisma.InputJsonValue;
    data.stepDeadlines = deadlines as unknown as Prisma.InputJsonValue;
    data.stepOwners = owners as unknown as Prisma.InputJsonValue;
    data.stepEstimates = estimates as unknown as Prisma.InputJsonValue;
    data.readiness = readinessFromFlags(flags);
    events.push({ action: "STEP_ADD", newValue: title });
  } else if (body.removeStep != null) {
    const idx = Number(body.removeStep);
    if (Number.isNaN(idx) || idx < 0 || idx >= resolved.labels.length) {
      return NextResponse.json({ error: "removeStep invalid" }, { status: 400 });
    }
    if (resolved.labels.length <= 1) {
      return NextResponse.json({ error: "Phải còn ít nhất 1 hạng mục" }, { status: 400 });
    }
    const labels = resolved.labels.filter((_, i) => i !== idx);
    const flags = [...resolved.flags].filter((_, i) => i !== idx).join("");
    const proofs = normalizeProofs(existing.stepProofs, resolved.proofsLen).filter((_, i) => i !== idx);
    const deadlines = normalizeDeadlines(existing.stepDeadlines, resolved.proofsLen).filter((_, i) => i !== idx);
    const owners = normalizeOwners(existing.stepOwners, resolved.proofsLen).filter((_, i) => i !== idx);
    data.stepLabels = labels as unknown as Prisma.InputJsonValue;
    data.stepFlags = flags;
    data.stepProofs = proofs as unknown as Prisma.InputJsonValue;
    data.stepDeadlines = deadlines as unknown as Prisma.InputJsonValue;
    data.stepOwners = owners as unknown as Prisma.InputJsonValue;
    data.readiness = readinessFromFlags(flags);
  } else if (body.stepIndex != null) {
    const idx = Number(body.stepIndex);
    if (idx < 0 || idx >= resolved.labels.length || Number.isNaN(idx)) {
      return NextResponse.json({ error: `stepIndex must be 0..${resolved.labels.length - 1}` }, { status: 400 });
    }
    const ownersArr = normalizeOwners(existing.stepOwners, resolved.proofsLen);
    const stepOwner = ownersArr[idx];
    const mayAct = canActOnStep(actorRole, access.user, stepOwner);

    if (body.proof !== undefined || body.removeProofIndex != null) {
      if (!mayAct) {
        return NextResponse.json(
          { error: "Chỉ thao tác Proof trên Step được giao" },
          { status: 403 }
        );
      }
      if (statusNow === "DONE") {
        return NextResponse.json({ error: "Task DONE — không đổi proof" }, { status: 400 });
      }
      const proofs = normalizeProofs(existing.stepProofs, resolved.proofsLen);
      if (body.proof === null && body.removeProofIndex == null) proofs[idx] = [];
      else if (body.removeProofIndex != null) {
        const pi = Number(body.removeProofIndex);
        if (Number.isNaN(pi) || pi < 0 || pi >= proofs[idx].length) {
          return NextResponse.json({ error: "removeProofIndex invalid" }, { status: 400 });
        }
        proofs[idx] = proofs[idx].filter((_, j) => j !== pi);
      } else if (body.proof && typeof body.proof === "object") {
        const name = String(body.proof.name || "proof.jpg").slice(0, 120);
        const dataUrl = String(body.proof.dataUrl || "");
        if (!dataUrl.startsWith("data:image/")) {
          return NextResponse.json({ error: "proof.dataUrl must be an image data URL" }, { status: 400 });
        }
        if (dataUrl.length > 900_000) {
          return NextResponse.json({ error: "Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn." }, { status: 400 });
        }
        if (proofs[idx].length >= MAX_PROOFS_PER_STEP) {
          return NextResponse.json({ error: `Tối đa ${MAX_PROOFS_PER_STEP} ảnh / hạng mục` }, { status: 400 });
        }
        proofs[idx] = [...proofs[idx], { name, dataUrl }];
      }
      data.stepProofs = proofs as unknown as Prisma.InputJsonValue;
      data.stepLabels = resolved.labels as unknown as Prisma.InputJsonValue;
      data.stepFlags = resolved.flags;
    }
    if (body.done !== undefined) {
      if (!mayAct) {
        return NextResponse.json(
          { error: "Chỉ hoàn thành Step được giao cho bạn" },
          { status: 403 }
        );
      }
      if (locked) {
        return NextResponse.json(
          { error: "Task đang IN_REVIEW hoặc DONE — không tick Step" },
          { status: 400 }
        );
      }
      const flagsArr = resolved.flags.split("");
      flagsArr[idx] = body.done === false ? "0" : "1";
      const stepFlags = flagsArr.join("");
      data.stepFlags = stepFlags;
      data.stepLabels = resolved.labels as unknown as Prisma.InputJsonValue;
      data.readiness = readinessFromFlags(stepFlags);
      // Start work implicitly — do NOT auto DONE
      if (body.done && existing.status === "TODO") data.status = "DOING";
      if (body.done) {
        events.push({
          action: "STEP_COMPLETED",
          detail: resolved.labels[idx],
          newValue: String(idx),
        });
        // Advance current step to next incomplete
        const nextFlags = stepFlags;
        let nextCur: number | null = null;
        for (let i = 0; i < nextFlags.length; i++) {
          if (nextFlags[i] !== "1") {
            nextCur = i;
            break;
          }
        }
        data.currentStepIndex = nextCur;
      } else if (body.done === false) {
        data.currentStepIndex = idx;
      }
    }
    if (body.stepDeadline !== undefined || body.stepOwner !== undefined || body.stepEstimateMinutes !== undefined) {
      if (!canEditWorkPlanStructure(actorRole)) {
        return NextResponse.json(
          { error: "Không được đổi hạn / phụ trách / estimate Step" },
          { status: 403 }
        );
      }
      if (body.stepDeadline !== undefined) {
        const deadlines = normalizeDeadlines(existing.stepDeadlines, resolved.proofsLen);
        deadlines[idx] = coerceDeadline(body.stepDeadline);
        data.stepDeadlines = deadlines as unknown as Prisma.InputJsonValue;
      }
      if (body.stepOwner !== undefined) {
        const owners = normalizeOwners(existing.stepOwners, resolved.proofsLen);
        owners[idx] = String(body.stepOwner || "").trim().slice(0, 120);
        data.stepOwners = owners as unknown as Prisma.InputJsonValue;
      }
      if (body.stepEstimateMinutes !== undefined) {
        const estimates = Array.from({ length: resolved.proofsLen }, (_, i) => {
          const arr = Array.isArray(existing.stepEstimates) ? existing.stepEstimates : [];
          const v = arr[i];
          return v == null || v === "" ? null : Number(v);
        });
        estimates[idx] =
          body.stepEstimateMinutes === null || body.stepEstimateMinutes === ""
            ? null
            : Math.max(0, Math.round(Number(body.stepEstimateMinutes)) || 0);
        data.stepEstimates = estimates as unknown as Prisma.InputJsonValue;
      }
      data.stepLabels = resolved.labels as unknown as Prisma.InputJsonValue;
      data.stepFlags = resolved.flags;
    }
  } else if (body.stepFlags != null) {
    if (!canEditWorkPlanStructure(actorRole)) {
      return NextResponse.json({ error: "Không được đổi stepFlags hàng loạt" }, { status: 403 });
    }
    const stepFlags = normalizeFlags(body.stepFlags, resolved.labels.length);
    data.stepFlags = stepFlags;
    data.readiness = readinessFromFlags(stepFlags);
  } else if (body.readiness != null && !body.action) {
    // Legacy compatibility: store but do not treat as primary progress
    if (!canEditMainTask(actorRole)) {
      return NextResponse.json({ error: "Không cập nhật readiness tay" }, { status: 403 });
    }
    data.readiness = clampProgress(body.readiness);
  }

  // Free status dropdown removed — reject unless admin forceStatus (override)
  if (body.status != null && !body.action) {
    if (actorRole === "ADMIN" && body.forceStatus === true) {
      const next = normalizeTaskStatus(body.status);
      data.status = next;
      events.push({
        action: "STATUS",
        oldValue: existing.status,
        newValue: next,
        detail: "Admin force status",
      });
    } else {
      return NextResponse.json(
        {
          error:
            "Status chỉ đổi qua action (START, WAITING, BLOCKED, PAUSE, SUBMIT, APPROVE…). Không dùng dropdown.",
        },
        { status: 400 }
      );
    }
  }

  // ── Main Task fields ─────────────────────────────────────────────────────
  const mainTouch =
    body.name != null ||
    body.owner != null ||
    body.description !== undefined ||
    body.priority != null ||
    body.deadline !== undefined ||
    body.category !== undefined ||
    body.budget !== undefined ||
    body.unitName !== undefined ||
    body.important != null ||
    body.urgent != null ||
    body.expectedResult !== undefined ||
    body.proofRequired != null ||
    body.proofDescription !== undefined ||
    body.estimatedDurationMinutes !== undefined ||
    body.reviewerUserId !== undefined;

  if (mainTouch) {
    if (!canEditMainTask(actorRole)) {
      return NextResponse.json(
        { error: "Chỉ Admin/Owner mới sửa Main Task" },
        { status: 403 }
      );
    }
    // Owner cannot change deadline / importance / urgency — Admin only
    if (actorRole === "PRIMARY") {
      if (body.deadline !== undefined) {
        return NextResponse.json(
          { error: "Owner không tự đổi Deadline — dùng Request Deadline Change (Phase sau)" },
          { status: 403 }
        );
      }
      if (body.important != null || body.urgent != null || body.priority != null) {
        return NextResponse.json(
          { error: "Owner không đổi Importance/Urgency" },
          { status: 403 }
        );
      }
      if (body.reviewerUserId !== undefined) {
        return NextResponse.json({ error: "Chỉ Admin đổi Reviewer" }, { status: 403 });
      }
    }
    if (statusNow === "IN_REVIEW" && actorRole !== "ADMIN") {
      return NextResponse.json(
        { error: "IN_REVIEW — không sửa Main Task trừ khi Revision" },
        { status: 400 }
      );
    }
    if (statusNow === "DONE" && actorRole !== "ADMIN") {
      return NextResponse.json({ error: "Task DONE — read only" }, { status: 400 });
    }
  }

  if (body.name != null) {
    const next = String(body.name).trim() || existing.name;
    if (next !== existing.name) events.push({ action: "NAME", oldValue: existing.name, newValue: next });
    data.name = next;
  }
  if (body.owner != null && (actorRole === "ADMIN" || canManageMembers(access.role))) {
    data.owner = body.owner ? String(body.owner) : null;
    const u = body.owner ? await findUserByOwnerLabel(String(body.owner)) : null;
    if (u) {
      await prisma.projectMember.updateMany({
        where: { projectId: id, role: ProjectMemberRole.PRIMARY },
        data: { role: ProjectMemberRole.COLLABORATOR },
      });
      await ensurePrimaryMember(id, u.id);
    }
  }
  if (body.description !== undefined) {
    data.description = body.description ? String(body.description).trim() : null;
  }
  if (body.priority != null && actorRole === "ADMIN") {
    const p = String(body.priority);
    data.priority = ["P1", "P2", "P3"].includes(p) ? p : "P2";
    events.push({
      action: "PRIORITY_CHANGED",
      oldValue: existing.priority,
      newValue: data.priority as string,
      detail: "Legacy priority",
    });
  }
  if (body.important != null && actorRole === "ADMIN") {
    data.important = !!body.important;
    events.push({
      action: "PRIORITY_CHANGED",
      detail: `important=${!!body.important}`,
    });
  }
  if (body.urgent != null && actorRole === "ADMIN") {
    data.urgent = !!body.urgent;
    events.push({
      action: "PRIORITY_CHANGED",
      detail: `urgent=${!!body.urgent}`,
    });
  }
  if (body.deadline !== undefined && actorRole === "ADMIN") {
    data.deadline = body.deadline ? coerceDeadline(body.deadline) || String(body.deadline) : null;
    events.push({
      action: "DEADLINE_CHANGED",
      oldValue: existing.deadline,
      newValue: data.deadline as string | null,
    });
  }
  if (body.category !== undefined) data.category = body.category ? String(body.category).trim() : null;
  if (body.budget !== undefined) {
    data.budget = body.budget === null || body.budget === "" ? null : Number(body.budget);
  }
  if (body.expectedResult !== undefined) {
    data.expectedResult = body.expectedResult ? String(body.expectedResult).trim().slice(0, 2000) : null;
  }
  if (body.proofRequired != null) {
    data.proofRequired = !!body.proofRequired;
    data.requireAfterProof = !!body.proofRequired;
  }
  if (body.proofDescription !== undefined) {
    data.proofDescription = body.proofDescription
      ? String(body.proofDescription).trim().slice(0, 1000)
      : null;
  }
  if (body.estimatedDurationMinutes !== undefined) {
    const n = Number(body.estimatedDurationMinutes);
    data.estimatedDurationMinutes =
      body.estimatedDurationMinutes === null || body.estimatedDurationMinutes === ""
        ? null
        : Number.isFinite(n)
          ? Math.max(0, Math.round(n))
          : null;
  }
  if (body.reviewerUserId !== undefined && actorRole === "ADMIN") {
    const rid = body.reviewerUserId ? String(body.reviewerUserId) : null;
    if (rid) {
      const u = await prisma.user.findUnique({ where: { id: rid } });
      if (!u) return NextResponse.json({ error: "Reviewer không tồn tại" }, { status: 400 });
    }
    data.reviewerUserId = rid;
  }
  if (body.unitName !== undefined) {
    const unitName = String(body.unitName || "").trim();
    if (!unitName) data.unitId = null;
    else {
      const unit = await prisma.unit.findUnique({ where: { name: unitName } });
      data.unitId = unit?.id ?? null;
    }
  }
  if (Array.isArray(body.stepLabels)) {
    const labels = body.stepLabels.map((x: unknown) => String(x || "").trim()).filter(Boolean).slice(0, MAX_STEPS);
    if (labels.length >= 1) {
      const flags = normalizeFlags(existing.stepFlags, labels.length);
      const proofs = normalizeProofs(existing.stepProofs, labels.length);
      const deadlines = Array.isArray(body.stepDeadlines)
        ? normalizeDeadlines(body.stepDeadlines, labels.length)
        : normalizeDeadlines(existing.stepDeadlines, labels.length);
      const owners = Array.isArray(body.stepOwners)
        ? normalizeOwners(body.stepOwners, labels.length)
        : normalizeOwners(existing.stepOwners, labels.length);
      data.stepLabels = labels as unknown as Prisma.InputJsonValue;
      data.stepFlags = flags;
      data.stepProofs = proofs as unknown as Prisma.InputJsonValue;
      data.stepDeadlines = deadlines as unknown as Prisma.InputJsonValue;
      data.stepOwners = owners as unknown as Prisma.InputJsonValue;
      if (Array.isArray(body.stepEstimates)) {
        data.stepEstimates = Array.from({ length: labels.length }, (_, i) => {
          const v = body.stepEstimates[i];
          if (v == null || v === "") return null;
          return Math.max(0, Math.round(Number(v)) || 0);
        }) as unknown as Prisma.InputJsonValue;
      }
      data.readiness = readinessFromFlags(flags);
    }
  } else if (Array.isArray(body.stepDeadlines)) {
    data.stepDeadlines = normalizeDeadlines(body.stepDeadlines, resolved.labels.length) as unknown as Prisma.InputJsonValue;
    data.stepLabels = resolved.labels as unknown as Prisma.InputJsonValue;
  } else if (Array.isArray(body.stepOwners)) {
    data.stepOwners = normalizeOwners(body.stepOwners, resolved.labels.length) as unknown as Prisma.InputJsonValue;
    data.stepLabels = resolved.labels as unknown as Prisma.InputJsonValue;
  }

  const memberOnly =
    !Object.keys(data).length &&
    (body.setPrimaryUserId || body.addCollaboratorUserId || body.removeMemberUserId);

  if (!Object.keys(data).length && !memberOnly && !events.length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (Object.keys(data).length) {
    await prisma.project.update({ where: { id }, data });
  }

  for (const ev of events) {
    await logProjectEvent({
      projectId: id,
      actorUserId: access.user.id,
      action: ev.action,
      detail: ev.detail,
      oldValue: ev.oldValue,
      newValue: ev.newValue,
    });
  }

  const fresh = await prisma.project.findUnique({ where: { id }, include: projectInclude() });
  return NextResponse.json(
    withViewerContext(fresh as unknown as Record<string, unknown>, access.user)
  );
}
