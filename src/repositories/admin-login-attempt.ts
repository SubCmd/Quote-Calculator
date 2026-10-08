import { prisma } from "@/lib/prisma";
import type { FailureWindow } from "@/services/admin/login-throttle";

/**
 * 관리자 로그인 실패 기록. (ADR-0020)
 * 업무 판단은 하지 않는다. 한도·창 길이는 Service 의 상수다.
 */

/** 실패 1건을 남긴다. 잠긴 요청에는 부르지 않는다. */
export async function recordLoginFailure(ip: string): Promise<void> {
  await prisma.adminLoginAttempt.create({ data: { ip } });
}

/** 로그인에 성공한 IP 의 실패 기록을 지운다. 전체 누적은 건드리지 않는다. */
export async function clearLoginFailures(ip: string): Promise<void> {
  await prisma.adminLoginAttempt.deleteMany({ where: { ip } });
}

/** 판정에 쓰이지 않는 오래된 행을 지운다. 보존 의무가 없는 데이터다. */
export async function deleteLoginFailuresBefore(cutoff: Date): Promise<void> {
  await prisma.adminLoginAttempt.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
}

/** `since` 이후의 실패 건수와 가장 최근 실패 시각. `ip` 를 생략하면 전체다. */
export async function findFailureWindow(
  since: Date,
  ip?: string,
): Promise<FailureWindow> {
  const result = await prisma.adminLoginAttempt.aggregate({
    where: { createdAt: { gte: since }, ...(ip === undefined ? {} : { ip }) },
    _count: { _all: true },
    _max: { createdAt: true },
  });

  return { count: result._count._all, newestAt: result._max.createdAt };
}
