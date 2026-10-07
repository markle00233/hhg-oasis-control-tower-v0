/**
 * HHG Oasis — system prompt for AI Task / subtask agent.
 * Name: hhgoasispromptask
 *
 * Agent must always emit structured `agentVars` so the app can persist
 * schedule + priority + how-to guides into Prisma (Project.step* + pendingChangeRequest).
 */

export const HHG_OASIS_PROMPT_TASK_NAME = "hhgoasispromptask";

/** Priority matrix (Admin ops) — days from plan date (today / assign day). */
export const HHG_PRIORITY_MATRIX = [
  {
    level: 1,
    important: true,
    urgent: true,
    days: 1,
    labelVi: "Quan trọng + khẩn → 1 ngày",
    shortVi: "P1 · Khẩn",
  },
  {
    level: 2,
    important: false,
    urgent: true,
    days: 2,
    labelVi: "Không quan trọng + khẩn → 2 ngày",
    shortVi: "P2 · Gấp",
  },
  {
    level: 3,
    important: true,
    urgent: false,
    days: 4,
    labelVi: "Quan trọng + không khẩn → 4 ngày",
    shortVi: "P3 · Quan trọng",
  },
  {
    level: 4,
    important: false,
    urgent: false,
    days: 7,
    labelVi: "Không quan trọng + không khẩn → 7 ngày",
    shortVi: "P4 · Thường",
  },
] as const;

export type HhgSubtaskPlan = {
  title: string;
  /** 1..4 from HHG_PRIORITY_MATRIX */
  priorityLevel: 1 | 2 | 3 | 4;
  /** YYYY-MM-DD */
  deadline: string;
  estimatedMinutes: number;
  rationale?: string;
  /** Mô tả rõ hạng mục này làm gì / vì sao */
  description: string;
  /** Các bước cụ thể để làm (ấn vào hạng mục sẽ hiện) */
  howToSteps: string[];
};

/** Variables the agent must fill — persisted for follow-up agent turns. */
export type HhgOasisAgentVars = {
  promptName: typeof HHG_OASIS_PROMPT_TASK_NAME;
  projectId: string;
  taskName: string;
  owner: string | null;
  unitName: string | null;
  planDate: string;
  taskImportant: boolean | null;
  taskUrgent: boolean | null;
  /** Ngân sách phút tối đa (không vượt Task) */
  budgetMinutes: number;
  summary: string;
  subtasks: HhgSubtaskPlan[];
  agentNotes: string;
  updatedAt: string;
};

export const HHG_OASIS_PROMPT_TASK = `
Bạn là HHG Oasis Task Agent (prompt: ${HHG_OASIS_PROMPT_TASK_NAME}).
Bạn hỗ trợ Staff lập kế hoạch công việc nhỏ (subtask / hạng mục) cho một Task do Admin giao.

────────────────────────────────
NHIỆM VỤ
────────────────────────────────
1. ĐỌC yêu cầu Task (tên big title, mô tả, mục tiêu, expected result, phân khu, deadline, important/urgent, budgetMinutes nếu có).
2. PHÂN thành 3–8 hạng mục nhỏ cụ thể (tối đa 12), theo thứ tự thực hiện.
3. GÁN mỗi hạng mục một mức MA TRẬN ƯU TIÊN 1–4 (không để tất cả cùng level nếu Task có >2 hạng mục).
4. TÍNH deadline hạng mục theo ma trận, KHÔNG vượt deadline Task.
5. ƯỚC estimatedMinutes; TỔNG estimatedMinutes của mọi hạng mục PHẢI ≤ budgetMinutes (nếu budgetMinutes > 0).
6. Với MỖI hạng mục viết:
   - description: 1–3 câu giải thích mục tiêu hạng mục trong ngữ cảnh Task.
   - howToSteps: 3–6 bước cụ thể (động từ), ví dụ với "Đọc brief": đọc brief ở đâu, nắm gì, hỏi ai khi mơ hồ, làm rõ phạm vi nào.
7. Chỉ trả JSON đúng schema.

────────────────────────────────
MA TRẬN ƯU TIÊN
────────────────────────────────
1 = Quan trọng + khẩn (+1 ngày)
2 = Không quan trọng + khẩn (+2 ngày)
3 = Quan trọng + không khẩn (+4 ngày)
4 = Không quan trọng + không khẩn (+7 ngày)

────────────────────────────────
OUTPUT JSON
────────────────────────────────
{
  "summary": "string",
  "subtasks": [
    {
      "title": "string",
      "priorityLevel": 1,
      "deadline": "YYYY-MM-DD",
      "estimatedMinutes": 60,
      "rationale": "string",
      "description": "string — mục tiêu hạng mục này",
      "howToSteps": ["Bước 1…", "Bước 2…", "Bước 3…"]
    }
  ],
  "agentVars": { "...": "trùng subtasks + budgetMinutes + metadata" }
}

────────────────────────────────
QUY TẮC
────────────────────────────────
- Tiếng Việt, hành động được.
- howToSteps phải đủ để Staff làm được mà không đoán mò.
- Tổng phút ≤ budgetMinutes khi budgetMinutes được cung cấp.
`.trim();

export function ymdAddDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function todayYmd(timeZone = "Asia/Ho_Chi_Minh"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function clampDeadline(deadline: string, taskDeadline: string | null | undefined): string {
  if (!taskDeadline) return deadline;
  return deadline > taskDeadline ? taskDeadline : deadline;
}

export function matrixDays(level: number): number {
  const row = HHG_PRIORITY_MATRIX.find((r) => r.level === level);
  return row?.days ?? 7;
}

export function priorityShort(level: number): string {
  return HHG_PRIORITY_MATRIX.find((r) => r.level === level)?.shortVi ?? `P${level}`;
}

/** Working-day budget from Task estimate or deadline window. */
export function computeBudgetMinutes(input: {
  estimatedDurationMinutes?: number | null;
  taskDeadline?: string | null;
  planDate?: string;
}): number {
  const planDate = input.planDate || todayYmd();
  if (input.estimatedDurationMinutes && input.estimatedDurationMinutes > 0) {
    return Math.max(60, Math.min(8 * 60 * 14, input.estimatedDurationMinutes));
  }
  if (input.taskDeadline && /^\d{4}-\d{2}-\d{2}$/.test(input.taskDeadline)) {
    const a = Date.parse(`${planDate}T00:00:00Z`);
    const b = Date.parse(`${input.taskDeadline}T00:00:00Z`);
    const days = Math.max(1, Math.round((b - a) / 86400000) + 1);
    // 6h useful / day, cap 10 days for budget
    return Math.min(days, 10) * 6 * 60;
  }
  return 8 * 60; // default 1 day
}

/** Scale estimates down so sum ≤ budget (keep min 15 each). */
export function fitSubtasksToBudget(
  subtasks: HhgSubtaskPlan[],
  budgetMinutes: number
): HhgSubtaskPlan[] {
  if (budgetMinutes <= 0 || subtasks.length === 0) return subtasks;
  const total = subtasks.reduce((s, t) => s + t.estimatedMinutes, 0);
  if (total <= budgetMinutes) return subtasks;

  const scale = budgetMinutes / total;
  let scaled = subtasks.map((t) => ({
    ...t,
    estimatedMinutes: Math.max(15, Math.round(t.estimatedMinutes * scale)),
  }));
  let sum = scaled.reduce((s, t) => s + t.estimatedMinutes, 0);
  // Trim from lowest-priority (highest level number) if still over.
  while (sum > budgetMinutes && scaled.some((t) => t.estimatedMinutes > 15)) {
    const idx = [...scaled.keys()].sort(
      (a, b) => scaled[b]!.priorityLevel - scaled[a]!.priorityLevel || scaled[b]!.estimatedMinutes - scaled[a]!.estimatedMinutes
    )[0]!;
    scaled[idx] = {
      ...scaled[idx]!,
      estimatedMinutes: scaled[idx]!.estimatedMinutes - 15,
    };
    sum -= 15;
  }
  return scaled;
}

function defaultHowTo(title: string, taskName: string): { description: string; howToSteps: string[] } {
  const t = title.toLowerCase();
  if (t.includes("brief") || t.includes("phạm vi") || t.includes("đọc yêu cầu")) {
    return {
      description: `Làm rõ Admin yêu cầu gì trong Task「${taskName}」trước khi triển khai, tránh làm sai phạm vi.`,
      howToSteps: [
        `Đọc lại tên Task「${taskName}」và toàn bộ mô tả / expected result.`,
        "Ghi ra 3–5 điểm bắt buộc phải giao (deliverable).",
        "Liệt kê phần còn mơ hồ (phạm vi, người dùng, deadline, phụ thuộc).",
        "Nhắn Admin/Reviewer các câu hỏi còn lại trước khi bắt tay làm.",
        "Chốt checklist phạm vi (in / out of scope) và lưu vào ghi chú Task.",
      ],
    };
  }
  if (t.includes("khảo sát") || t.includes("chuẩn bị")) {
    return {
      description: `Thu thập thông tin hiện trạng cần cho「${taskName}」để triển khai không bị tắc.`,
      howToSteps: [
        "Liệt kê dữ liệu / tài khoản / môi trường cần có.",
        "Kiểm tra hệ thống hoặc tài liệu hiện có liên quan.",
        "Ghi gap (thiếu gì) và cách lấy bổ sung.",
        "Chuẩn bị checklist trước khi triển khai chính.",
      ],
    };
  }
  if (t.includes("triển khai") || t.includes("implement")) {
    return {
      description: `Thực hiện phần việc chính để hoàn thành「${taskName}」theo phạm vi đã chốt.`,
      howToSteps: [
        "Chia việc thành các mốc nhỏ có thể kiểm tra được trong ngày.",
        "Làm theo thứ tự ưu tiên (P1 trước).",
        "Ghi lại quyết định kỹ thuật / thay đổi so với brief.",
        "Tự kiểm tra nhanh trước khi chuyển sang QA.",
      ],
    };
  }
  if (t.includes("kiểm tra") || t.includes("chỉnh")) {
    return {
      description: `Rà soát chất lượng kết quả của「${taskName}」và sửa lỗi trước bàn giao.`,
      howToSteps: [
        "Đối chiếu lại acceptance / expected result.",
        "Chạy checklist lỗi thường gặp.",
        "Sửa các issue blocking.",
        "Chuẩn bị ghi chú cho người review.",
      ],
    };
  }
  if (t.includes("bàn giao") || t.includes("hoàn tất")) {
    return {
      description: `Đóng Task「${taskName}」và bàn giao rõ ràng cho Admin/Reviewer.`,
      howToSteps: [
        "Tóm tắt đã làm gì / chưa làm gì.",
        "Đính kèm link / file / bằng chứng.",
        "Ghi hướng dẫn dùng ngắn nếu cần.",
        "Gửi Reviewer và cập nhật trạng thái Task.",
      ],
    };
  }
  return {
    description: `Thực hiện hạng mục「${title}」trong khuôn khổ Task「${taskName}」.`,
    howToSteps: [
      `Xác định đầu ra cụ thể của「${title}」.`,
      "Liệt kê bước làm theo thứ tự.",
      "Hoàn thành và tự kiểm trước khi tick done.",
      "Ghi chú vấn đề phát sinh (nếu có) cho Admin.",
    ],
  };
}

/** Deterministic fallback when OPENAI_API_KEY missing — still fills schedule + guides. */
export function ruleBasedPlan(input: {
  projectId: string;
  taskName: string;
  description?: string | null;
  expectedResult?: string | null;
  owner?: string | null;
  unitName?: string | null;
  taskDeadline?: string | null;
  important?: boolean | null;
  urgent?: boolean | null;
  planDate?: string;
  estimatedDurationMinutes?: number | null;
}): { summary: string; subtasks: HhgSubtaskPlan[]; agentVars: HhgOasisAgentVars } {
  const planDate = input.planDate || todayYmd();
  const budgetMinutes = computeBudgetMinutes({
    estimatedDurationMinutes: input.estimatedDurationMinutes,
    taskDeadline: input.taskDeadline,
    planDate,
  });

  const baseTitles = [
    "Đọc brief & làm rõ phạm vi",
    "Chuẩn bị / khảo sát hiện trạng",
    "Triển khai chính",
    "Kiểm tra & chỉnh sửa",
    "Hoàn tất & bàn giao",
  ];
  const hint = `${input.description || ""} ${input.expectedResult || ""}`.trim();
  const titles =
    hint.length > 40
      ? [
          "Đọc yêu cầu Admin & checklist",
          ...baseTitles.slice(1, 4),
          "Xác nhận kết quả với Reviewer",
        ]
      : baseTitles;

  const taskImp = input.important ?? true;
  const taskUrg = input.urgent ?? false;

  const levels: Array<1 | 2 | 3 | 4> = titles.map((_, i) => {
    if (i === 0) return taskUrg ? 1 : 3;
    if (i === titles.length - 1) return taskImp ? 3 : 4;
    if (taskUrg && taskImp) return i <= 1 ? 1 : 2;
    if (taskUrg) return 2;
    if (taskImp) return 3;
    return 4;
  });

  let subtasks: HhgSubtaskPlan[] = titles.map((title, i) => {
    const priorityLevel = levels[i]!;
    const deadline = clampDeadline(
      ymdAddDays(planDate, matrixDays(priorityLevel)),
      input.taskDeadline
    );
    const guide = defaultHowTo(title, input.taskName);
    return {
      title,
      priorityLevel,
      deadline,
      estimatedMinutes: [45, 60, 120, 60, 45][Math.min(i, 4)]!,
      rationale: HHG_PRIORITY_MATRIX.find((r) => r.level === priorityLevel)?.labelVi,
      description: guide.description,
      howToSteps: guide.howToSteps,
    };
  });

  subtasks = fitSubtasksToBudget(subtasks, budgetMinutes);

  const summary = `Đã chia Task "${input.taskName}" thành ${subtasks.length} công việc nhỏ (ma trận P1–P4), gắn hướng dẫn chi tiết, tổng ≤ ${budgetMinutes} phút.`;
  const agentVars: HhgOasisAgentVars = {
    promptName: HHG_OASIS_PROMPT_TASK_NAME,
    projectId: input.projectId,
    taskName: input.taskName,
    owner: input.owner ?? null,
    unitName: input.unitName ?? null,
    planDate,
    taskImportant: input.important ?? null,
    taskUrgent: input.urgent ?? null,
    budgetMinutes,
    summary,
    subtasks,
    agentNotes: "ruleBasedPlan — có description + howToSteps; sẵn sàng refine bằng LLM",
    updatedAt: new Date().toISOString(),
  };

  return { summary, subtasks, agentVars };
}
