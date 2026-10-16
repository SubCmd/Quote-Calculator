import { windowStart } from "@/lib/attempt-window";
import {
  deleteLookupFailuresBefore,
  findLookupFailureWindow,
  findQuotesByCustomer,
  logQuoteLookup,
  recordLookupFailure,
} from "@/repositories/quote-lookup";
import { displayStatus } from "./expiry";
import {
  LOOKUP_WINDOW_MINUTES,
  evaluateLookupLock,
  lookupLockMessage,
} from "./lookup-throttle";
import { statusLabel } from "./transition";

/**
 * 이름과 휴대전화번호로 자기 플랜을 찾는다. (ADR-0045)
 *
 * 돌려주는 것은 **이미 그 사람 것인 정보**뿐이다. 입력한 이름·전화번호를 되돌려 적지 않고,
 * 고른 옵션·할인 내역·관리자 메모도 담지 않는다. 자세한 내역은 `/q/{publicId}` 쪽이다.
 */

/** 조회 결과 한 줄. 연락처도 선택 내역도 없다. (ADR-0045 §3) */
export interface LookupPlan {
  publicId: string;
  productNames: string[];
  /** 현금가. 카드 금액은 여기서 만들지 않는다. (ADR-0039) */
  totalAmount: number;
  /**
   * 화면에 적을 상태 문구. `displayStatus` 가 만든 값을 `statusLabel` 로 옮긴 것이다.
   * `EXPIRED` 는 저장되지 않고 파생된다. (ADR-0012)
   * 상태 코드를 화면에 내려보내지 않는다. 받은 문구를 그대로 적게 한다.
   */
  statusText: string;
  requestedAt: Date;
}

export type LookupResult =
  /** 0건도 성공이다. 못 찾은 이유를 나눠 적지 않는다. (ADR-0045 §5) */
  | { ok: true; plans: LookupPlan[] }
  | { ok: false; retryAfterSeconds: number; message: string };

/**
 * 잠겨 있으면 조회하지 않는다. **그 시도를 기록하지도, 감사 로그에 남기지도 않는다.**
 * 기록하면 창이 계속 새로 채워져 영구 잠금이 되고(ADR-0020 과 같은 보장),
 * 막은 요청이 로그를 밀어내게 두지도 않는다.
 *
 * 실패(0건)만 센다. 자기 플랜을 여러 번 확인하는 것은 막을 일이 아니다.
 */
export async function lookupQuotes(
  input: { name: string; phone: string },
  ip: string,
  now: Date,
): Promise<LookupResult> {
  const since = windowStart(now, LOOKUP_WINDOW_MINUTES);

  // 창을 벗어난 행은 판정에 쓰이지 않는다. 조회할 때마다 함께 지워 별도 배치를 두지 않는다.
  await deleteLookupFailuresBefore(since);

  const lock = evaluateLookupLock(
    await findLookupFailureWindow(since, ip),
    now,
  );
  if (lock.locked) {
    return {
      ok: false,
      retryAfterSeconds: lock.retryAfterSeconds,
      message: lookupLockMessage(lock),
    };
  }

  const rows = await findQuotesByCustomer(input.name, input.phone);
  await logQuoteLookup(rows.length);
  if (rows.length === 0) await recordLookupFailure(ip);

  return {
    ok: true,
    plans: rows.map((row) => ({
      publicId: row.publicId,
      productNames: row.productNames,
      totalAmount: row.totalAmount,
      statusText: statusLabel(displayStatus(row.status, row.expiresAt, now)),
      requestedAt: row.calculatedAt,
    })),
  };
}
