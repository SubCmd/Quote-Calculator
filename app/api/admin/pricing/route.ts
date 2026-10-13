import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import {
  createOptionSchema,
  deactivateDiscountSchema,
  deactivateOptionSchema,
  discountVersionSchema,
  groupDescriptionSchema,
  optionDescriptionSchema,
  optionVersionSchema,
  reactivateOptionSchema,
  reorderGroupsSchema,
  reorderOptionsSchema,
  reorderProductsSchema,
} from '@/lib/validation/admin';
import {
  createOption,
  deactivateDiscount,
  deactivateOption,
  reactivateOption,
  reorderGroups,
  reorderOptions,
  reorderProducts,
  saveDiscountVersion,
  saveGroupDescription,
  saveOptionDescription,
  saveOptionVersion,
} from '@/services/admin/pricing-admin';

const ACTOR = 'admin';

/**
 * 가격 규칙 새 버전 추가. 기존 행을 UPDATE 하지 않는다. (ADR-0002)
 * 레이아웃·미들웨어 검사에 기대지 않고 여기서 다시 권한을 본다. (.claude/rules/admin.md)
 */
export async function POST(request: Request) {
  const now = new Date();
  if (!(await isAdmin(now))) {
    return NextResponse.json({ ok: false, error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json();

  if (body?.kind === 'option') {
    const parsed = optionVersionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: '입력값이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    // 적용 시작 시각 중복처럼 관리자가 고칠 수 있는 오류는 400 으로 사유를 돌려준다.
    try {
      await saveOptionVersion(parsed.data, ACTOR, now);
    } catch (error) {
      return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body?.kind === 'discount') {
    const parsed = discountVersionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: '입력값이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    try {
      await saveDiscountVersion(parsed.data, ACTOR, now);
    } catch (error) {
      return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  // 기존 그룹 안에만 만든다. 같은 코드가 꺼진 것으로라도 있으면 거부한다. (ADR-0023)
  if (body?.kind === 'create-option') {
    const parsed = createOptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    try {
      await createOption(parsed.data, ACTOR, now);
    } catch (error) {
      // 코드 중복은 관리자가 고칠 수 있는 입력 오류다. 500 으로 숨기지 않는다.
      return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  // 삭제가 아니라 비활성화다. 조건으로 쓰이는 할인도 함께 꺼진다. (ADR-0017)
  if (body?.kind === 'deactivate-option') {
    const parsed = deactivateOptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: '입력값이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const result = await deactivateOption(parsed.data, ACTOR);
    return NextResponse.json({ ok: true, ...result });
  }

  // 비활성화의 역. 조건이 전부 충족되는 할인만 함께 되살린다. (ADR-0023)
  if (body?.kind === 'reactivate-option') {
    const parsed = reactivateOptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: '입력값이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const result = await reactivateOption(parsed.data, ACTOR);
    return NextResponse.json({ ok: true, ...result });
  }

  // 할인만 끈다. 조건 옵션은 건드리지 않는다. 옵션 비활성화와 방향이 다르다. (ADR-0026)
  if (body?.kind === 'deactivate-discount') {
    const parsed = deactivateDiscountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: '입력값이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    try {
      const result = await deactivateDiscount(parsed.data, ACTOR);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
    }
  }

  // 표시 순서는 전체 순열로 받는다. 누락·중복은 관리자가 고칠 수 있는 입력 오류다. (ADR-0026)
  if (body?.kind === 'reorder-products') {
    const parsed = reorderProductsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    try {
      const result = await reorderProducts(parsed.data.productCodes, ACTOR);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
    }
  }

  if (body?.kind === 'reorder-groups') {
    const parsed = reorderGroupsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    try {
      const result = await reorderGroups(parsed.data, ACTOR);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
    }
  }

  if (body?.kind === 'reorder-options') {
    const parsed = reorderOptionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    try {
      const result = await reorderOptions(parsed.data, ACTOR);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
    }
  }

  // 설명 문구는 덮어쓰기다. 새 버전을 만들지 않고 적용 시작 시각도 받지 않는다. (ADR-0025)
  if (body?.kind === 'group-description') {
    const parsed = groupDescriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    try {
      await saveGroupDescription(parsed.data, ACTOR);
    } catch (error) {
      return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body?.kind === 'option-description') {
    const parsed = optionDescriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    try {
      await saveOptionDescription(parsed.data, ACTOR);
    } catch (error) {
      return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: '대상이 올바르지 않습니다.' }, { status: 400 });
}
