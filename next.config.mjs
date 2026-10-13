import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/**
 * 개발 서버는 `.next-dev`, 빌드·프로덕션은 `.next` 를 쓴다.
 *
 * didaro.net 이 같은 PC 에서 `next start` 로 `.next` 를 읽고 있다. 둘이 한 디렉터리를
 * 공유하면 `next dev` 가 방문한 페이지만 다시 컴파일하면서 매니페스트를 그 몇 개로
 * 덮어쓰고, 운영 사이트의 나머지 경로가 통째로 404 가 된다. (`/admin/*` 전체가 그렇게 사라졌다)
 *
 * 환경변수가 아니라 phase 로 가른다. `npm run dev` 든 에디터 통합이든 어떻게 띄워도
 * 적용되어야 하고, 깜빡 잊은 한 번이 운영 사이트를 내린다.
 */
export default function config(phase) {
  /** @type {import('next').NextConfig} */
  return {
    reactStrictMode: true,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
}
