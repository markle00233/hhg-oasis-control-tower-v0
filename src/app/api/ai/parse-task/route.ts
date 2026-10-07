import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

const UNITS = [
  "Lòng Nướng",
  "Spa",
  "Hồ bơi",
  "Gym",
  "Pickleball",
  "Bếp Trung Tâm",
  "Mía Ơi",
  "Dùng chung",
];

type ParsedTask = {
  name: string;
  objective: string;
  brief: string;
  unitName: string | null;
  category: string | null;
  owner: string | null;
  important: boolean;
  urgent: boolean;
  estimatedDurationMinutes: number | null;
  deadline: string | null;
  requiresCostApproval: boolean;
  costNote: string | null;
  collaboratorHints: string[];
};

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

function ymd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d
    .toString()
    .padStart(2, "0")}`;
}

/** Parse VN spoken dates: "ngày 23 tháng 9", "23/9", "23-09-2026". */
function extractDeadline(text: string): string | null {
  const now = new Date();
  const cy = now.getUTCFullYear();

  const m1 = text.match(
    /ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})(?:\s*năm\s*(\d{4}|\d{2}))?/i
  );
  if (m1) {
    const d = Number(m1[1]);
    const mo = Number(m1[2]);
    let y = m1[3] ? Number(m1[3]) : cy;
    if (y < 100) y += 2000;
    return ymd(y, mo, d);
  }

  const m2 = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})/);
  if (m2) {
    const d = Number(m2[1]);
    const mo = Number(m2[2]);
    let y = Number(m2[3]);
    if (y < 100) y += 2000;
    return ymd(y, mo, d);
  }

  const m3 = text.match(/(\d{1,2})[\/\-](\d{1,2})(?![\/\-]\d)/);
  if (m3) {
    const d = Number(m3[1]);
    const mo = Number(m3[2]);
    return ymd(cy, mo, d);
  }

  if (/hôm nay|hom nay/i.test(text)) {
    return ymd(cy, now.getUTCMonth() + 1, now.getUTCDate());
  }
  if (/ngày mai|ngay mai/i.test(text)) {
    const t = new Date(now.getTime() + 86400000);
    return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  return null;
}

function extractPriority(text: string): { important: boolean; urgent: boolean } {
  const lower = text.toLowerCase();
  const important =
    /quan\s*trọng|quan trọng|important|ưu tiên cao|uu tien cao|critical|then chốt|then chot/.test(
      lower
    );
  const urgent =
    /khẩn\s*cấp|khan cap|cần\s*thiết|can thiet|gấp|gap|urgent|asap|ngay lập tức|ngay lap tuc|hôm nay|hom nay|deadline gấp/.test(
      lower
    ) ||
    /vừa\s+quan\s*trọng\s+.*\s+cần\s*thiết|vừa\s+quan\s*trọng\s+mà\s+vừa\s+cần\s*thiết|quan\s*trọng\s+mà\s+.*cần\s*thiết/.test(
      lower
    );

  // "vừa A vừa B" with cả quan trọng + (cần thiết|khẩn cấp|gấp)
  const both =
    /vừa\s+[^.]{0,40}quan\s*trọng[^.]{0,40}vừa\s+[^.]{0,40}(cần\s*thiết|khẩn\s*cấp|gấp)/i.test(
      text
    ) ||
    /vừa\s+quan\s*trọng\s+mà\s+vừa\s+cần\s*thiết/i.test(text);

  return {
    important: important || both,
    urgent: urgent || both,
  };
}

function ruleBasedParse(scripts: string[]): ParsedTask {
  const joined = scripts.join("\n").trim();
  const lower = joined.toLowerCase();
  const unit =
    UNITS.find((u) => lower.includes(u.toLowerCase())) ||
    (lower.includes("pool") || lower.includes("hồ") || lower.includes("ho boi")
      ? "Hồ bơi"
      : lower.includes("spa")
        ? "Spa"
        : null);
  const cost =
    /chi phí|ngân sách|mua|thanh toán|duyệt tiền|cost|budget|vnd|triệu|axít|axit|hóa chất|hoa chat/.test(
      lower
    );
  const firstLine =
    joined.split(/\n/).map((s) => s.trim()).find(Boolean) || "Task mới";
  const pri = extractPriority(joined);
  const deadline = extractDeadline(joined);

  return {
    name: firstLine.slice(0, 80),
    objective: joined.slice(0, 400),
    brief: scripts.length > 1 ? scripts.slice(1).join("\n\n").slice(0, 800) : "",
    unitName: unit,
    category: null,
    owner: null,
    important: pri.important,
    urgent: pri.urgent,
    estimatedDurationMinutes: null,
    deadline,
    requiresCostApproval: cost,
    costNote: cost
      ? "Script có yếu tố chi phí — staff nên gửi đề xuất chi phí để Admin duyệt."
      : null,
    collaboratorHints: [],
  };
}

/** Heuristic wins when model misses VN spoken cues. */
function mergeParsed(model: ParsedTask, rules: ParsedTask): ParsedTask {
  return {
    ...model,
    unitName: model.unitName || rules.unitName,
    important: rules.important || model.important,
    urgent: rules.urgent || model.urgent,
    deadline: rules.deadline || model.deadline,
    requiresCostApproval: rules.requiresCostApproval || model.requiresCostApproval,
    costNote: model.costNote || rules.costNote,
    name: model.name?.trim() ? model.name : rules.name,
    objective: model.objective?.trim() ? model.objective : rules.objective,
  };
}

async function callOpenAi(scripts: string[]): Promise<ParsedTask> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY_MISSING");

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
  const today = new Date().toISOString().slice(0, 10);
  const system = `Bạn là trợ lý HHG Oasis. Từ các voice/manual script tiếng Việt (có thể lỗi STT), điền form giao Task.
Trả JSON thuần (không markdown):
{
  "name": string,
  "objective": string,
  "brief": string,
  "unitName": one of ${JSON.stringify(UNITS)} or null,
  "category": string|null,
  "owner": string|null,
  "important": boolean,
  "urgent": boolean,
  "estimatedDurationMinutes": number|null,
  "deadline": "YYYY-MM-DD"|null,
  "requiresCostApproval": boolean,
  "costNote": string|null,
  "collaboratorHints": string[]
}
Quy tắc bắt buộc:
- Hôm nay (UTC) = ${today}.
- Nếu nói "ngày D tháng M" / "ngày D tháng M năm Y" → deadline = YYYY-MM-DD (thiếu năm thì dùng năm hiện tại). VD: "ngày 23 tháng 9" → ${today.slice(0, 4)}-09-23.
- "quan trọng" → important=true.
- "khẩn cấp" / "cần thiết" / "gấp" → urgent=true.
- "vừa quan trọng vừa cần thiết" / "vừa quan trọng mà vừa cần thiết" → important=true VÀ urgent=true.
- Chi phí / mua / hóa chất / axit cần duyệt tiền → requiresCostApproval=true.
- Hồ bơi / xây hồ → unitName="Hồ bơi".`;

  const user = scripts.map((s, i) => `### Script ${i + 1}\n${s}`).join("\n\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      // gpt-6.1-sol only allows default temperature (1); omit for compatibility.
      ...(model.includes("sol") || model.includes("gpt-6")
        ? {}
        : { temperature: 0.1 }),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OPENAI_${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content || "";
  const raw = extractJsonObject(content) as Record<string, unknown>;
  const base = ruleBasedParse(scripts);
  const unitRaw = raw.unitName ? String(raw.unitName) : null;
  const unitName =
    unitRaw && UNITS.some((u) => u.toLowerCase() === unitRaw.toLowerCase())
      ? UNITS.find((u) => u.toLowerCase() === unitRaw.toLowerCase())!
      : base.unitName;

  return {
    name: String(raw.name || base.name).slice(0, 120),
    objective: String(raw.objective || base.objective).slice(0, 800),
    brief: String(raw.brief || base.brief).slice(0, 1200),
    unitName,
    category: raw.category ? String(raw.category).slice(0, 80) : null,
    owner: raw.owner ? String(raw.owner).slice(0, 80) : null,
    important: Boolean(raw.important ?? base.important),
    urgent: Boolean(raw.urgent ?? base.urgent),
    estimatedDurationMinutes:
      typeof raw.estimatedDurationMinutes === "number"
        ? Math.max(15, Math.min(480, Math.round(raw.estimatedDurationMinutes)))
        : null,
    deadline:
      typeof raw.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.deadline)
        ? raw.deadline
        : null,
    requiresCostApproval: Boolean(
      raw.requiresCostApproval ?? base.requiresCostApproval
    ),
    costNote: raw.costNote
      ? String(raw.costNote).slice(0, 300)
      : base.costNote,
    collaboratorHints: Array.isArray(raw.collaboratorHints)
      ? raw.collaboratorHints.map((x) => String(x)).slice(0, 8)
      : [],
  };
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  try {
    const body = await req.json().catch(() => ({}));
    const scriptsRaw = body.scripts;
    const scripts = Array.isArray(scriptsRaw)
      ? scriptsRaw.map((s) => String(s || "").trim()).filter(Boolean)
      : [];
    if (scripts.length === 0) {
      return NextResponse.json(
        { error: "Cần ít nhất 1 voice/manual script." },
        { status: 400 }
      );
    }

    const rules = ruleBasedParse(scripts);
    let parsed: ParsedTask = rules;
    let source: "openai" | "rule_based" = "rule_based";
    try {
      const modelParsed = await callOpenAi(scripts);
      parsed = mergeParsed(modelParsed, rules);
      source = "openai";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!(msg.includes("OPENAI_API_KEY_MISSING") || msg.startsWith("OPENAI_"))) {
        console.error("[parse-task] openai error, using rules:", msg);
      }
      parsed = rules;
      source = "rule_based";
    }

    return NextResponse.json({
      ok: true,
      source,
      hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
      task: parsed,
      scriptsCount: scripts.length,
    });
  } catch (e) {
    console.error("[parse-task]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Parse failed" },
      { status: 500 }
    );
  }
}
