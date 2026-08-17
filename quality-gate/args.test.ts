import { describe, expect, it } from 'vitest';

import { ErroDeUso, parseArgs } from './args.mts';

describe('parseArgs', () => {
  it('sem argumento nenhum, compara com o baseline local', () => {
    expect(parseArgs([])).toEqual({
      atualizar: false,
      pularTestes: false,
      baselineDe: undefined,
      destino: undefined,
    });
  });

  it('lê as flags booleanas', () => {
    const o = parseArgs(['--update-baseline', '--skip-tests']);
    expect(o.atualizar).toBe(true);
    expect(o.pularTestes).toBe(true);
  });

  it('lê o valor das flags com argumento', () => {
    const o = parseArgs(['--baseline-from', 'abc123', '--out', 'rel.md']);
    expect(o.baselineDe).toBe('abc123');
    expect(o.destino).toBe('rel.md');
  });

  it('estoura em vez de engolir a flag seguinte como valor', () => {
    // Devolver undefined aqui faria o portão comparar com o baseline da
    // própria branch sem avisar, e o CI aprovaria regressão contra o baseline
    // errado. Erro de uso tem que ser barulhento.
    expect(() => parseArgs(['--baseline-from', '--out', 'rel.md'])).toThrow(ErroDeUso);
  });

  it('estoura quando o valor falta no fim da linha', () => {
    expect(() => parseArgs(['--baseline-from'])).toThrow(/exige um valor/);
  });

  it('estoura com valor vazio', () => {
    expect(() => parseArgs(['--out', ''])).toThrow(ErroDeUso);
  });

  it('--out sem valor estoura: sem relatório, o comentário do PR some calado', () => {
    expect(() => parseArgs(['--out'])).toThrow(/--out exige um valor/);
  });

  it('flag ausente continua sendo undefined — isso é escolha, não engano', () => {
    expect(parseArgs(['--skip-tests']).baselineDe).toBeUndefined();
  });

  it('ignora argumento desconhecido em vez de estourar', () => {
    expect(parseArgs(['--sei-la']).atualizar).toBe(false);
  });
});
