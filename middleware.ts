import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-cookie";

/**
 * 관리자 화면 진입을 막는 1차 방어. 쿠키 **존재**만 본다.
 * 미들웨어는 Edge 런타임이라 서명 검증(node:crypto)을 할 수 없다.
 * 실제 권한 판단은 각 API Route 와 페이지에서 isAdmin() 으로 다시 한다.
 * (.claude/rules/admin.md: 레이아웃 검사에 의존하지 않는다)
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin/login") return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*"],
};
