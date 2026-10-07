import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin, isAdminConfigured } from "@/lib/auth";
import {
  getAuditLog,
  getPricingAdminView,
} from "@/services/admin/pricing-admin";
import { PricingAdmin } from "./pricing-admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isAdminConfigured()) notFound();

  const now = new Date();
  // 미들웨어는 쿠키 존재만 본다. 서명 검증은 여기서 한다. (ADR-0011)
  if (!(await isAdmin(now))) redirect("/admin/login");

  const [products, auditLog] = await Promise.all([
    getPricingAdminView(now),
    getAuditLog(1),
  ]);

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner admin-bar">
          <div>
            <p className="brand">관리자</p>
            <h1>가격 규칙</h1>
            <p className="subtitle">
              금액을 바꾸면 기존 값을 덮어쓰지 않고 새 버전이 쌓입니다. 모든
              금액은 부가세 포함입니다.
            </p>
          </div>
          <div className="admin-nav">
            <Link className="ghost" href="/admin/quotes">
              견적 목록
            </Link>
            <form action="/api/admin/logout" method="post">
              <button type="submit" className="ghost">
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>
      <main>
        <PricingAdmin products={products} />

        <section className="audit">
          <h2>변경 이력</h2>
          {auditLog.length === 0 ? (
            <p className="empty-note">아직 변경 이력이 없습니다.</p>
          ) : (
            <table className="audit-table">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>변경자</th>
                  <th>내용</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.createdAt.toLocaleString("ko-KR")}</td>
                    <td>{entry.actor}</td>
                    <td>{entry.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
