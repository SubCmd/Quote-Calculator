"use client";

/** 저장은 브라우저의 인쇄 대화상자가 한다. 서버가 PDF 파일을 만들지 않는다. (ADR-0016) */
export function PrintButton() {
  return (
    <button type="button" className="primary" onClick={() => window.print()}>
      인쇄 · PDF로 저장
    </button>
  );
}
