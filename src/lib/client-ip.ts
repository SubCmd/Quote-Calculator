/**
 * 요청자 IP. 로그인 시도 제한의 집계 기준이다. (ADR-0020, ADR-0024)
 *
 * Next.js 15 의 Route Handler 는 소켓의 원격 주소를 주지 않는다. 헤더가 전부다.
 * 헤더는 기본적으로 **클라이언트가 보낸 값**이므로 아무 헤더나 믿으면 제한이 무력화된다.
 *
 * 이 서비스는 Cloudflare Tunnel 뒤에서만 공개된다. Cloudflare 는 `CF-Connecting-IP` 를
 * 자기가 본 접속 주소로 **항상 덮어쓴다.** 반면 `x-forwarded-for` 는 클라이언트가 보낸 값 뒤에
 * 덧붙이는 방식이라 맨 왼쪽은 공격자가 고를 수 있다. 그래서 `CF-Connecting-IP` 만 믿는다.
 *
 * 이 함수는 "Cloudflare 뒤"라는 배포 전제에 묶여 있다. 배포 경로가 바뀌면 여기를 먼저 고친다.
 */

/**
 * Cloudflare 를 거치지 않은 요청이 모이는 칸. 로컬 개발이나 터널을 우회한 요청이다.
 * 전부 한 칸에 몰아넣는 것이 의도다. 헤더를 바꿔 가며 칸을 늘리는 길을 주지 않는다.
 */
const UNKNOWN = "unknown";

export function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip")?.trim() || UNKNOWN;
}
