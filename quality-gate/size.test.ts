import { describe, expect, it } from 'vitest';

import { contarLinhas, isSizedFile, oversizedFiles } from './size.mts';

describe('isSizedFile', () => {
  it('aceita .ts e .tsx de produção sob src/', () => {
    expect(isSizedFile('src/app/app/actions.ts')).toBe(true);
    expect(isSizedFile('src/components/panel/week-calendar.tsx')).toBe(true);
  });

  it('recusa teste — teste grande é tabela de casos, e cobrar empurra na direção errada', () => {
    expect(isSizedFile('src/lib/address.test.ts')).toBe(false);
    expect(isSizedFile('src/app/x.test.tsx')).toBe(false);
  });

  it('recusa declaração e o que está fora de src/', () => {
    expect(isSizedFile('src/types.d.ts')).toBe(false);
    expect(isSizedFile('scripts/quality/gate.ts')).toBe(false);
    expect(isSizedFile('supabase/tests/rls.test.sql')).toBe(false);
  });
});

describe('oversizedFiles', () => {
  const medidos = [
    { file: 'src/a.ts', lines: 401 },
    { file: 'src/b.ts', lines: 400 },
    { file: 'src/c.tsx', lines: 733 },
    { file: 'src/d.test.ts', lines: 900 },
  ];

  it('pega quem passou do limite, exclusivo', () => {
    expect(oversizedFiles(medidos, 400).map((m) => m.file)).toEqual(['src/c.tsx', 'src/a.ts']);
  });

  it('ordena do maior para o menor', () => {
    expect(oversizedFiles(medidos, 400)[0].lines).toBe(733);
  });

  it('respeita limite customizado', () => {
    expect(oversizedFiles(medidos, 800)).toEqual([]);
  });

  it('ignora arquivo de teste mesmo enorme', () => {
    expect(oversizedFiles(medidos, 400).map((m) => m.file)).not.toContain('src/d.test.ts');
  });
});

describe('contarLinhas', () => {
  it('não conta a quebra final como linha extra', () => {
    // "a\nb\n".split("\n") dá 3 elementos para 2 linhas, e por isso um arquivo
    // de exatos 400 era medido como 401 e reprovava no limite.
    expect(contarLinhas('a\nb\n')).toBe(2);
  });

  it('conta certo sem quebra final', () => {
    expect(contarLinhas('a\nb')).toBe(2);
  });

  it('arquivo vazio tem zero linhas', () => {
    expect(contarLinhas('')).toBe(0);
  });

  it('arquivo com uma linha só', () => {
    expect(contarLinhas('uma\n')).toBe(1);
  });

  it('linha vazia no meio conta', () => {
    expect(contarLinhas('a\n\nb\n')).toBe(3);
  });
});
