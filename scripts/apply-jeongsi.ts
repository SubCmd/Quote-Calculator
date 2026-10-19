/**
 * 정시 컨설팅 상품을 **이미 쓰고 있는 DB** 에 맞춘다. 일회성 운영 데이터 반영이다. (ADR-0048 §7)
 *
 * 시드(`prisma/seed.ts`)의 같은 값과 짝이다. 새로 만든 DB 는 시드가, 운영 DB 는 이쪽이 채운다.
 * 시드를 운영에 돌리면 `quote` · `auditLog` 까지 비우므로 실제 고객의 플랜이 사라진다.
 *
 * **없는 것을 더하고, 있는 것의 문구를 선언한 값으로 맞춘다.** 지우지 않는다.
 * 처음 한 번은 전부 신설이고, 이름이 바뀐 뒤 다시 돌리면 그 줄만 고쳐진다.
 * 몇 번 돌려도 결과가 같다.
 *
 * 쓰기는 **되는 만큼** Service 를 거친다. 그래서 불변식 검사와 감사 로그가 관리자 화면으로
 * 넣은 것과 같다. 옵션 이름은 금액과 같은 버전 행이라 `saveOptionVersion` 이고(ADR-0023),
 * 설명은 `saveOptionDescription` 이다. 상품·단계 이름만 Prisma 직접 쓰기다 — ADR-0046 이
 * 이름 수정을 범위 밖에 두어 Service 경로도 감사 액션도 없다. 단계 이름은 견적 스냅샷에
 * 들어가지 않고, 상품 이름은 관계로 읽히므로 소급 적용된다. **정시 견적이 아직 없을 때만
 * 안전하다.** 생긴 뒤에는 이 스크립트로 상품 이름을 바꾸지 않는다.
 *
 * **순서가 뜻을 만든다.** `FINALCALL` 단계는 선행을 `LINE` 옵션으로 좁히므로(ADR-0044)
 * 그 옵션이 먼저 있어야 한다. 없는 채로 단계를 만들면 선행이 해석되지 않아 영구히
 * 잠긴다. 그래서 단계마다 옵션까지 끝낸 뒤 다음 단계로 넘어간다.
 *
 * 기본은 미리보기다. 실제로 쓰려면 `--apply` 를 붙인다.
 *   npx tsx scripts/apply-jeongsi.ts
 *   npx tsx scripts/apply-jeongsi.ts --apply
 */
import { prisma } from "@/lib/prisma";
import {
  createOption,
  saveGroupDescription,
  saveOptionDescription,
  saveOptionVersion,
} from "@/services/admin/pricing-admin";
import {
  createGroup,
  createProduct,
  setProductActive,
} from "@/services/admin/product-design";

const ACTOR = "admin";
const apply = process.argv.includes("--apply");

const PRODUCT = { code: "JEONGSI", name: "정시 컨설팅" };

interface GroupPlan {
  code: string;
  name: string;
  /** 고를 것이 없는 안내 전용 단계인가. (ADR-0048) */
  noticeOnly: boolean;
  /** 단계 설명. 안내 전용 단계는 이것이 내용 전부다. */
  summary: string | null;
  /** 선행 단계를 옵션 하나로 좁힌다. (ADR-0044) */
  dependsOn: { groupCode: string; optionCode: string } | null;
  option: {
    code: string;
    name: string;
    amount: number;
    summary: string | null;
  } | null;
}

/**
 * 선언한 순서대로 만든다. 정시는 단계가 차례로 진행되고 각 단계를 따로 고르므로
 * 올스토리처럼 한 그룹에 묶지 않는다. 사이에 고를 것이 없는 안내 단계가 끼기 때문이다.
 *
 * 올스토리와 같은 형식이다. 옵션 이름은 번호와 소요 시간까지이고 상담 제목은 한 줄
 * 설명으로 내려간다. (ADR-0031) 단계 이름은 번호만 담는다 — 상담 방식까지 적으면
 * 바로 아래 옵션 줄과 같은 말이 겹친다.
 */
const GROUPS: GroupPlan[] = [
  {
    code: "STEP1",
    name: "1단계",
    noticeOnly: false,
    summary: null,
    dependsOn: null,
    option: {
      code: "STEP1",
      name: "1단계 (30~60분)",
      amount: 89_000,
      summary: "학생의 현재 상황 진단 및 방향성 상담 (유선상담)",
    },
  },
  {
    code: "QUESTIONNAIRE",
    name: "2단계 (사전 질문지 양식 제공)",
    noticeOnly: true,
    summary:
      "상담 전에 사전 질문지 양식을 보내 드립니다. 따로 고르실 것은 없습니다.",
    dependsOn: null,
    option: null,
  },
  {
    code: "LINE",
    name: "3단계",
    noticeOnly: false,
    summary: null,
    dependsOn: null,
    option: {
      code: "LINE",
      name: "3단계 (60~80분)",
      amount: 490_000,
      summary: "정시 가나다군 대학·학과 최종 지원전략 (비대면 zoom 상담)",
    },
  },
  {
    code: "FINALCALL",
    name: "경쟁률 분석",
    noticeOnly: false,
    summary: null,
    dependsOn: { groupCode: "LINE", optionCode: "LINE" },
    option: {
      code: "FINALCALL",
      name: "대학교 경쟁률 분석 (파이널콜)",
      amount: 490_000,
      summary:
        "대학교와 학과의 경쟁률을 분석해서 더 유리한 곳으로 추천해주는 프로그램",
    },
  },
];

function line(label: string, text: string) {
  console.log(`  ${label.padEnd(4, " ")}  ${text}`);
}

async function findProductId(): Promise<string | null> {
  const row = await prisma.product.findUnique({
    where: { code: PRODUCT.code },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** 단계를 만들고 옵션·설명까지 채운다. 이미 있는 것은 문구만 선언한 값으로 맞춘다. */
async function applyGroup(productId: string, plan: GroupPlan) {
  const existing = await prisma.optionGroup.findFirst({
    where: { productId, code: plan.code },
    select: { id: true, name: true, summary: true },
  });

  if (existing) {
    if (existing.name === plan.name) {
      line("단계", `${plan.code} 이미 있다 (변화 없음)`);
    } else {
      // 단계 이름은 견적 스냅샷에 들어가지 않는다. 화면 머리글이라 덮어쓴다.
      // Service 경로가 없다 — ADR-0046 이 이름 수정을 범위 밖에 두었다.
      line("단계", `${plan.code} 이름 '${existing.name}' → '${plan.name}'`);
      if (apply)
        await prisma.optionGroup.update({
          where: { id: existing.id },
          data: { name: plan.name },
        });
    }
    if (plan.summary !== null && existing.summary !== plan.summary) {
      line("설명", `${plan.code} 단계 설명을 맞춘다`);
      if (apply)
        await saveGroupDescription(
          { productId, groupCode: plan.code, summary: plan.summary, detail: null },
          ACTOR,
        );
    }
  } else {
    let dependsOnGroupId: string | null = null;
    if (plan.dependsOn) {
      const prerequisite = await prisma.optionGroup.findFirst({
        where: { productId, code: plan.dependsOn.groupCode },
        select: { id: true },
      });
      // 미리보기에서는 선행 단계가 아직 없는 것이 정상이다. 이 스크립트가 위에서 만든다.
      if (!prerequisite && apply)
        throw new Error(`선행 단계가 없다: ${plan.dependsOn.groupCode}`);
      dependsOnGroupId = prerequisite?.id ?? null;
    }

    const 선행 = plan.dependsOn
      ? ` 선행=${plan.dependsOn.groupCode}/${plan.dependsOn.optionCode}`
      : "";
    line(
      "단계",
      `${plan.code} 신설${plan.noticeOnly ? " (안내 전용)" : ""}${선행}`,
    );

    if (apply) {
      await createGroup(
        {
          productId,
          code: plan.code,
          name: plan.name,
          // 고르지 않아도 되는 단계들이다. 안내 전용은 필수를 켤 수 없다. (ADR-0048)
          required: false,
          singleSelect: false,
          selectAll: false,
          noticeOnly: plan.noticeOnly,
          dependsOnGroupId,
          dependsOnOptionCode: plan.dependsOn?.optionCode ?? null,
        },
        ACTOR,
      );
      if (plan.summary !== null)
        await saveGroupDescription(
          {
            productId,
            groupCode: plan.code,
            summary: plan.summary,
            detail: null,
          },
          ACTOR,
        );
    }
  }

  if (!plan.option) return;
  await applyOption(productId, plan);
}

/** 옵션을 만들거나, 이름·금액이 다르면 **새 버전 행**으로 맞춘다. (ADR-0023) */
async function applyOption(productId: string, plan: GroupPlan) {
  const option = plan.option;
  if (!option) return;

  // 유효한 값은 가장 늦은 버전 행이다. 이름만 바뀌는 저장도 버전을 남긴다. (ADR-0023)
  const current = await prisma.productOption.findFirst({
    where: { group: { productId, code: plan.code }, code: option.code },
    orderBy: { effectiveFrom: "desc" },
    select: { name: true, amount: true },
  });
  const won = option.amount.toLocaleString("ko-KR");

  if (!current) {
    line("옵션", `${option.code} ${option.name} ${won}원 — 신규 등록`);
    if (apply)
      await createOption(
        {
          productId,
          groupCode: plan.code,
          optionCode: option.code,
          name: option.name,
          amount: option.amount,
          // 비워 두면 즉시 적용이다.
          effectiveFrom: null,
        },
        ACTOR,
        new Date(),
      );
  } else if (current.name === option.name && current.amount === option.amount) {
    line("옵션", `${option.code} ${option.name} ${won}원 — 이미 있다 (변화 없음)`);
  } else {
    line(
      "옵션",
      `${option.code} '${current.name}' ${current.amount.toLocaleString("ko-KR")}원 ` +
        `→ '${option.name}' ${won}원 — 새 버전`,
    );
    if (apply)
      await saveOptionVersion(
        {
          productId,
          groupCode: plan.code,
          optionCode: option.code,
          name: option.name,
          amount: option.amount,
          effectiveFrom: null,
        },
        ACTOR,
        new Date(),
      );
  }

  // 설명은 버전이 아니다. 금액 버전을 추가해도 `(groupId, optionCode)` 로 따라온다. (ADR-0025)
  // 선언한 값이 `null` 이면 지운다. 빈 값 저장이 정상 상태다. (.claude/rules/admin.md)
  const description = await prisma.optionDescription.findFirst({
    where: { group: { productId, code: plan.code }, optionCode: option.code },
    select: { summary: true },
  });
  const now = description?.summary ?? null;
  if (now === option.summary) return;
  line(
    "설명",
    `${option.code} 옵션 설명을 ${option.summary === null ? "지운다" : "맞춘다"}`,
  );
  if (apply)
    await saveOptionDescription(
      {
        productId,
        groupCode: plan.code,
        optionCode: option.code,
        summary: option.summary,
        detail: null,
      },
      ACTOR,
    );
}

async function main() {
  console.log(
    `\n${apply ? "적용" : "미리보기 (쓰지 않는다)"} — ${PRODUCT.name} (${PRODUCT.code})`,
  );

  let productId = await findProductId();
  if (productId) {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { name: true },
    });
    if (product.name === PRODUCT.name) {
      line("상품", "이미 있다 (변화 없음)");
    } else {
      // `QuoteItem` 이 상품 이름을 관계로 읽어서 과거 견적에도 소급된다.
      // 정시 견적이 아직 없을 때만 안전하다. (ADR-0046 이 범위 밖에 둔 이유)
      line("상품", `이름 '${product.name}' → '${PRODUCT.name}'`);
      const quotes = await prisma.quoteItem.count({ where: { productId } });
      if (quotes > 0)
        throw new Error(
          `정시 견적이 ${quotes}건 있다. 상품 이름을 바꾸면 그 견적서의 상품명도 바뀐다.`,
        );
      if (apply)
        await prisma.product.update({
          where: { id: productId },
          data: { name: PRODUCT.name },
        });
    }
  } else {
    // 새 상품은 비활성으로 만들어진다. 옵션을 다 넣은 뒤 아래에서 켠다. (ADR-0046 §2)
    line("상품", "신설 — 비활성으로 만든다");
    if (apply) {
      await createProduct(PRODUCT, ACTOR);
      productId = await findProductId();
    }
  }

  if (!productId) {
    // 미리보기다. 상품이 없으면 그 아래 단계의 계획만 적는다.
    for (const plan of GROUPS)
      line("단계", `${plan.code} 신설${plan.noticeOnly ? " (안내 전용)" : ""}`);
    line("활성", "옵션을 넣은 뒤 켠다");
    console.log("\n--apply 를 붙이면 실제로 씁니다.");
    return;
  }

  for (const plan of GROUPS) await applyGroup(productId, plan);

  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: { isActive: true },
  });
  if (product.isActive) {
    line("활성", "이미 켜져 있다 (변화 없음)");
  } else {
    line("활성", "켠다 — 고객 화면에 탭이 나타난다");
    // 활성 옵션이 하나도 없으면 Service 가 사유와 함께 거부한다. (ADR-0046 §2)
    if (apply) await setProductActive({ productId, active: true }, ACTOR);
  }

  console.log(
    apply
      ? "\n끝났습니다. 상품 탭 자리는 표시 순서 화면에서 옮깁니다."
      : "\n--apply 를 붙이면 실제로 씁니다.",
  );
}

main()
  .catch((error) => {
    // 조용히 실패하면 반영이 안 된 줄 모른다. 종료 코드를 남긴다.
    console.error("\n[apply-jeongsi] 실패", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
