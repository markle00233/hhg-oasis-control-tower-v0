import { NextRequest, NextResponse } from "next/server";

/** When deployed as adminAllplace, only desk + APIs are exposed. */
export function middleware(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_APP_SURFACE !== "adminAllplace") {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  if (
    pathname === "/desk" ||
    pathname.startsWith("/desk/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/miaoi/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/desk";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
