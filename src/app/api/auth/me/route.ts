import { NextResponse } from "next/server";
import { getCurrentUser, toSafeUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      assignments: [],
    });
  }

  return NextResponse.json({
    authenticated: true,
    user: toSafeUser(user),
    // Reserved for P3 UnitAssignment — empty until then.
    assignments: [],
  });
}
