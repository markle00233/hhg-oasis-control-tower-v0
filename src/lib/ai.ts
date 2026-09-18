/** Rule-based AI helpers (V0 — no external LLM required). */

export type ExpenseSuggestion = {
  category: string;
  categoryLabel: string;
  unitName: string | null;
  linkedTaskHint: string | null;
  confidence: number;
  reason: string;
};

export type RevenueSuggestion = {
  type: string;
  unitName: string | null;
  customerGroup: string;
  confidence: number;
  note: string;
};

const CATEGORY_MAP: Record<string, string> = {
  OPERATING: "Vận hành thường xuyên",
  MAINTENANCE: "Sửa chữa / bảo trì",
  IMPROVEMENT: "Cải tạo / nâng cấp",
  ASSET_PURCHASE: "Mua sắm tài sản / thiết bị",
  SHARED: "Chi phí dùng chung",
  UNCLASSIFIED: "Chưa xác định",
};

export function labelForCategory(code: string) {
  return CATEGORY_MAP[code] || CATEGORY_MAP.UNCLASSIFIED;
}

export function codeForCategoryLabel(label: string) {
  const entry = Object.entries(CATEGORY_MAP).find(([, v]) => v === label);
  return entry?.[0] || "UNCLASSIFIED";
}

export function suggestExpense(text: string, unitHint?: string): ExpenseSuggestion {
  const t = (text || "").toLowerCase();
  let category = "UNCLASSIFIED";
  let unitName = unitHint || null;
  let linkedTaskHint: string | null = null;
  let confidence = 58;
  let reason =
    "Nội dung chưa đủ rõ; cần Finance/người quản lý xác nhận.";

  if (t.includes("bếp")) unitName = "Bếp Trung Tâm";
  if (t.includes("hồ bơi")) unitName = "Hồ bơi";
  if (t.includes("pickle") || t.includes("sàn pick")) unitName = "Pickleball";
  if (t.includes("spa")) unitName = "Spa";
  if (t.includes("lòng nướng") || t.includes("lncp")) unitName = "Lòng Nướng";

  if (t.includes("quạt") && t.includes("mua")) {
    category = "ASSET_PURCHASE";
    linkedTaskHint = "Lắp quạt Bếp Trung Tâm";
    confidence = 84;
    reason =
      "Có từ “mua” + thiết bị “quạt” → nghiêng mua sắm thiết bị. Nếu chỉ thay motor thì đổi sang Sửa chữa / bảo trì.";
  } else if (
    t.includes("motor") ||
    t.includes("sửa") ||
    t.includes("thay bóng") ||
    t.includes("bảo trì") ||
    t.includes("thay ")
  ) {
    category = "MAINTENANCE";
    confidence = 91;
    reason = "Nội dung mô tả thay/sửa bộ phận hiện có hơn là mua mới tài sản.";
  } else if (
    t.includes("biển") ||
    t.includes("cải tạo") ||
    t.includes("nâng cấp")
  ) {
    category = "IMPROVEMENT";
    confidence = 76;
    reason =
      "Có dấu hiệu thay đổi/nâng cấp hiện trạng; nếu mục tiêu chủ yếu là truyền thông có thể đổi nhóm.";
  } else if (t.includes("vật tư") || t.includes("vệ sinh")) {
    category = "OPERATING";
    confidence = 88;
    reason = "Vật tư tiêu hao/phục vụ hoạt động thường ngày.";
  }

  return {
    category,
    categoryLabel: labelForCategory(category),
    unitName,
    linkedTaskHint,
    confidence,
    reason,
  };
}

export function suggestRevenue(
  text: string,
  unitHint?: string
): RevenueSuggestion {
  const t = (text || "").toLowerCase();
  let type = "Chưa xác định";
  let customerGroup = "Chưa xác định";
  let confidence = 55;
  const unitName = unitHint || null;

  if (t.includes("combo") || t.includes("tour") || t.includes("trải nghiệm")) {
    type = "Tour / combo trải nghiệm";
  }
  if (t.includes("đoàn") || t.includes("công ty")) {
    customerGroup = "Đoàn thể / công ty";
  }
  if (t.includes("ăn") || t.includes("món")) {
    type =
      type === "Chưa xác định"
        ? "Ăn uống / dịch vụ F&B"
        : type + " + ăn uống";
  }
  if (type !== "Chưa xác định" || customerGroup !== "Chưa xác định") {
    confidence = 82;
  }

  return {
    type,
    unitName,
    customerGroup,
    confidence,
    note: "AI chỉ gợi ý lớp vận hành. Phần chia doanh thu với đối tác phải theo hợp đồng/Finance.",
  };
}

export type AiDraftSuggestion = {
  parentGroup: string | null;
  suggestedTitle: string;
  suggestedUnit: string;
  suggestedType: string;
  suggestedOwner: string | null;
  confidence: number;
  reason: string;
  duplicateHint: string | null;
};

/** Seed drafts matching demo / 03_AI_EXAMPLES when raw text looks like tracking list. */
export const DEMO_AI_DRAFTS: AiDraftSuggestion[] = [
  {
    parentGroup: "Phiếu thoả thuận công việc",
    suggestedTitle: "Ký phiếu thỏa thuận với nhóm Hồ bơi",
    suggestedUnit: "Hồ bơi",
    suggestedType: "Nhân sự / Hành chính",
    suggestedOwner: null,
    confidence: 92,
    reason: "Tách từ nhóm 1; cần xác nhận người phụ trách và hạn.",
    duplicateHint: null,
  },
  {
    parentGroup: "Trung thu",
    suggestedTitle: "Dời đèn trên cây",
    suggestedUnit: "Dùng chung",
    suggestedType: "Sự kiện / Vận hành",
    suggestedOwner: null,
    confidence: 86,
    reason: "Nên nằm dưới nhóm/mini-project Trung thu.",
    duplicateHint: null,
  },
  {
    parentGroup: "Truyền thông",
    suggestedTitle: "Chụp món",
    suggestedUnit: "Lòng Nướng",
    suggestedType: "Nội dung",
    suggestedOwner: null,
    confidence: 68,
    reason: "Phân khu chưa được nêu rõ; AI đoán từ ngữ cảnh F&B.",
    duplicateHint: null,
  },
  {
    parentGroup: null,
    suggestedTitle: "Thu thập chứng từ Spa",
    suggestedUnit: "Spa",
    suggestedType: "Tài chính / Hành chính",
    suggestedOwner: null,
    confidence: 96,
    reason: "Phân khu rõ.",
    duplicateHint: null,
  },
  {
    parentGroup: null,
    suggestedTitle: "Lắp quạt Bếp Trung Tâm",
    suggestedUnit: "Bếp Trung Tâm",
    suggestedType: "Sửa chữa / Hạ tầng",
    suggestedOwner: "Kỹ thuật",
    confidence: 92,
    reason: "Có khả năng liên quan việc thiết bị bếp đang tồn tại; cần kiểm tra trùng.",
    duplicateHint: "Lắp quạt|thiết bị bếp|Duyệt danh sách thiết bị bếp",
  },
  {
    parentGroup: "Nhân sự Mía Ơi",
    suggestedTitle: "Tuyển nhân sự Mía Ơi",
    suggestedUnit: "Mía Ơi",
    suggestedType: "Nhân sự",
    suggestedOwner: null,
    confidence: 94,
    reason: "Tách tuyển và đào tạo thành hai việc.",
    duplicateHint: null,
  },
  {
    parentGroup: "Nhân sự Mía Ơi",
    suggestedTitle: "Đào tạo nhân sự Mía Ơi",
    suggestedUnit: "Mía Ơi",
    suggestedType: "Nhân sự / Đào tạo",
    suggestedOwner: null,
    confidence: 94,
    reason: "Nên liên kết với việc tuyển.",
    duplicateHint: null,
  },
  {
    parentGroup: "Kế hoạch Sale Event",
    suggestedTitle:
      "Chương trình bán tour/combo trải nghiệm cho đoàn thể/công ty",
    suggestedUnit: "Dùng chung",
    suggestedType: "Doanh thu / Kinh doanh",
    suggestedOwner: "Vy",
    confidence: 98,
    reason: "Owner được nhận diện trực tiếp từ nội dung (Vy).",
    duplicateHint: null,
  },
  {
    parentGroup: "Vệ sinh sàn Pickleball",
    suggestedTitle: "Vệ sinh bụi thi công trên sàn Pickleball",
    suggestedUnit: "Pickleball",
    suggestedType: "Vệ sinh / Vận hành",
    suggestedOwner: null,
    confidence: 97,
    reason: "Có thể yêu cầu ảnh Sau để nghiệm thu.",
    duplicateHint: "biển bảng|Pickleball",
  },
  {
    parentGroup: null,
    suggestedTitle: "Triển khai canteen Hồ Bơi Olympic bán món ăn vặt",
    suggestedUnit: "Hồ bơi",
    suggestedType: "Doanh thu / Dự án nhỏ",
    suggestedOwner: null,
    confidence: 96,
    reason: "Có thể là project nhỏ với task con về menu, quầy, nhân sự.",
    duplicateHint: null,
  },
];

export function parseTrackingMessage(rawText: string) {
  // If text looks like the long tracking sample, return curated drafts.
  const lower = (rawText || "").toLowerCase();
  if (
    lower.includes("task tracking") ||
    lower.includes("phiếu thoả") ||
    lower.includes("trung thu") ||
    lower.includes("mía ơi") ||
    DEMO_AI_DRAFTS.some((d) =>
      lower.includes(d.suggestedTitle.toLowerCase().slice(0, 12))
    )
  ) {
    return DEMO_AI_DRAFTS;
  }

  // Generic: split numbered lines / bullets into drafts
  const lines = (rawText || "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const drafts: typeof DEMO_AI_DRAFTS = [];
  let currentParent: string | null = null;

  for (const line of lines) {
    const numbered = line.match(/^\d+[\.\)]\s*(.+)$/);
    const bullet = line.match(/^[-•]\s*(.+)$/);
    if (numbered) {
      currentParent = numbered[1];
      drafts.push({
        parentGroup: null,
        suggestedTitle: numbered[1],
        suggestedUnit: guessUnit(numbered[1]),
        suggestedType: "Công việc",
        suggestedOwner: guessOwner(numbered[1]),
        confidence: 72,
        reason: "Tách từ dòng đánh số trong tin nhắn.",
        duplicateHint: null,
      });
    } else if (bullet && currentParent) {
      drafts.push({
        parentGroup: currentParent,
        suggestedTitle: bullet[1],
        suggestedUnit: guessUnit(bullet[1] + " " + currentParent),
        suggestedType: "Checklist / việc con",
        suggestedOwner: guessOwner(bullet[1]),
        confidence: 70,
        reason: `Việc con thuộc nhóm “${currentParent}”.`,
        duplicateHint: null,
      });
    }
  }

  if (!drafts.length && rawText.trim()) {
    drafts.push({
      parentGroup: null,
      suggestedTitle: rawText.trim().slice(0, 120),
      suggestedUnit: guessUnit(rawText),
      suggestedType: "Công việc",
      suggestedOwner: guessOwner(rawText),
      confidence: 60,
      reason: "Một bản nháp từ toàn bộ nội dung; cần người tách/sửa.",
      duplicateHint: null,
    });
  }

  return drafts;
}

function guessUnit(text: string) {
  const t = text.toLowerCase();
  if (t.includes("spa")) return "Spa";
  if (t.includes("hồ bơi") || t.includes("olympic")) return "Hồ bơi";
  if (t.includes("pickle")) return "Pickleball";
  if (t.includes("lòng") || t.includes("nướng") || t.includes("lncp"))
    return "Lòng Nướng";
  if (t.includes("gym")) return "Gym";
  if (t.includes("bếp")) return "Bếp Trung Tâm";
  if (t.includes("mía")) return "Mía Ơi";
  return "Dùng chung";
}

function guessOwner(text: string) {
  const m = text.match(/\(([A-Za-zÀ-ỹ]+)\)/);
  if (m) return m[1];
  if (/vy/i.test(text)) return "Vy";
  return null;
}
