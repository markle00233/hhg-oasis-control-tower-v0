import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getProjectAccess } from "@/lib/project-access";
import {
  HHG_OASIS_PROMPT_TASK,
  HHG_OASIS_PROMPT_TASK_NAME,
  clampDeadline,
  computeBudgetMinutes,
  fitSubtasksToBudget,
  matrixDays,
  ruleBasedPlan,
  todayYmd,
  ymdAddDays,
  type HhgOasisAgentVars,
  type HhgSubtaskPlan,
} from "@/lib/ai/hhg-oasis-prompt-task";
import type { Prisma } from "@prisma/client";
import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model không trả JSON hợp lệ");
  }
}

function normalizeSubtasks(
  raw: unknown,
  planDate: string,
  taskDeadline: string | null,
  taskName: string
): HhgSubtaskPlan[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 12)
    .map((item, i) => {
      const o = item as Record<string, unknown>;
      let level = Number(o.priorityLevel) || 4;
      if (level < 1 || level > 4) level = 4;
      const title = String(o.title || `Công việc ${i + 1}`).trim().slice(0, 200);
      let deadline = String(o.deadline || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
        deadline = ymdAddDays(planDate, matrixDays(level));
      }
      deadline = clampDeadline(deadline, taskDeadline);
      let minutes = Math.round(Number(o.estimatedMinutes) || 60);
      minutes = Math.max(15, Math.min(480, minutes));
      const howToRaw = o.howToSteps;
      const howToSteps = Array.isArray(howToRaw)
        ? howToRaw.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 8)
        : [];
      const description =
        String(o.description || "").trim().slice(0, 800) ||
        `Thực hiện「${title}」trong Task「${taskName}」.`;
      return {
        title,
        priorityLevel: level as 1 | 2 | 3 | 4,
        deadline,
        estimatedMinutes: minutes,
        rationale: o.rationale ? String(o.rationale).slice(0, 300) : undefined,
        description,
        howToSteps:
          howToSteps.length > 0
            ? howToSteps
            : [
                `Xác định đầu ra của「${title}」.`,
                "Làm lần lượt các bước cần thiết.",
                "Tự kiểm trước khi đánh dấu hoàn thành.",
              ],
      };
    })
    .filter((s) => s.title.length > 0);
}

/** Prefer APP1 mainAI (web search + domain hhgoasispromptask + gpt6.1-sol). */
async function callMainAiPlan(userPayload: string): Promise<string> {
  // Vercel / serverless: no local APP1 Python — skip immediately.
  if (process.env.VERCEL === "1" || process.env.HHG_OASIS_USE_MAINAI === "0") {
    throw new Error("MAINAI_SKIPPED");
  }

  const app1 = path.join(process.cwd(), "c.o-chatbot", "APP1");
  const runner = path.join(app1, "oasis_plan_runner.py");
  const venvPy = path.join(app1, ".venv", "bin", "python3");
  try {
    await fs.access(runner);
  } catch {
    throw new Error("MAINAI_NOT_INSTALLED");
  }

  const python =
    process.env.HHG_OASIS_PYTHON?.trim() ||
    (await fs
      .access(venvPy)
      .then(() => venvPy)
      .catch(() => "python3"));

  const tmp = path.join(
    os.tmpdir(),
    `hhg-oasis-plan-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  );
  await fs.writeFile(tmp, userPayload, "utf8");

  const model = process.env.OPENAI_MODEL?.trim() || "gpt6.1-sol";
  const useWeb = process.env.HHG_OASIS_MAINAI_WEB !== "0";

  try {
    const args = [runner, "--payload-file", tmp, "--model", model];
    if (!useWeb) args.push("--no-web");

    const { stdout, stderr, code } = await new Promise<{
      stdout: string;
      stderr: string;
      code: number | null;
    }>((resolve, reject) => {
      const child = spawn(python, args, {
        cwd: app1,
        env: {
          ...process.env,
          PYTHONPATH: app1,
          PYTHONUNBUFFERED: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("mainAI timeout (>120s)"));
      }, 120_000);
      child.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code });
      });
    });

    if (code !== 0) {
      throw new Error(
        `mainAI exit ${code}: ${(stderr || stdout).trim().slice(0, 400) || "unknown"}`
      );
    }
    const text = stdout.trim();
    if (!text) throw new Error(`mainAI empty stdout: ${stderr.slice(0, 300)}`);
    return text;
  } finally {
    await fs.unlink(tmp).catch(() => undefined);
  }
}

async function callOpenAiPlan(userPayload: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("NO_KEY");

  const model = process.env.OPENAI_MODEL?.trim() || "gpt6.1-sol";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      ...(model.includes("sol") || model.includes("gpt-6")
        ? {}
        : { temperature: 0.3 }),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: HHG_OASIS_PROMPT_TASK },
        { role: "user", content: userPayload },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI trả rỗng");
  return content;
}

async function callLlmPlan(userPayload: string): Promise<{
  text: string;
  source: "mainAI" | "openai";
}> {
  // 1) Prefer APP1 mainAI (web + domain prompt hhgoasispromptask)
  if (process.env.HHG_OASIS_USE_MAINAI !== "0") {
    try {
      const text = await callMainAiPlan(userPayload);
      return { text, source: "mainAI" };
    } catch (e) {
      console.warn(
        "[plan-subtasks] mainAI failed, fallback OpenAI direct:",
        e instanceof Error ? e.message : e
      );
    }
  }
  // 2) Direct OpenAI chat completions
  const text = await callOpenAiPlan(userPayload);
  return { text, source: "openai" };
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAuth();
    if ("error" in gate) return gate.error;

    const body = await req.json().catch(() => ({}));
    const projectId = String(body.projectId || "").trim();
    const apply = body.apply !== false; // default: write to Prisma
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const access = await getProjectAccess(projectId);
    if (!access.ok) return access.error;

    // Staff PRIMARY / COLLABORATOR / Admin (and owner-match via getProjectAccess) may plan.
    if (
      access.role !== "ADMIN" &&
      access.role !== "PRIMARY" &&
      access.role !== "COLLABORATOR"
    ) {
      return NextResponse.json(
        { error: "Chỉ thành viên Task hoặc Admin mới dùng AI lập kế hoạch" },
        { status: 403 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { unit: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Task không tồn tại" }, { status: 404 });
    }

    const planDate = todayYmd();
    const budgetMinutes = computeBudgetMinutes({
      estimatedDurationMinutes: project.estimatedDurationMinutes,
      taskDeadline: project.deadline,
      planDate,
    });
    const prevState =
      project.pendingChangeRequest &&
      typeof project.pendingChangeRequest === "object" &&
      !Array.isArray(project.pendingChangeRequest)
        ? (project.pendingChangeRequest as Record<string, unknown>)
        : {};

    const userPayload = JSON.stringify(
      {
        planDate,
        budgetMinutes,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          expectedResult: project.expectedResult,
          owner: project.owner,
          unitName: project.unit?.name ?? null,
          deadline: project.deadline,
          important: project.important,
          urgent: project.urgent,
          status: project.status,
          estimatedDurationMinutes: project.estimatedDurationMinutes,
          existingStepLabels: project.stepLabels,
        },
        previousAgentVars: prevState.aiAgentVars ?? null,
        instruction:
          "Đọc big title Task, chia hạng mục theo ma trận P1–P4, mỗi hạng mục có description + howToSteps chi tiết, tổng phút ≤ budgetMinutes, deadline không vượt Task.",
      },
      null,
      2
    );

    let summary: string;
    let subtasks: HhgSubtaskPlan[];
    let agentVars: HhgOasisAgentVars;
    let source: "mainAI" | "openai" | "rule_based" = "rule_based";
    let llmError: string | null = null;

    try {
      const llm = await callLlmPlan(userPayload);
      const parsed = extractJsonObject(llm.text) as Record<string, unknown>;
      subtasks = normalizeSubtasks(
        parsed.subtasks,
        planDate,
        project.deadline,
        project.name
      );
      if (subtasks.length === 0) throw new Error("Không có subtasks");
      subtasks = fitSubtasksToBudget(subtasks, budgetMinutes);
      summary = String(parsed.summary || `Kế hoạch AI cho ${project.name}`).slice(0, 500);
      const av = (parsed.agentVars as Record<string, unknown>) || {};
      agentVars = {
        promptName: HHG_OASIS_PROMPT_TASK_NAME,
        projectId: project.id,
        taskName: project.name,
        owner: project.owner,
        unitName: project.unit?.name ?? null,
        planDate,
        taskImportant: project.important,
        taskUrgent: project.urgent,
        budgetMinutes,
        summary,
        subtasks,
        agentNotes: String(av.agentNotes || `${llm.source} plan`).slice(0, 2000),
        updatedAt: new Date().toISOString(),
      };
      source = llm.source;
    } catch (e) {
      llmError = e instanceof Error ? e.message.slice(0, 300) : "LLM failed";
      const fallback = ruleBasedPlan({
        projectId: project.id,
        taskName: project.name,
        description: project.description,
        expectedResult: project.expectedResult,
        owner: project.owner,
        unitName: project.unit?.name ?? null,
        taskDeadline: project.deadline,
        important: project.important,
        urgent: project.urgent,
        planDate,
        estimatedDurationMinutes: project.estimatedDurationMinutes,
      });
      summary = fallback.summary;
      subtasks = fallback.subtasks;
      agentVars = fallback.agentVars;
      source = "rule_based";
    }

    if (!apply) {
      return NextResponse.json({
        ok: true,
        promptName: HHG_OASIS_PROMPT_TASK_NAME,
        source,
        model: process.env.OPENAI_MODEL?.trim() || "gpt6.1-sol",
        llmError,
        summary,
        budgetMinutes,
        subtasks,
        agentVars,
      });
    }

    const stepLabels = subtasks.map((s) => s.title);
    const stepDeadlines = subtasks.map((s) => s.deadline);
    const stepEstimates = subtasks.map((s) => s.estimatedMinutes);
    const stepFlags = "0".repeat(Math.max(4, stepLabels.length)).slice(0, stepLabels.length);
    const totalMinutes = stepEstimates.reduce((a, b) => a + b, 0);
    const earliestDeadline = [...stepDeadlines].sort()[0] || project.deadline;

    // Keep Task estimate as ceiling when Admin đã set; otherwise use planned total.
    const nextEstimate =
      project.estimatedDurationMinutes && project.estimatedDurationMinutes > 0
        ? Math.min(project.estimatedDurationMinutes, Math.max(totalMinutes, 30))
        : totalMinutes || null;

    // Strip non-JSON-safe / Prisma cast leftovers from prev pending blob
    const safePrev: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(prevState)) {
      if (v === undefined) continue;
      try {
        JSON.parse(JSON.stringify(v));
        safePrev[k] = v;
      } catch {
        /* skip non-serializable */
      }
    }

    const nextPending = {
      ...safePrev,
      aiAgentVars: JSON.parse(JSON.stringify(agentVars)),
      stepDetails: JSON.parse(JSON.stringify(subtasks)),
      aiPlanSource: source,
      aiPlanAt: new Date().toISOString(),
      budgetMinutes,
    };

    const saved = await prisma.project.update({
      where: { id: projectId },
      data: {
        stepLabels: stepLabels as unknown as Prisma.InputJsonValue,
        stepDeadlines: stepDeadlines as unknown as Prisma.InputJsonValue,
        stepEstimates: stepEstimates as unknown as Prisma.InputJsonValue,
        stepFlags,
        estimatedDurationMinutes: nextEstimate,
        deadline: project.deadline || earliestDeadline || null,
        pendingChangeRequest: nextPending as unknown as Prisma.InputJsonValue,
        events: {
          create: {
            action: "AI_PLAN_SUBTASKS",
            detail: `${HHG_OASIS_PROMPT_TASK_NAME} · ${source} · ${subtasks.length} hạng mục · ≤${budgetMinutes}p`,
            actorUserId: gate.user.id,
            newValue: summary.slice(0, 500),
          },
        },
      },
      include: {
        unit: true,
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                systemRole: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      promptName: HHG_OASIS_PROMPT_TASK_NAME,
      source,
      model: process.env.OPENAI_MODEL?.trim() || "gpt6.1-sol",
      llmError,
      summary,
      budgetMinutes,
      subtasks,
      agentVars,
      project: saved,
    });
  } catch (e) {
    console.error("[plan-subtasks] fatal:", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message.slice(0, 400) : "AI plan failed",
      },
      { status: 500 }
    );
  }
}
