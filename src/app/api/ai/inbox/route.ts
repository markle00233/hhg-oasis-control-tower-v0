import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseTrackingMessage } from "@/lib/ai";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const messages = await prisma.messageInbox.findMany({
    include: { drafts: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth();
  if ("error" in gate) return gate.error;

  const body = await req.json();
  const {
    rawText,
    senderDisplayName = "Lead / Tổ trưởng",
    sourceChannel = "manual",
  } = body;

  if (!rawText?.trim()) {
    return NextResponse.json({ error: "rawText is required" }, { status: 400 });
  }

  const parsed = parseTrackingMessage(rawText);
  const tasks = await prisma.task.findMany({
    select: { id: true, title: true, code: true },
  });

  const message = await prisma.messageInbox.create({
    data: {
      rawText,
      senderDisplayName,
      sourceChannel,
      status: "ANALYZED",
      drafts: {
        create: parsed.map((d) => {
          let duplicateTaskId: string | null = null;
          let duplicateHint = d.duplicateHint;
          if (d.duplicateHint) {
            const parts = d.duplicateHint.split("|").map((p) => p.toLowerCase());
            const hit = tasks.find((t) =>
              parts.some(
                (p) =>
                  t.title.toLowerCase().includes(p) ||
                  (t.code || "").toLowerCase().includes(p)
              )
            );
            if (hit) {
              duplicateTaskId = hit.id;
              duplicateHint = hit.code || hit.title;
            }
          } else {
            const soft = tasks.find(
              (t) =>
                t.title.toLowerCase().includes(d.suggestedTitle.toLowerCase().slice(0, 16)) ||
                d.suggestedTitle.toLowerCase().includes(t.title.toLowerCase().slice(0, 16))
            );
            if (soft) {
              duplicateTaskId = soft.id;
              duplicateHint = soft.code || soft.title;
            }
          }

          return {
            parentGroup: d.parentGroup,
            suggestedTitle: d.suggestedTitle,
            suggestedUnit: d.suggestedUnit,
            suggestedType: d.suggestedType,
            suggestedOwner: d.suggestedOwner,
            confidence: d.confidence,
            reason: d.reason,
            duplicateTaskId,
            duplicateHint,
            reviewStatus: "PENDING",
          };
        }),
      },
    },
    include: { drafts: true },
  });

  return NextResponse.json(message, { status: 201 });
}
