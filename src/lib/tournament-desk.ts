import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { canAccessDeskZone, isSystemAdmin, requireAuth } from "@/lib/auth";
import { isZoneDeskAdmin } from "@/lib/desk-zones";

/** Admin, quầy Pickleball, hoặc admin khu Pickleball. */
export async function requireTournamentDesk(): Promise<
  { user: User } | { error: NextResponse }
> {
  const auth = await requireAuth();
  if ("error" in auth) return auth;
  const user = auth.user;
  if (
    isSystemAdmin(user) ||
    canAccessDeskZone(user, "PICKLEBALL") ||
    isZoneDeskAdmin(user, "PICKLEBALL")
  ) {
    return auth;
  }
  return {
    error: NextResponse.json(
      { error: "Chỉ Admin hoặc quầy Pickleball quản lý giải đấu." },
      { status: 403 }
    ),
  };
}

export function tournamentCheckInUrl(token: string) {
  const configured = (
    process.env.NEXT_PUBLIC_CUSTOMER_APP_URL ||
    process.env.CUSTOMER_APP_URL ||
    ""
  ).replace(/\/$/, "");
  const base =
    configured ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3001"
      : "https://huyhoanggiaoasis.vercel.app");
  return `${base}/t/${encodeURIComponent(token)}`;
}

export function tournamentDbError(err: unknown, fallback: string) {
  const msg = err instanceof Error ? err.message : "";
  if (/app_tournament/i.test(msg) || /does not exist/i.test(msg)) {
    return NextResponse.json(
      { error: "Bảng giải đấu chưa có trên database." },
      { status: 503 }
    );
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
