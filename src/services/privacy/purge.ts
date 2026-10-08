import {
  type PurgeCounts,
  countPurgeTargets,
  purgeExpiredPersonalData,
} from "@/repositories/privacy-purge";
import { type PurgeCutoff, purgeCutoff } from "./retention";

/** 사람이 아니라 배치가 한 일이다. 감사 로그의 actor 에 그대로 들어간다. */
const PURGE_ACTOR = "batch";

export interface PurgeReport {
  cutoff: PurgeCutoff;
  counts: PurgeCounts;
  /** 실제로 지웠는지. false 면 세기만 했다 */
  applied: boolean;
}

/**
 * 보존기간이 지난 개인정보를 비운다. (ADR-0013 정책, ADR-0022 실행)
 * `dryRun` 이면 대상 건수만 세고 아무것도 바꾸지 않는다.
 */
export async function purgePersonalData(
  now: Date,
  dryRun: boolean,
): Promise<PurgeReport> {
  const cutoff = purgeCutoff(now);

  const counts = dryRun
    ? await countPurgeTargets(cutoff)
    : await purgeExpiredPersonalData(cutoff, now, PURGE_ACTOR);

  return { cutoff, counts, applied: !dryRun };
}
