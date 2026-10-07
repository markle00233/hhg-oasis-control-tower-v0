import type { Project } from "@prisma/client";
import { allStepsComplete, workPlanFlags } from "@/lib/task-workflow";

export type DeadlineRisk = "ON_TRACK" | "AT_RISK" | "CRITICAL" | "OVERDUE";

export type RiskResult = {
  risk: DeadlineRisk;
  reason: string;
  remainingMinutes: number | null;
  availableMinutes: number | null;
};

function parseDeadline(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T17:00:00");
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // DD/MM or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    const year = m[3] ? Number(m[3]) : new Date().getFullYear();
    const d = new Date(year, month, day, 17, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeEstimates(raw: unknown, len: number): (number | null)[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: len }, (_, i) => {
    const v = arr[i];
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  });
}

/** Remaining work estimate (minutes). Incomplete steps = full step estimate. */
export function remainingWorkMinutes(project: {
  stepFlags?: string | null;
  stepLabels?: unknown;
  stepEstimates?: unknown;
  estimatedDurationMinutes?: number | null;
  currentStepIndex?: number | null;
}): number | null {
  const flags = workPlanFlags(project.stepFlags);
  const labelLen = Array.isArray(project.stepLabels)
    ? project.stepLabels.filter((x) => String(x || "").trim()).length
    : 0;
  const len = Math.max(flags.length, labelLen, 0);
  if (!len) {
    return project.estimatedDurationMinutes != null
      ? Math.max(0, Number(project.estimatedDurationMinutes))
      : null;
  }
  const estimates = normalizeEstimates(project.stepEstimates, len);
  const hasAny = estimates.some((e) => e != null && e > 0);
  if (!hasAny) {
    // Fall back: remaining fraction of task estimate
    if (project.estimatedDurationMinutes == null) return null;
    const done = [...flags.padEnd(len, "0")].filter((c) => c === "1").length;
    const rem = Math.max(0, len - done);
    if (len === 0) return Number(project.estimatedDurationMinutes);
    return Math.round((rem / len) * Number(project.estimatedDurationMinutes));
  }
  let total = 0;
  for (let i = 0; i < len; i++) {
    if (flags[i] === "1") continue;
    total += estimates[i] ?? 0;
  }
  return total;
}

function workingMinutesUntil(deadline: Date, now: Date): number {
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return 0;
  // Approximate: count only 8h/day working windows (08:00–17:00) for risk
  // V1 simple: use calendar minutes * 0.33 (~8/24) as crude working time, min calendar hours
  const calendarMin = ms / 60000;
  return Math.max(0, Math.round(calendarMin * (8 / 24)));
}

export function computeDeadlineRisk(
  project: Pick<
    Project,
    | "status"
    | "deadline"
    | "stepFlags"
    | "stepLabels"
    | "stepEstimates"
    | "estimatedDurationMinutes"
    | "currentStepIndex"
  >,
  now = new Date()
): RiskResult {
  const status = String(project.status || "").toUpperCase();
  if (status === "DONE") {
    return {
      risk: "ON_TRACK",
      reason: "Task đã DONE",
      remainingMinutes: 0,
      availableMinutes: null,
    };
  }

  const deadline = parseDeadline(project.deadline);
  if (!deadline) {
    return {
      risk: "ON_TRACK",
      reason: "Chưa set deadline — không đánh giá risk",
      remainingMinutes: remainingWorkMinutes(project),
      availableMinutes: null,
    };
  }

  if (now.getTime() > deadline.getTime()) {
    return {
      risk: "OVERDUE",
      reason: "Đã quá deadline · Task chưa DONE",
      remainingMinutes: remainingWorkMinutes(project),
      availableMinutes: 0,
    };
  }

  const flags = workPlanFlags(project.stepFlags);
  const labelLen = Array.isArray(project.stepLabels)
    ? project.stepLabels.filter((x) => String(x || "").trim()).length
    : flags.length;
  const len = Math.max(flags.length, labelLen, 1);
  const done = [...flags.padEnd(len, "0")].filter((c) => c === "1").length;
  const remSteps = Math.max(0, len - done);
  const progress = done / len;
  const remaining = remainingWorkMinutes(project);
  const available = workingMinutesUntil(deadline, now);
  const calendarHoursLeft = (deadline.getTime() - now.getTime()) / 3600000;

  // No estimate: use progress vs time elapsed heuristic via deadline proximity
  if (remaining == null) {
    if (calendarHoursLeft <= 24 && remSteps >= 2) {
      return {
        risk: "CRITICAL",
        reason: `${remSteps} Steps còn lại · dưới 24h đến deadline · chưa có estimate`,
        remainingMinutes: null,
        availableMinutes: available,
      };
    }
    if (calendarHoursLeft <= 72 && progress < 0.5 && remSteps > 0) {
      return {
        risk: "AT_RISK",
        reason: `Tiến độ ${Math.round(progress * 100)}% · ${remSteps} Steps còn · ~${Math.round(calendarHoursLeft)}h đến hạn`,
        remainingMinutes: null,
        availableMinutes: available,
      };
    }
    if (status === "BLOCKED" || status === "PAUSED") {
      return {
        risk: "AT_RISK",
        reason: `Task ${status} trong khi còn deadline`,
        remainingMinutes: null,
        availableMinutes: available,
      };
    }
    return {
      risk: "ON_TRACK",
      reason: "Trong hạn · chưa đủ dữ liệu estimate để siết risk",
      remainingMinutes: null,
      availableMinutes: available,
    };
  }

  if (remaining > 0 && available < remaining * 0.5) {
    return {
      risk: "CRITICAL",
      reason: `${remSteps} Steps · ước còn ~${formatMins(remaining)} · chỉ còn ~${formatMins(available)} giờ làm việc`,
      remainingMinutes: remaining,
      availableMinutes: available,
    };
  }
  if (remaining > 0 && available < remaining * 1.1) {
    return {
      risk: "AT_RISK",
      reason: `${remSteps} Steps remaining · estimated ${formatMins(remaining)} · ~${formatMins(available)} working time available`,
      remainingMinutes: remaining,
      availableMinutes: available,
    };
  }
  if (status === "BLOCKED" || status === "PAUSED") {
    return {
      risk: "AT_RISK",
      reason: `Task ${status} · remaining ~${formatMins(remaining)}`,
      remainingMinutes: remaining,
      availableMinutes: available,
    };
  }
  if (allStepsComplete(project.stepFlags)) {
    return {
      risk: "ON_TRACK",
      reason: "Work Plan 100% — sẵn sàng Submit",
      remainingMinutes: 0,
      availableMinutes: available,
    };
  }
  return {
    risk: "ON_TRACK",
    reason: `Đủ thời gian · remaining ~${formatMins(remaining)} / available ~${formatMins(available)}`,
    remainingMinutes: remaining,
    availableMinutes: available,
  };
}

function formatMins(m: number): string {
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
}
