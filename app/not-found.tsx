import Link from "next/link";

// 404 는 오류가 아니다. 주소가 틀렸거나 보유기간이 지나 파기된 견적이다. (ADR-0021, ADR-0013)
export default function NotFound() {
  return (
    <main className="notice-page">
      <h1>없는 주소입니다</h1>
      <p className="subtitle">주소가 잘못되었거나, 보관 기간이 지나 삭제된 견적입니다.</p>

      <div className="card notice-card">
        <p>받으신 견적 주소를 다시 확인해 주세요.</p>
        <div className="notice-actions">
          <Link className="primary" href="/">
            견적 새로 내기
          </Link>
        </div>
      </div>
    </main>
  );
}
