import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, readSessionFromToken } from "@/lib/adminSession";
import { isDemoMode } from "@/lib/demoMode";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/admin/login";

  if (isDemoMode()) {
    return isLogin
      ? NextResponse.redirect(new URL("/admin", request.url))
      : NextResponse.next();
  }

  const session = await readSessionFromToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);

  if (!isLogin && !session) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  if (isLogin && session) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
