import { notFound } from "next/navigation";
import { isAdminConfigured } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  // 설정이 없으면 관리자 영역은 존재하지 않는 것으로 다룬다. (ADR-0011)
  if (!isAdminConfigured()) notFound();

  return (
    <main className="admin-login">
      <h1>관리자 로그인</h1>
      <p className="subtitle">가격 규칙을 변경하려면 로그인이 필요합니다.</p>
      <LoginForm />
    </main>
  );
}
