// Portão de qualidade — catraca de baseline congelado.
//
// Roda com `pnpm quality`. Coleta métricas determinísticas, compara com
// `quality-baseline.json` e sai diferente de zero quando alguma piorou. Zero
// custo de modelo: é a mesma classe dos nós bash do fluxo do Archon, que
// custaram US$ 0,00 numa run de US$ 21,92.
//
// Opções:
//   --update-baseline        recongela os números (ação deliberada e versionada)
//   --skip-tests             reaproveita o coverage-quality/ já gerado
//   --baseline-from <rev>    lê o baseline de outro commit (o CI usa a base do
//                            PR, senão um PR que recongela aprova a si mesmo)
//   --out <arquivo>          grava o relatório em markdown
//
// Node 24 executa TypeScript direto (type stripping), então este arquivo não
// precisa de build e ainda entra no `tsc --noEmit` junto com o resto do repo.

import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';

import { explicitAnyCount, type FileAnyCount, filesWithAny, isAnyCheckedFile } from './any-count.mts';
import { ErroDeUso, parseArgs } from './args.mts';
import {
  type Baseline,
  compareFileCounts,
  compareMetrics,
  type MetricBaseline,
} from './compare.mts';
import {
  type CoverageMap,
  coveragePercent,
  type UncoveredByFile,
  uncoveredInTestableFiles,
} from './coverage.mts';
import { duplicationStats, type JscpdReport } from './duplication.mts';
import { pureRuleFilesOutsideDomain } from './place-rule.mts';
import { buildReport, type DetalheDoRelatorio } from './report.mts';
import {
  type ArquivoMedido,
  contarLinhas,
  isSizedFile,
  LIMITE_DE_LINHAS,
  oversizedFiles,
} from './size.mts';

const RAIZ = resolve(import.meta.dirname, '../..');
const BASELINE = resolve(RAIZ, 'quality-baseline.json');

// Metadados de cada métrica, para o `--update-baseline` poder CRIAR uma
// entrada que ainda não existe no json. Sem isto a mensagem do compare
// ("rode com --update-baseline para congelá-la") era uma promessa falsa: o
// update só tocava entradas já presentes, e adotar métrica nova exigia editar
// o baseline à mão. As entradas existentes continuam donas dos próprios
// metadados — os defaults valem só no nascimento.
const DEFAULTS_DE_METRICA: Record<string, Omit<MetricBaseline, 'value'>> = {
  'cobertura-percentual': {
    section: 'Cobertura',
    label: 'Cobertura de linhas',
    mode: 'baseline',
    direction: 'higher-is-better',
    unit: '%',
  },
  'linhas-descobertas': {
    section: 'Cobertura',
    label: 'Linhas descobertas',
    mode: 'baseline',
    direction: 'lower-is-better',
    gate: false,
  },
  'arquivos-com-linha-descoberta': {
    section: 'Cobertura',
    label: 'Arquivos com linha descoberta',
    mode: 'baseline',
    direction: 'lower-is-better',
    gate: false,
  },
  'duplicacao-percentual': {
    section: 'Duplicação',
    label: 'Linhas duplicadas',
    mode: 'baseline',
    direction: 'lower-is-better',
    unit: '%',
  },
  'duplicacao-fragmentos': {
    section: 'Duplicação',
    label: 'Fragmentos duplicados',
    mode: 'baseline',
    direction: 'lower-is-better',
  },
  'regra-pura-fora-do-dominio': {
    section: 'Arquitetura',
    label: 'Regra pura fora do domínio',
    mode: 'baseline',
    direction: 'lower-is-better',
  },
  'arquivos-acima-do-limite': {
    section: 'Tamanho',
    label: 'Arquivos acima do limite',
    mode: 'baseline',
    direction: 'lower-is-better',
  },
  'any-explicito': {
    section: 'Tipos',
    label: '`any` explícito',
    mode: 'baseline',
    direction: 'lower-is-better',
    note: 'Contagem de nós AnyKeyword na AST dos arquivos de produção (any-count.mts). O AGENTS.md proíbe `any` novo; a catraca deixa a dívida legada só encolher.',
  },
};
// Diretório próprio da catraca — ver `reportsDirectory` no
// vitest.quality.config.ts: dividir `coverage/` com o `pnpm test:coverage`
// fazia um apagar o relatório do outro.
const COBERTURA = resolve(RAIZ, 'coverage-quality/coverage-final.json');

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' });
}

// `--others --exclude-standard` além do `--cached`: arquivo novo ainda não
// commitado precisa contar. O gate por task da tlc roda ANTES do commit, e sem
// isso a regra de lugar não veria justamente o arquivo que acabou de nascer no
// lugar errado — o buraco estava no ponto de integração mais valioso.
function arquivosDoProjeto(): string[] {
  return git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean);
}

// Binário direto, não `pnpm vitest`: o pnpm confere lockfile contra
// node_modules antes de executar, e isso impede rodar o portão sobre um
// worktree de outro commit — que é exatamente como ele foi calibrado.
//
// `--config vitest.quality.config.ts`: o config padrão mede só
// `domain/`+`application/` com os limiares do NFR-08; a catraca precisa do
// recorte largo, sem limiar. O porquê da separação está no próprio arquivo.
function rodarTestesComCobertura(): void {
  execFileSync(
    resolve(RAIZ, 'node_modules/.bin/vitest'),
    ['run', '--coverage', '--config', 'vitest.quality.config.ts'],
    { cwd: RAIZ, stdio: 'inherit' },
  );
}

const paraRelativo = (absoluto: string) => relative(RAIZ, absoluto).split('\\').join('/');

function lerCobertura(): {
  descobertos: UncoveredByFile[];
  percentual: number;
} {
  const map = JSON.parse(readFileSync(COBERTURA, 'utf8')) as CoverageMap;
  return {
    descobertos: uncoveredInTestableFiles(map, paraRelativo),
    percentual: coveragePercent(map, paraRelativo),
  };
}

// Só arquivo regular: `git ls-files` também lista submódulo e link simbólico.
// Ler diretório estoura EISDIR, e link para um dispositivo (`/dev/zero`) nunca
// termina — `lstatSync` não segue o link, então decide antes de abrir.
function arquivosRegulares(paths: readonly string[]): string[] {
  return paths.filter((file) => lstatSync(resolve(RAIZ, file)).isFile());
}

function medirTamanhos(paths: readonly string[]): ArquivoMedido[] {
  return arquivosRegulares(paths.filter(isSizedFile)).map((file) => ({
    file,
    lines: contarLinhas(readFileSync(resolve(RAIZ, file), 'utf8')),
  }));
}

function medirAnys(paths: readonly string[]): FileAnyCount[] {
  return filesWithAny(
    arquivosRegulares(paths.filter(isAnyCheckedFile)).map((file) => ({
      file,
      count: explicitAnyCount(file, readFileSync(resolve(RAIZ, file), 'utf8')),
    })),
  );
}

function medirDuplicacao() {
  const saida = mkdtempSync(resolve(tmpdir(), 'jscpd-'));
  try {
    execFileSync(
      resolve(RAIZ, 'node_modules/.bin/jscpd'),
      ['--reporters', 'json', '--output', saida, '--silent', 'src'],
      { cwd: RAIZ, stdio: 'ignore' },
    );
    const report = JSON.parse(
      readFileSync(resolve(saida, 'jscpd-report.json'), 'utf8'),
    ) as JscpdReport;
    return duplicationStats(report);
  } finally {
    // Sem isto, cada execução deixa um diretório para trás — e no gate por
    // task da tlc são 20 por feature.
    rmSync(saida, { recursive: true, force: true });
  }
}

function lerBaseline(rev?: string): { base: Baseline; origem?: string } {
  if (!rev) return { base: JSON.parse(readFileSync(BASELINE, 'utf8')) };
  try {
    return {
      base: JSON.parse(git('show', `${rev}:quality-baseline.json`)),
      origem: rev,
    };
  } catch {
    // A base ainda não tem baseline — é o PR que introduz a catraca. Cair para
    // o da branch é o único comportamento possível, e imprimir o motivo evita
    // que alguém leia "aprovado" achando que houve comparação com a base.
    console.error(
      `aviso: ${rev} não tem quality-baseline.json (o PR que introduz a catraca).\n` +
        'Comparando com o baseline da própria branch.',
    );
    return { base: JSON.parse(readFileSync(BASELINE, 'utf8')) };
  }
}

function main(): void {
  let opcoes;
  try {
    opcoes = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof ErroDeUso)) throw e;
    // Código 2 e não 1: erro de uso não é o mesmo que "a catraca reprovou", e
    // quem lê o log do CI precisa distinguir os dois.
    console.error(
      `${e.message}\nUso: pnpm quality [--update-baseline] [--skip-tests] [--baseline-from <rev>] [--out <arquivo>]`,
    );
    process.exit(2);
  }
  const { atualizar, pularTestes, baselineDe, destino } = opcoes;

  const versionados = arquivosDoProjeto();
  const regraDeLugar = pureRuleFilesOutsideDomain(versionados);
  const grandes = oversizedFiles(medirTamanhos(versionados));
  const anys = medirAnys(versionados);
  const duplicacao = medirDuplicacao();

  if (!pularTestes) rodarTestesComCobertura();
  const { descobertos, percentual: coberturaPercentual } = lerCobertura();
  const porArquivo: Record<string, number> = {};
  for (const { file, lines } of descobertos) porArquivo[file] = lines.length;

  const atual: Record<string, number> = {
    'cobertura-percentual': coberturaPercentual,
    'linhas-descobertas': descobertos.reduce((s, f) => s + f.lines.length, 0),
    'arquivos-com-linha-descoberta': descobertos.length,
    'duplicacao-percentual': duplicacao.percentual,
    'duplicacao-fragmentos': duplicacao.fragmentos,
    'regra-pura-fora-do-dominio': regraDeLugar.length,
    'arquivos-acima-do-limite': grandes.length,
    'any-explicito': anys.reduce((s, f) => s + f.count, 0),
  };

  if (atualizar) {
    const { base } = lerBaseline();
    for (const [nome, valor] of Object.entries(atual)) {
      const alvo = base.metrics[nome];
      if (alvo) {
        alvo.value = valor;
        continue;
      }
      // Métrica medida mas ausente do json: nasce agora, com os metadados
      // registrados. É o que a mensagem de falha do compare promete.
      const defaults = DEFAULTS_DE_METRICA[nome];
      if (defaults) base.metrics[nome] = { ...defaults, value: valor };
    }
    base.uncoveredByFile = Object.fromEntries(
      Object.entries(porArquivo).sort(([a], [b]) => a.localeCompare(b)),
    );
    writeFileSync(BASELINE, `${JSON.stringify(base, null, 2)}\n`);
    console.log('baseline recongelado em quality-baseline.json');
    return;
  }

  const { base, origem } = lerBaseline(baselineDe);
  const falhas = [
    ...compareMetrics(base, atual),
    ...compareFileCounts(base.uncoveredByFile ?? {}, porArquivo),
  ];

  const detalhes: DetalheDoRelatorio[] = [
    {
      titulo: `Regra pura fora de \`src/domain/\` e \`src/application/\` (${regraDeLugar.length})`,
      itens: regraDeLugar.map((f) => `\`${f}\``),
    },
    {
      titulo: `Arquivos acima de ${LIMITE_DE_LINHAS} linhas (${grandes.length})`,
      itens: grandes.map((g) => `\`${g.file}\` — ${g.lines}`),
    },
    {
      titulo: `Arquivos com \`any\` explícito (${anys.length})`,
      itens: anys.slice(0, 20).map((a) => `\`${a.file}\` — ${a.count}`),
    },
    {
      titulo: `Arquivos com linha descoberta (${descobertos.length})`,
      itens: descobertos
        .slice(0, 20)
        .map((d) => `\`${d.file}\` — ${d.lines.length} linhas · ${d.percentual}% coberto`),
    },
  ];

  const relatorio = buildReport({
    baseline: base,
    atual,
    falhas,
    detalhes,
    geradoEm: new Date().toISOString(),
    origemDoBaseline: origem,
    baselineAlterado: origem
      ? git('diff', '--name-only', `${origem}...HEAD`).includes('quality-baseline.json')
      : false,
  });

  console.log(relatorio);
  if (destino) writeFileSync(resolve(RAIZ, destino), `${relatorio}\n`);
  if (falhas.length > 0) process.exit(1);
}

main();
