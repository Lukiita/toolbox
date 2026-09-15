import { describe, expect, it } from 'vitest';

import { pureRuleFilesOutsideDomain } from './place-rule.mts';

describe('pureRuleFilesOutsideDomain', () => {
  it('flags a .ts with a test beside it inside src/components', () => {
    // The case import-direction lint cannot catch: the rule never reached
    // `domain/`, so there is no boundary import to violate.
    const files = ['src/components/fee-calculation.ts', 'src/components/fee-calculation.test.ts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual(['src/components/fee-calculation.ts']);
  });

  it('ignores a .ts with no test beside it - wiring, not a displaced rule', () => {
    const files = ['src/components/launcher-props.ts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('accepts the package-by-layer layout: src/domain and src/application', () => {
    const files = [
      'src/domain/freight-split.ts',
      'src/domain/freight-split.test.ts',
      'src/application/generate-declaration.ts',
      'src/application/generate-declaration.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('accepts the package-by-feature layout: the layers live inside the feature folder', () => {
    const files = [
      'src/processo-aduaneiro/domain/rateio.ts',
      'src/processo-aduaneiro/domain/rateio.test.ts',
      'src/processo-aduaneiro/application/gerar-declaracao.ts',
      'src/processo-aduaneiro/application/gerar-declaracao.test.ts',
      'src/shared/domain/money.ts',
      'src/shared/domain/money.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  // Issue #2 (project-d, 2026-09-11): 8 of 114 flagged files were gateways
  // and mappers inside infra/ or presentation/, tested because they are pure
  // - placed right, counted by punctuation. Inside a feature, the folder is
  // the explicit layer declaration.
  it('accepts infra/ and infrastructure/ inside a feature: a tested mapper there is placed, not displaced', () => {
    const files = [
      'src/santander/domain/pagamento.ts',
      'src/santander/infra/gateways/pagamento-santander-gateway.ts',
      'src/santander/infra/gateways/pagamento-santander-gateway.test.ts',
      'src/reurb/domain/lote.ts',
      'src/reurb/infrastructure/d4sign/d4sign-mapper.ts',
      'src/reurb/infrastructure/d4sign/d4sign-mapper.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('accepts presentation/ inside a feature', () => {
    const files = [
      'src/cobranca/domain/boleto.ts',
      'src/cobranca/presentation/boleto-view-model.ts',
      'src/cobranca/presentation/boleto-view-model.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('accepts the CQRS folders without an application/ segment: use-cases/, commands/, queries/', () => {
    const files = [
      'src/santander/domain/notificacao.ts',
      'src/santander/use-cases/criar-notificacao-webhook/criar-notificacao-webhook.use-case.ts',
      'src/santander/use-cases/criar-notificacao-webhook/criar-notificacao-webhook.use-case.test.ts',
      'src/santander/commands/aplicar-x/aplicar-x.handler.ts',
      'src/santander/commands/aplicar-x/aplicar-x.handler.test.ts',
      'src/santander/queries/listar-x/listar-x.handler.ts',
      'src/santander/queries/listar-x/listar-x.handler.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('accepts the flat layout too: src/infra/ when src/domain/ exists', () => {
    const files = [
      'src/domain/freight.ts',
      'src/infra/freight-mapper.ts',
      'src/infra/freight-mapper.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('accepts the shared kernel layers: src/shared/infra/ beside src/shared/domain/', () => {
    const files = [
      'src/shared/domain/money.ts',
      'src/shared/infra/money-codec.ts',
      'src/shared/infra/money-codec.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  // A layer folder is a layer only inside a feature - and a feature is a
  // folder that has a domain/. Otherwise renaming utils/functions/ to
  // utils/queries/ would silence the metric (review of issue #2).
  it('does NOT exempt a layer-named folder inside a grab-bag: utils/ and hooks/ have no domain/', () => {
    const files = [
      'src/utils/infra/x.ts',
      'src/utils/infra/x.test.ts',
      'src/utils/queries/calcular-juros.ts',
      'src/utils/queries/calcular-juros.test.ts',
      'src/hooks/queries/use-saldo.ts',
      'src/hooks/queries/use-saldo.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([
      'src/hooks/queries/use-saldo.ts',
      'src/utils/infra/x.ts',
      'src/utils/queries/calcular-juros.ts',
    ]);
  });

  it('does NOT exempt a flat src/infra/ when there is no src/domain/', () => {
    const files = ['src/infra/x.ts', 'src/infra/x.test.ts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual(['src/infra/x.ts']);
  });

  it('still flags a rule folder the layout does not name: regras/ and utils/functions/', () => {
    const files = [
      'src/registration/domain/cadastro.ts',
      'src/registration/regras/validar-cpf.ts',
      'src/registration/regras/validar-cpf.test.ts',
      'src/utils/functions/calcular-juros.ts',
      'src/utils/functions/calcular-juros.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([
      'src/registration/regras/validar-cpf.ts',
      'src/utils/functions/calcular-juros.ts',
    ]);
  });

  it('still flags a technical lib with no layers - exempting it would hide the regras/ hits', () => {
    const files = [
      'src/core/firebase/validar-projeto-firebase.ts',
      'src/core/firebase/validar-projeto-firebase.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([
      'src/core/firebase/validar-projeto-firebase.ts',
    ]);
  });

  it('domain/ and application/ stay exempt on their own - they ARE the rule places', () => {
    const files = ['src/utils/domain/x.ts', 'src/utils/domain/x.test.ts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  // ADR-0001: the slot and the window come from the project's config. This is
  // the project-d shape - a monorepo with no `src/` at the root.
  describe('with a monorepo slot from the config', () => {
    const monorepo = {
      sourceWindow: /^apps\/[^/]+\/src\//,
      featureSlot: '^apps/[^/]+/src/(?:([^/]+)/)?',
    };

    it('accepts a tested gateway inside a feature of the monorepo', () => {
      const files = [
        'apps/backend/src/santander/domain/pagamento.ts',
        'apps/backend/src/santander/infra/gateways/pagamento-santander-gateway.ts',
        'apps/backend/src/santander/infra/gateways/pagamento-santander-gateway.test.ts',
      ];
      expect(pureRuleFilesOutsideDomain(files, monorepo)).toEqual([]);
    });

    it('still flags the grab-bag, and ignores files outside the window', () => {
      const files = [
        'apps/backend/src/utils/functions/calcular-juros.ts',
        'apps/backend/src/utils/functions/calcular-juros.test.ts',
        'src/utils/money.ts',
        'src/utils/money.test.ts',
      ];
      expect(pureRuleFilesOutsideDomain(files, monorepo)).toEqual([
        'apps/backend/src/utils/functions/calcular-juros.ts',
      ]);
    });
  });

  it('flags a rule inside a feature folder but outside its layer dirs', () => {
    const files = [
      'src/processo-aduaneiro/calculo-emolumentos.ts',
      'src/processo-aduaneiro/calculo-emolumentos.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([
      'src/processo-aduaneiro/calculo-emolumentos.ts',
    ]);
  });

  it('flags a pure rule in src/utils, which is as much an edge as the UI', () => {
    const files = ['src/utils/money.ts', 'src/utils/money.test.ts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual(['src/utils/money.ts']);
  });

  it('ignores .tsx components: AGENTS.md says to extract the logic, not to test the render', () => {
    const files = ['src/components/AsycudaEditor.tsx', 'src/components/AsycudaEditor.test.tsx'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('sees a .mts module with its .test.ts beside it, like size and coverage do', () => {
    const files = ['src/utils/money.mts', 'src/utils/money.test.ts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual(['src/utils/money.mts']);
  });

  it('accepts .test.mts beside .mts too, and never counts the test or a .d.mts', () => {
    const files = ['src/utils/a.mts', 'src/utils/a.test.mts', 'src/utils/b.d.mts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual(['src/utils/a.mts']);
  });

  it('ignores what lives outside src/', () => {
    const files = ['scripts/quality/size.mts', 'scripts/quality/size.test.ts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('returns sorted, so the baseline diff stays stable', () => {
    const files = [
      'src/components/z.ts',
      'src/components/z.test.ts',
      'src/components/a.ts',
      'src/components/a.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([
      'src/components/a.ts',
      'src/components/z.ts',
    ]);
  });
});
