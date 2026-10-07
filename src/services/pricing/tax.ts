/**
 * 표기 전용 역산. 모든 금액은 이미 부가세 포함이므로 계산 과정에서는 쓰지 않는다. (ADR-0005)
 * 공급가액을 먼저 버림으로 구하고 차액을 세액으로 두어 합계가 총액과 정확히 일치하게 한다.
 */

export interface TaxBreakdown {
  supplyAmount: number;
  vatAmount: number;
}

export function splitTax(totalAmount: number): TaxBreakdown {
  const supplyAmount = Math.floor((totalAmount * 10) / 11);
  return { supplyAmount, vatAmount: totalAmount - supplyAmount };
}
