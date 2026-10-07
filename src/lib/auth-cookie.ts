/**
 * 쿠키 이름만 담는다. 미들웨어는 Edge 런타임이라 `node:crypto` 를 import 하는 모듈을
 * 끌고 들어오면 번들이 실패한다. 그래서 상수를 auth.ts 에서 떼어 놓는다.
 * 서명·검증 같은 권한 **판단**은 여전히 auth.ts 한 곳에만 있다. (ADR-0011)
 */
export const SESSION_COOKIE = "qc_admin";
