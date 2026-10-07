import type { Project, ProjectMemberRole, User } from "@prisma/client";
import { isSystemAdmin } from "@/lib/auth";

/** Official Task statuses (UI "Task" = Project). */
export const TASK_STATUSES = [
  "TODO",
  "DOING",
  "WAITING",
  "BLOCKED",
  "PAUSED",
  "IN_REVIEW",
  "DONE",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type WorkflowActorRole = "ADMIN" | "PRIMARY" | "COLLABORATOR" | "VIEWER" | "NONE";

export function normalizeTaskStatus(raw: unknown): TaskStatus {
  const s = String(raw || "TODO").toUpperCase();
  if ((TASK_STATUSES as readonly string[]).includes(s)) return s as TaskStatus;
  if (s === "ON_TRACK") return "DOING";
  if (s === "AT_RISK") return "WAITING";
  return "TODO";
}

export function deriveQuadrant(
  important: boolean | null | undefined,
  urgent: boolean | null | undefined
): "DO_NOW" | "PLAN" | "QUICK_ACTION" | "BACKLOG" | null {
  if (important == null || urgent == null) return null;
  if (important && urgent) return "DO_NOW";
  if (important && !urgent) return "PLAN";
  if (!important && urgent) return "QUICK_ACTION";
  return "BACKLOG";
}

export function quadrantLabel(
  q: "DO_NOW" | "PLAN" | "QUICK_ACTION" | "BACKLOG" | null
): string {
  if (q === "DO_NOW") return "DO NOW";
  if (q === "PLAN") return "PLAN";
  if (q === "QUICK_ACTION") return "QUICK ACTION";
  if (q === "BACKLOG") return "BACKLOG";
  return "—";
}

export function legacyPriorityToMatrix(priority: string | null | undefined): {
  important: boolean;
  urgent: boolean;
} {
  const p = String(priority || "P2").toUpperCase();
  if (p === "P0" || p === "P1") return { important: true, urgent: true };
  if (p === "P3") return { important: false, urgent: false };
  return { important: true, urgent: false };
}

export function matrixToLegacyPriority(important: boolean, urgent: boolean): string {
  if (important && urgent) return "P1";
  if (important) return "P2";
  return "P3";
}

export type ProjectLike = Pick<
  Project,
  | "status"
  | "acknowledgedAt"
  | "reviewerUserId"
  | "assignedByUserId"
  | "requireAfterProof"
  | "proofRequired"
  | "stepFlags"
  | "stepProofs"
  | "owner"
> & {
  members?: { userId: string; role: ProjectMemberRole }[];
  stepLabels?: unknown;
  currentStepIndex?: number | null;
  pendingChangeRequest?: unknown;
  collabIssues?: unknown;
};

export function resolveActorRole(
  user: User,
  project: ProjectLike
): WorkflowActorRole {
  if (isSystemAdmin(user)) return "ADMIN";
  const member = project.members?.find((m) => m.userId === user.id);
  if (member?.role === "PRIMARY") return "PRIMARY";
  if (member?.role === "COLLABORATOR") return "COLLABORATOR";
  if (member?.role === "VIEWER") return "VIEWER";
  const o = String(project.owner || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  const u = user.username.toLowerCase();
  const d = user.displayName.toLowerCase().replace(/\s+/g, "");
  if (o && (o === u || o === d || o.includes(u) || (d && o.includes(d)))) {
    return "PRIMARY";
  }
  return "NONE";
}

export function isPrimaryMember(user: User, project: ProjectLike): boolean {
  if (project.members?.some((m) => m.userId === user.id && m.role === "PRIMARY")) {
    return true;
  }
  const o = String(project.owner || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!o) return false;
  const u = user.username.toLowerCase();
  const d = user.displayName.toLowerCase().replace(/\s+/g, "");
  return o === u || o === d || o.includes(u) || (!!d && o.includes(d));
}

export function isReviewerUser(user: User, project: ProjectLike): boolean {
  if (project.reviewerUserId && project.reviewerUserId === user.id) return true;
  if (!project.reviewerUserId && project.assignedByUserId === user.id) return true;
  if (!project.reviewerUserId && isSystemAdmin(user)) return true;
  return false;
}

export function isAssignerUser(user: User, project: ProjectLike): boolean {
  if (project.assignedByUserId && project.assignedByUserId === user.id) return true;
  return isSystemAdmin(user);
}

export function isProofRequired(project: ProjectLike): boolean {
  if (project.proofRequired != null) return !!project.proofRequired;
  return project.requireAfterProof !== false;
}

function hasAfterProof(stepProofs: unknown): boolean {
  if (!Array.isArray(stepProofs) || !stepProofs.length) return false;
  const last = stepProofs[stepProofs.length - 1];
  if (Array.isArray(last)) return last.length > 0;
  return !!(
    last &&
    typeof last === "object" &&
    (last as { dataUrl?: string }).dataUrl
  );
}

export function workPlanFlags(stepFlags: string | null | undefined): string {
  return String(stepFlags || "").replace(/[^01]/g, "");
}

export function workPlanLabels(stepLabels: unknown): string[] {
  if (!Array.isArray(stepLabels)) return [];
  return stepLabels.map((x) => String(x || "").trim()).filter(Boolean);
}

export function allStepsComplete(stepFlags: string | null | undefined): boolean {
  const flags = workPlanFlags(stepFlags);
  return flags.length > 0 && /^1+$/.test(flags);
}

export function workPlanProgress(project: {
  stepFlags?: string | null;
  stepLabels?: unknown;
}): { done: number; total: number; percent: number } {
  const labels = workPlanLabels(project.stepLabels);
  let flags = workPlanFlags(project.stepFlags);
  const total = Math.max(labels.length, flags.length, 0);
  if (!total) return { done: 0, total: 0, percent: 0 };
  if (flags.length < total) flags = flags.padEnd(total, "0");
  if (flags.length > total) flags = flags.slice(0, total);
  const done = [...flags].filter((c) => c === "1").length;
  return { done, total, percent: Math.round((done / total) * 100) };
}

/** Current / next step — Owner-set currentStepIndex wins; else first incomplete. */
export function resolveCurrentNextStep(project: {
  stepFlags?: string | null;
  stepLabels?: unknown;
  currentStepIndex?: number | null;
}): {
  currentIndex: number | null;
  currentLabel: string | null;
  nextIndex: number | null;
  nextLabel: string | null;
} {
  const labels = workPlanLabels(project.stepLabels);
  let flags = workPlanFlags(project.stepFlags);
  if (!labels.length && !flags.length) {
    return { currentIndex: null, currentLabel: null, nextIndex: null, nextLabel: null };
  }
  const total = Math.max(labels.length, flags.length);
  while (labels.length < total) labels.push(`Step ${labels.length + 1}`);
  if (flags.length < total) flags = flags.padEnd(total, "0");

  let currentIndex: number | null =
    project.currentStepIndex != null &&
    project.currentStepIndex >= 0 &&
    project.currentStepIndex < total
      ? project.currentStepIndex
      : null;

  if (currentIndex == null || flags[currentIndex] === "1") {
    currentIndex = null;
    for (let i = 0; i < total; i++) {
      if (flags[i] !== "1") {
        currentIndex = i;
        break;
      }
    }
  }

  let nextIndex: number | null = null;
  if (currentIndex != null) {
    for (let i = currentIndex + 1; i < total; i++) {
      if (flags[i] !== "1") {
        nextIndex = i;
        break;
      }
    }
    if (nextIndex == null) {
      for (let i = 0; i < total; i++) {
        if (i !== currentIndex && flags[i] !== "1") {
          nextIndex = i;
          break;
        }
      }
    }
  }

  return {
    currentIndex,
    currentLabel: currentIndex != null ? labels[currentIndex] : null,
    nextIndex,
    nextLabel: nextIndex != null ? labels[nextIndex] : null,
  };
}

export function needsAcknowledge(project: ProjectLike): boolean {
  if (project.acknowledgedAt) return false;
  const s = normalizeTaskStatus(project.status);
  if (s !== "TODO") return false;
  return true;
}

export function submitBlockers(project: ProjectLike): string[] {
  const blockers: string[] = [];
  const status = normalizeTaskStatus(project.status);
  if (status === "BLOCKED") blockers.push("Task đang BLOCKED — Resolve trước khi Submit");
  if (status === "WAITING") blockers.push("Task đang WAITING — Resume trước khi Submit");
  if (status === "PAUSED") blockers.push("Task đang PAUSED — Resume trước khi Submit");
  if (status === "IN_REVIEW") blockers.push("Task đã ở IN_REVIEW");
  if (status === "DONE") blockers.push("Task đã DONE");
  if (needsAcknowledge(project)) blockers.push("Chưa Acknowledge");
  if (!allStepsComplete(project.stepFlags)) {
    const flags = workPlanFlags(project.stepFlags);
    const left = [...flags].filter((c) => c !== "1").length || flags.length || 1;
    blockers.push(`${left} hạng mục chưa hoàn thành`);
  }
  if (
    isProofRequired(project) &&
    !allStepsComplete(project.stepFlags) &&
    !hasAfterProof(project.stepProofs)
  ) {
    blockers.push("Thiếu proof bắt buộc");
  }
  return blockers;
}

export function canEditMainTask(role: WorkflowActorRole): boolean {
  return role === "ADMIN" || role === "PRIMARY";
}

export function canEditWorkPlanStructure(role: WorkflowActorRole): boolean {
  return role === "ADMIN" || role === "PRIMARY";
}

export function canManageTaskMembers(role: WorkflowActorRole): boolean {
  return role === "ADMIN" || role === "PRIMARY";
}

export function canCompleteAnyStep(role: WorkflowActorRole): boolean {
  return role === "ADMIN" || role === "PRIMARY";
}

export function personKeyMatch(
  label: string | null | undefined,
  user: Pick<User, "id" | "username" | "displayName">
): boolean {
  if (!label) return false;
  const o = String(label)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!o) return false;
  if (o === user.id.toLowerCase()) return true;
  const u = user.username.toLowerCase();
  const d = user.displayName.toLowerCase().replace(/\s+/g, "");
  return o === u || o === d || o.includes(u) || (!!d && o.includes(d));
}

export function canActOnStep(
  role: WorkflowActorRole,
  user: User,
  stepOwnerLabel: string | null | undefined
): boolean {
  if (canCompleteAnyStep(role)) return true;
  if (role === "COLLABORATOR") return personKeyMatch(stepOwnerLabel, user);
  return false;
}

export type ActionGate =
  | { ok: true }
  | { ok: false; error: string; status?: number };

function submitNeedList(project: ProjectLike): string[] {
  const need: string[] = [];
  if (needsAcknowledge(project)) need.push("Chưa Acknowledge");
  if (!allStepsComplete(project.stepFlags)) {
    const flags = workPlanFlags(project.stepFlags);
    const left = [...flags].filter((c) => c !== "1").length;
    need.push(`${left} hạng mục chưa hoàn thành`);
  }
  if (
    isProofRequired(project) &&
    !allStepsComplete(project.stepFlags) &&
    !hasAfterProof(project.stepProofs)
  ) {
    need.push("Thiếu proof bắt buộc");
  }
  return need;
}

export function gateTaskAction(
  action: string,
  user: User,
  project: ProjectLike
): ActionGate {
  const role = resolveActorRole(user, project);
  const status = normalizeTaskStatus(project.status);
  const reviewer = isReviewerUser(user, project);
  const assigner = isAssignerUser(user, project);

  if (role === "NONE" && !reviewer && !assigner) {
    return { ok: false, error: "Không có quyền trên Task này", status: 403 };
  }

  switch (action) {
    case "ACKNOWLEDGE":
      // Owner (PRIMARY) only — even if same user is SYSTEM_ADMIN
      if (!isPrimaryMember(user, project)) {
        return {
          ok: false,
          error:
            role === "ADMIN"
              ? "Admin không Acknowledge thay Owner — dùng FORCE ACKNOWLEDGE (override)"
              : "Chỉ Owner mới Acknowledge",
          status: 403,
        };
      }
      if (!needsAcknowledge(project)) {
        return { ok: false, error: "Task đã được Acknowledge" };
      }
      return { ok: true };

    case "FORCE_ACKNOWLEDGE":
      if (role !== "ADMIN") {
        return { ok: false, error: "Chỉ Admin FORCE ACKNOWLEDGE", status: 403 };
      }
      if (!needsAcknowledge(project)) {
        return { ok: false, error: "Task đã được Acknowledge" };
      }
      return { ok: true };

    case "START":
      if (role !== "PRIMARY" && role !== "ADMIN") {
        return { ok: false, error: "Chỉ Owner mới Start", status: 403 };
      }
      if (status !== "TODO") {
        return { ok: false, error: "Chỉ Start từ TODO" };
      }
      return { ok: true };

    case "MARK_WAITING":
      if (role !== "PRIMARY" && role !== "ADMIN") {
        return { ok: false, error: "Chỉ Owner mới Mark Waiting", status: 403 };
      }
      if (status !== "DOING") {
        return { ok: false, error: "Chỉ Mark Waiting từ DOING" };
      }
      return { ok: true };

    case "REPORT_BLOCKED":
      if (role !== "PRIMARY" && role !== "ADMIN") {
        return {
          ok: false,
          error:
            role === "COLLABORATOR"
              ? "Collaborator dùng REPORT_ISSUE_TO_OWNER — Owner mới Escalate"
              : "Không có quyền Report Blocked",
          status: 403,
        };
      }
      if (status !== "DOING") {
        return { ok: false, error: "Chỉ Report Blocked từ DOING" };
      }
      return { ok: true };

    case "PAUSE":
      if (role !== "PRIMARY" && role !== "ADMIN") {
        return { ok: false, error: "Chỉ Owner/Admin mới Pause", status: 403 };
      }
      if (status !== "DOING") {
        return { ok: false, error: "Chỉ Pause từ DOING" };
      }
      return { ok: true };

    case "RESUME":
      if (role !== "PRIMARY" && role !== "ADMIN") {
        return { ok: false, error: "Chỉ Owner/Admin mới Resume", status: 403 };
      }
      if (status !== "WAITING" && status !== "PAUSED") {
        return { ok: false, error: "Resume chỉ từ WAITING hoặc PAUSED" };
      }
      return { ok: true };

    case "RESOLVE_AND_RESUME":
      if (role !== "PRIMARY" && role !== "ADMIN") {
        return { ok: false, error: "Chỉ Owner/Admin mới Resolve", status: 403 };
      }
      if (status !== "BLOCKED") {
        return { ok: false, error: "Resolve chỉ từ BLOCKED" };
      }
      return { ok: true };

    case "SUBMIT_FOR_REVIEW":
      // Owner (PRIMARY) only — even if same user is SYSTEM_ADMIN
      if (!isPrimaryMember(user, project)) {
        return {
          ok: false,
          error:
            role === "ADMIN"
              ? "Admin không Submit thay Owner — dùng FORCE SUBMIT (override)"
              : "Chỉ Owner mới Submit for Review",
          status: 403,
        };
      }
      if (status !== "DOING") {
        return { ok: false, error: "Chỉ Submit từ DOING" };
      }
      {
        const need = submitNeedList(project);
        if (need.length) {
          return { ok: false, error: "Cannot submit: " + need.join("; ") };
        }
      }
      return { ok: true };

    case "FORCE_SUBMIT_FOR_REVIEW":
      if (role !== "ADMIN") {
        return { ok: false, error: "Chỉ Admin FORCE SUBMIT", status: 403 };
      }
      if (status !== "DOING") {
        return { ok: false, error: "Chỉ Force Submit từ DOING" };
      }
      return { ok: true };

    case "APPROVE":
      if (!reviewer && role !== "ADMIN") {
        return { ok: false, error: "Chỉ Reviewer mới Approve", status: 403 };
      }
      if (status !== "IN_REVIEW") {
        return { ok: false, error: "Chỉ Approve khi IN_REVIEW" };
      }
      return { ok: true };

    case "REQUEST_REVISION":
      if (!reviewer && role !== "ADMIN") {
        return { ok: false, error: "Chỉ Reviewer mới Request Revision", status: 403 };
      }
      if (status !== "IN_REVIEW") {
        return { ok: false, error: "Chỉ Request Revision khi IN_REVIEW" };
      }
      return { ok: true };

    case "SET_CURRENT_STEP":
      if (role !== "PRIMARY" && role !== "ADMIN") {
        return { ok: false, error: "Chỉ Owner set Current Step", status: 403 };
      }
      if (status === "DONE" || status === "IN_REVIEW") {
        return { ok: false, error: "Không đổi Current Step khi IN_REVIEW/DONE" };
      }
      return { ok: true };

    case "REQUEST_DEADLINE_CHANGE":
      if (!isPrimaryMember(user, project)) {
        return { ok: false, error: "Chỉ Owner Request Deadline Change", status: 403 };
      }
      return { ok: true };

    case "REQUEST_PRIORITY_CHANGE":
      if (!isPrimaryMember(user, project)) {
        return { ok: false, error: "Chỉ Owner Request Priority Change", status: 403 };
      }
      return { ok: true };

    case "APPROVE_CHANGE_REQUEST":
    case "REJECT_CHANGE_REQUEST":
      if (role !== "ADMIN" && !assigner) {
        return { ok: false, error: "Chỉ Admin/Assigner duyệt change request", status: 403 };
      }
      return { ok: true };

    case "REPORT_ISSUE_TO_OWNER":
      if (role !== "COLLABORATOR" && role !== "PRIMARY" && role !== "ADMIN") {
        return { ok: false, error: "Không có quyền Report Issue", status: 403 };
      }
      return { ok: true };

    case "ACKNOWLEDGE_ISSUE":
      if (role !== "PRIMARY" && role !== "ADMIN") {
        return { ok: false, error: "Chỉ Owner Acknowledge Issue", status: 403 };
      }
      return { ok: true };

    case "ESCALATE_ISSUE_TO_BLOCKER":
      if (role !== "PRIMARY" && role !== "ADMIN") {
        return { ok: false, error: "Chỉ Owner Escalate Issue", status: 403 };
      }
      if (status === "DONE" || status === "IN_REVIEW") {
        return { ok: false, error: "Không Escalate khi IN_REVIEW/DONE" };
      }
      return { ok: true };

    case "COMPLETE":
    case "UPDATE_PROGRESS":
    case "REPORT_ISSUE":
      return {
        ok: false,
        error:
          action === "COMPLETE"
            ? "Không còn tự DONE — dùng Submit for Review"
            : action === "UPDATE_PROGRESS"
              ? "Progress tay không còn là nguồn chính — dùng Work Plan"
              : "Dùng REPORT_ISSUE_TO_OWNER (Collab) hoặc REPORT_BLOCKED (Owner)",
        status: 400,
      };

    default:
      return { ok: false, error: "Action không hỗ trợ: " + action, status: 400 };
  }
}

export function viewerContext(user: User, project: ProjectLike) {
  const role = resolveActorRole(user, project);
  const reviewer = isReviewerUser(user, project);
  const assigner = isAssignerUser(user, project);
  const status = normalizeTaskStatus(project.status);
  const actions: string[] = [];
  const adminOverrideActions: string[] = [];

  const tryPush = (a: string) => {
    if (gateTaskAction(a, user, project).ok) actions.push(a);
  };

  tryPush("ACKNOWLEDGE");
  tryPush("START");
  tryPush("MARK_WAITING");
  tryPush("REPORT_BLOCKED");
  tryPush("PAUSE");
  tryPush("RESUME");
  tryPush("RESOLVE_AND_RESUME");
  tryPush("SUBMIT_FOR_REVIEW");
  tryPush("APPROVE");
  tryPush("REQUEST_REVISION");
  tryPush("SET_CURRENT_STEP");
  tryPush("REQUEST_DEADLINE_CHANGE");
  tryPush("REQUEST_PRIORITY_CHANGE");
  tryPush("APPROVE_CHANGE_REQUEST");
  tryPush("REJECT_CHANGE_REQUEST");
  tryPush("REPORT_ISSUE_TO_OWNER");
  tryPush("ACKNOWLEDGE_ISSUE");
  tryPush("ESCALATE_ISSUE_TO_BLOCKER");

  // Force overrides only when Admin is NOT acting as Owner for that action
  if (role === "ADMIN" && needsAcknowledge(project) && !isPrimaryMember(user, project)) {
    adminOverrideActions.push("FORCE_ACKNOWLEDGE");
  }
  if (role === "ADMIN" && status === "DOING" && !isPrimaryMember(user, project)) {
    adminOverrideActions.push("FORCE_SUBMIT_FOR_REVIEW");
  }

  const progress = workPlanProgress(project);
  const steps = resolveCurrentNextStep(project);

  return {
    role,
    isReviewer: reviewer,
    isAssigner: assigner,
    acknowledged: !needsAcknowledge(project),
    awaitingAcknowledgement: needsAcknowledge(project) && status !== "DONE",
    canEditMain: role === "ADMIN" && status !== "DONE",
    canEditWorkPlan:
      canEditWorkPlanStructure(role) && status !== "IN_REVIEW" && status !== "DONE",
    canManageMembers: canManageTaskMembers(role) && status !== "DONE",
    allowedActions: actions,
    adminOverrideActions,
    submitBlockers: status === "DOING" ? submitNeedList(project) : ([] as string[]),
    quadrant: null as string | null,
    progress,
    currentStep: steps,
    hasPendingChangeRequest: !!project.pendingChangeRequest,
  };
}
