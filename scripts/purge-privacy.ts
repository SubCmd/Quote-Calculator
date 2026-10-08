/**
 * 보존기간이 지난 개인정보를 비우는 배치. (ADR-0022)
 *
 *   npm run privacy:purge           실제로 비운다
 *   npm run privacy:purge -- --dry  대상 건수만 센다
 *
 * 하루 한 번 서버 크론/작업 스케줄러가 부른다. 웹에 노출되는 경로는 만들지 않았다.
 * 돌지 않으면 아무 일도 일어나지 않는다. 스케줄러 등록까지가 이 작업의 완료다.
 */
import { prisma } from "../src/lib/prisma";
import { purgePersonalData } from "../src/services/privacy/purge";

const dryRun = process.argv.includes("--dry");

async function main() {
  const now = new Date();
  const report = await purgePersonalData(now, dryRun);
  const { counts, cutoff } = report;

  console.log(`[privacy-purge] 기준 시각 ${now.toISOString()}`);
  console.log(`  미확정(1년)  ~ ${cutoff.unconfirmedBefore.toISOString()}`);
  console.log(`  확정(5년)    ~ ${cutoff.confirmedBefore.toISOString()}`);
  console.log(
    `[privacy-purge] ${report.applied ? "파기함" : "대상만 셈 (--dry)"} — ` +
      `미확정 ${counts.unconfirmed}건 · 확정 ${counts.confirmed}건 · ` +
      `검색 기록 ${counts.searchLogs}건`,
  );
}

main()
  .catch((error) => {
    // 조용히 실패하면 파기가 안 된 줄 모른다. 크론이 알아채도록 종료 코드를 남긴다.
    console.error("[privacy-purge] 실패", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
