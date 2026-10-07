import { cookies } from "next/headers";

export async function hasStaticAccess() {
  const jar = await cookies();
  return jar.get("hhgo_static")?.value === "1";
}

export async function canViewStatic(authFlag: string | undefined) {
  return authFlag === "1" && (await hasStaticAccess());
}
