import { describe, expect, it } from 'vitest';

import {
  type CoverageEntry,
  coveragePercent,
  isTestableFile,
  lineTotals,
  uncoveredInTestableFiles,
  uncoveredLines,
} from './coverage.mts';

function entrada(linhas: [linha: number, execucoes: number][]): CoverageEntry {
  const statementMap: CoverageEntry['statementMap'] = {};
  const s: CoverageEntry['s'] = {};
  linhas.forEach(([linha, execucoes], i) => {
    statementMap[String(i)] = { start: { line: linha }, end: { line: linha } };
    s[String(i)] = execucoes;
  });
  return { statementMap, s };
}

describe('uncoveredLines', () => {
  it('devolve as linhas cujas instruções nunca rodaram', () => {
    expect(
      uncoveredLines(
        entrada([
          [10, 3],
          [11, 0],
          [12, 0],
        ]),
      ),
    ).toEqual([11, 12]);
  });

  it('linha com instrução coberta e descoberta conta como coberta', () => {
    expect(
      uncoveredLines(
        entrada([
          [7, 0],
          [7, 1],
        ]),
      ),
    ).toEqual([]);
  });

  it('devolve vazio quando tudo rodou', () => {
    expect(
      uncoveredLines(
        entrada([
          [1, 1],
          [2, 5],
        ]),
      ),
    ).toEqual([]);
  });

  it('ordena, para o relatório não depender da ordem do JSON', () => {
    expect(
      uncoveredLines(
        entrada([
          [30, 0],
          [4, 0],
        ]),
      ),
    ).toEqual([4, 30]);
  });
});

describe('lineTotals', () => {
  it('conta linhas com instrução e quantas rodaram', () => {
    expect(
      lineTotals(
        entrada([
          [1, 3],
          [2, 0],
          [3, 1],
        ]),
      ),
    ).toEqual({
      total: 3,
      cobertas: 2,
    });
  });

  it('não conta a mesma linha duas vezes', () => {
    expect(
      lineTotals(
        entrada([
          [5, 1],
          [5, 0],
        ]),
      ),
    ).toEqual({
      total: 1,
      cobertas: 1,
    });
  });
});

describe('coveragePercent', () => {
  const identidade = (p: string) => p;

  it('divide cobertas por linhas com instrução, com duas casas', () => {
    const pct = coveragePercent(
      {
        'src/lib/a.ts': entrada([
          [1, 1],
          [2, 1],
          [3, 0],
        ]),
      },
      identidade,
    );
    expect(pct).toBe(66.67);
  });

  it('soma o repo inteiro, não a média das médias', () => {
    // 3 de 4 cobertas no total = 75%. Média por arquivo daria 75% também,
    // mas com arquivos de tamanhos diferentes divergiria — este é o caso.
    const pct = coveragePercent(
      {
        'src/lib/grande.ts': entrada([
          [1, 1],
          [2, 1],
          [3, 1],
          [4, 0],
        ]),
        'src/lib/pequeno.ts': entrada([[1, 0]]),
      },
      identidade,
    );
    expect(pct).toBe(60);
  });

  it('ignora arquivo não testável no cálculo', () => {
    const pct = coveragePercent(
      {
        'src/lib/a.ts': entrada([[1, 1]]),
        'src/components/x.tsx': entrada([
          [1, 0],
          [2, 0],
        ]),
      },
      identidade,
    );
    expect(pct).toBe(100);
  });

  it('repo sem instrução nenhuma conta como 100, não como 0', () => {
    expect(coveragePercent({}, identidade)).toBe(100);
  });
});

describe('isTestableFile', () => {
  it('aceita .ts de produção sob src/', () => {
    expect(isTestableFile('src/lib/address.ts')).toBe(true);
    expect(isTestableFile('src/app/app/actions.ts')).toBe(true);
  });

  it('recusa .tsx, teste, declaração e o que está fora de src/', () => {
    expect(isTestableFile('src/components/shop-map.tsx')).toBe(false);
    expect(isTestableFile('src/lib/address.test.ts')).toBe(false);
    expect(isTestableFile('src/types.d.ts')).toBe(false);
    expect(isTestableFile('scripts/quality/gate.ts')).toBe(false);
  });
});

describe('uncoveredInTestableFiles', () => {
  const identidade = (p: string) => p;

  it('soma por arquivo e ordena pelo mais descoberto', () => {
    const resultado = uncoveredInTestableFiles(
      {
        'src/lib/a.ts': entrada([[1, 0]]),
        'src/lib/b.ts': entrada([
          [1, 0],
          [2, 0],
        ]),
      },
      identidade,
    );
    expect(resultado).toEqual([
      { file: 'src/lib/b.ts', lines: [1, 2], percentual: 0 },
      { file: 'src/lib/a.ts', lines: [1], percentual: 0 },
    ]);
  });

  it('carrega o percentual do próprio arquivo', () => {
    const resultado = uncoveredInTestableFiles(
      {
        'src/lib/a.ts': entrada([
          [1, 1],
          [2, 1],
          [3, 0],
        ]),
      },
      identidade,
    );
    expect(resultado[0].percentual).toBe(66.67);
  });

  it('descarta arquivo não testável mesmo que o mapa o traga', () => {
    const resultado = uncoveredInTestableFiles(
      { 'src/components/x.tsx': entrada([[1, 0]]) },
      identidade,
    );
    expect(resultado).toEqual([]);
  });

  it('omite arquivo totalmente coberto', () => {
    const resultado = uncoveredInTestableFiles({ 'src/lib/a.ts': entrada([[1, 2]]) }, identidade);
    expect(resultado).toEqual([]);
  });
});
