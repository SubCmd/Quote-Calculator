import Image from "next/image";
import Link from "next/link";
import logo from "../../../public/logo.png";
import { LookupForm } from "./lookup-form";

export const metadata = { title: "내 컨쇼 플랜 찾기" };

/**
 * 플랜 주소를 보관하지 못한 고객이 자기 플랜을 다시 찾는 화면. (ADR-0045)
 *
 * 문자·이메일 발송 수단이 없어 링크를 다시 보내 줄 수 없다. 남는 길은 고객이 이미
 * 입력한 것(이름·휴대전화번호)으로 다시 찾는 것이다. (ADR-0013, ADR-0018)
 */
export default function LookupPage() {
  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-identity">
            <Image
              className="app-logo"
              src={logo}
              alt="컨쇼 로고"
              height={52}
            />
            <div>
              <p className="brand">컨쇼 Conshow 입시컨설팅</p>
              <h1>내 컨쇼 플랜 찾기</h1>
            </div>
          </div>
          <p className="subtitle">
            플랜을 요청할 때 입력한 이름과 휴대전화번호를 넣어 주세요. 두 가지가
            모두 일치해야 찾을 수 있습니다.
          </p>
        </div>
      </header>
      <main>
        <section className="lookup-panel">
          <LookupForm />
          <p className="hint">
            플랜 요청을 아직 하지 않으셨다면{" "}
            <Link href="/">나만의 컨쇼 플랜 찾기</Link> 에서 시작할 수 있습니다.
          </p>
        </section>
      </main>
    </>
  );
}
