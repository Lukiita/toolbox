#!/usr/bin/env python3
"""Publica as decisoes da triagem no PR: responde cada achado e resolve a thread.

Le findings.json (do collect.py) e decisoes.md (escrito por voce) e faz o que
ninguem lembra de fazer a mao quando sao 30 achados: responder TODOS, resolver
os que tem resposta fechada, e deixar aberto so o que o dono precisa decidir.

Regra de ouro, e por isso ha um gate aqui: achado sem decisao e o defeito que
esta skill existe para matar. Sem `--partial`, o script recusa rodar enquanto
sobrar um.

decisoes.md tem um bloco por achado:

    ## F03 — corrigido
    Corrigido em `abc1234`: agora usa `Number(...)`, que rejeita `'12kg'`.
    Teste novo em `localizedNumber.test.ts:88`.

    ## F07 — rejeitado
    Nao reproduz: `detectarTxt` so aceita `|` depois de validar o cabecalho
    (`txtParser.ts:41-47`), e o teste `txtParser.test.ts:112` cobre o caso.

Decisoes: corrigido · rejeitado · adiado · escalado
Só `escalado` deixa a thread aberta — é o "eu decido depois" do dono do PR.

No comentario de resumo, o motivo de cada rejeitado/adiado/escalado aparece
por extenso; os corrigidos ficam numa tabela colapsada (a evidencia e o
commit). decisoes.md acumula entre rodadas: com IDs estaveis (ids.json, do
collect.py) os blocos antigos continuam valendo.

Uso:
    python3 apply.py                     # simulacao, PR da branch atual
    python3 apply.py --pr 15 --apply     # publica
    python3 apply.py --dir /outro/lugar/pr-15 --apply

Sem --dir, usa o mesmo diretorio de estado do collect.py:
~/.local/state/pr-review/<dono>/<repo>/pr-<N>/ (respeita XDG_STATE_HOME).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path


def storage_root() -> Path:
    """Raiz do estado da triagem, fora de qualquer repositorio."""
    base = os.environ.get("XDG_STATE_HOME", "").strip() or "~/.local/state"
    return Path(base).expanduser() / "pr-review"

DECISOES = {"corrigido", "rejeitado", "adiado", "escalado"}
DEIXA_ABERTO = {"escalado"}
ROTULO = {"corrigido": "✅ corrigido", "rejeitado": "🚫 rejeitado",
          "adiado": "📌 adiado", "escalado": "🙋 para voce decidir"}

BLOCO = re.compile(r"^##\s+(F\d+)\s*[—\-–:]\s*([A-Za-zç]+)\s*$", re.M)
# Referencia rastreavel numa resposta de adiado: issue (#123), ticket
# (sc-9355, PROJ-42) ou link. Adiado sem destino morre esquecido.
RASTRO = re.compile(r"#\d+|https?://\S|\b[A-Za-z]{2,10}-\d{2,}\b")


def encurtar(texto: str, n: int) -> str:
    """Trunca sem deixar code span aberto: crase impar depois do corte faria
    o resto do resumo inteiro renderizar como codigo no GitHub."""
    if len(texto) <= n:
        return texto
    corte = texto[:n].rstrip()
    if corte.count("`") % 2:
        corte += "`"
    return corte + "…"


def loc_curta(f: dict) -> str:
    """Caminho encurtado para o resumo: identifica sem engolir a linha — em
    monorepo o caminho passa de 100 colunas e afoga o proprio achado. O
    caminho completo continua na thread e no findings.md."""
    if not f["path"]:
        return "(PR)"
    partes = f["path"].split("/")
    caminho = f["path"] if len(partes) <= 2 else "…/" + "/".join(partes[-2:])
    return f"{caminho}:{f['line']}"


def gh(*args: str, check: bool = True) -> str:
    p = subprocess.run(["gh", *args], capture_output=True, text=True)
    if check and p.returncode != 0:
        sys.exit(f"gh {' '.join(args[:3])}… falhou:\n{p.stderr.strip()}")
    return p.stdout


def parse_decisoes(path: Path) -> dict[str, dict]:
    if not path.exists():
        sys.exit(f"{path} nao existe — escreva as decisoes antes de aplicar.")
    text = path.read_text()
    marks = list(BLOCO.finditer(text))
    out: dict[str, dict] = {}
    for i, m in enumerate(marks):
        fim = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        corpo = text[m.end():fim].strip()
        decisao = m.group(2).lower()
        if decisao not in DECISOES:
            sys.exit(f"{m.group(1)}: decisao {decisao!r} nao existe. "
                     f"Use uma de: {', '.join(sorted(DECISOES))}.")
        if len(corpo) < 15:
            sys.exit(f"{m.group(1)}: a justificativa esta vazia ou curta demais. "
                     "A resposta e o produto desta skill — o revisor confere o que "
                     "voce afirma contra o repo.")
        out[m.group(1)] = {"decisao": decisao, "resposta": corpo}
    return out


def reply_graphql(thread_id: str, body: str) -> None:
    gh("api", "graphql", "-f", "query="
       "mutation($t:ID!,$b:String!){addPullRequestReviewThreadReply("
       "input:{pullRequestReviewThreadId:$t, body:$b}){comment{url}}}",
       "-F", f"t={thread_id}", "-F", f"b={body}")


def resolve_thread(thread_id: str) -> None:
    gh("api", "graphql", "-f", "query="
       "mutation($t:ID!){resolveReviewThread(input:{threadId:$t}){thread{isResolved}}}",
       "-F", f"t={thread_id}")


def carregar_respostas_minhas(repo: str, pr: int, me: str) -> set[str]:
    """IDs que eu ja respondi, lidos dos marcadores `<!-- prt:Fnn -->` no PR.

    Roda interrompida no meio — e elas sao interrompidas — nao duplica resposta
    ao ser retomada."""
    vistos: set[str] = set()
    for endpoint in (f"repos/{repo}/pulls/{pr}/comments",
                     f"repos/{repo}/issues/{pr}/comments"):
        raw = gh("api", endpoint, "--paginate", check=False)
        try:
            for c in json.loads(raw or "[]"):
                if c["user"]["login"] != me:
                    continue
                vistos |= set(re.findall(r"<!--\s*prt:(F\d+)\s*-->", c.get("body") or ""))
        except json.JSONDecodeError:
            pass
    return vistos


def comentario_resumo(repo: str, pr: int, me: str, corpo: str, apply: bool) -> str:
    """Um unico comentario de resumo, atualizado a cada passada em vez de
    empilhar um novo — o PR fica legivel."""
    marker = "<!-- prt-summary -->"
    corpo = marker + "\n" + corpo
    raw = gh("api", f"repos/{repo}/issues/{pr}/comments", "--paginate", check=False)
    alvo = None
    try:
        for c in json.loads(raw or "[]"):
            if c["user"]["login"] == me and marker in (c.get("body") or ""):
                alvo = c["id"]
    except json.JSONDecodeError:
        pass
    if not apply:
        return f"{'atualizaria' if alvo else 'criaria'} o comentario de resumo"
    if alvo:
        gh("api", "--method", "PATCH", f"repos/{repo}/issues/comments/{alvo}",
           "-f", f"body={corpo}")
        return "resumo atualizado"
    gh("api", "--method", "POST", f"repos/{repo}/issues/{pr}/comments",
       "-f", f"body={corpo}")
    return "resumo publicado"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pr", type=int, help="numero do PR (padrao: o da branch atual)")
    ap.add_argument("--repo", help="dono/repo (padrao: o remoto atual)")
    ap.add_argument("--dir", help="diretorio com findings.json e decisoes.md "
                                  "(padrao: o do estado do PR, o mesmo do collect.py)")
    ap.add_argument("--apply", action="store_true", help="publica de verdade (padrao: simula)")
    ap.add_argument("--partial", action="store_true",
                    help="permite rodar com achados sem decisao (eles ficam intocados)")
    ap.add_argument("--no-summary", action="store_true", help="nao publica o comentario de resumo")
    a = ap.parse_args()

    if a.dir:
        d = Path(a.dir)
    else:
        nome = a.repo or gh("repo", "view", "--json", "nameWithOwner",
                            "-q", ".nameWithOwner").strip()
        num = a.pr or int(gh("pr", "view", "--json", "number", "-q", ".number").strip())
        d = storage_root() / nome / f"pr-{num}"
    if not (d / "findings.json").exists():
        sys.exit(f"{d}/findings.json nao existe — rode o collect.py primeiro"
                 " (ou aponte --dir para onde ele escreveu).")
    data = json.loads((d / "findings.json").read_text())
    meta, findings = data["meta"], data["findings"]
    repo, pr, me = meta["repo"], meta["pr"], meta["me"]
    decisoes = parse_decisoes(d / "decisoes.md")

    faltando = [f["id"] for f in findings if f["id"] not in decisoes]
    sobrando = [k for k in decisoes if k not in {f["id"] for f in findings}]
    if sobrando:
        print(f"nota: decisao sem achado aberto nesta rodada (tipico: resolvido em "
              f"rodada anterior; confira so se nao esperava): {', '.join(sobrando)}")
    sem_destino = sorted(k for k, v in decisoes.items()
                         if v["decisao"] == "adiado" and not RASTRO.search(v["resposta"]))
    if sem_destino:
        print(f"aviso: adiado sem referencia rastreavel (issue, ticket ou link): "
              f"{', '.join(sem_destino)} — adiado sem destino morre esquecido; "
              f"crie a issue e cite-a na resposta.")
    if faltando and not a.partial:
        print(f"\n{len(faltando)} achado(s) sem decisao: {', '.join(faltando)}")
        print("Todo achado precisa terminar em corrigido, rejeitado, adiado ou escalado.")
        print("Escreva as que faltam, ou rode com --partial se for de proposito.")
        return 1

    ja = carregar_respostas_minhas(repo, pr, me)

    tratados = [(f, decisoes[f["id"]]) for f in findings if f["id"] in decisoes]
    feitos = {"respondido": 0, "resolvido": 0, "pulado": 0, "sem_thread": 0}

    for f, dec in tratados:
        loc = f"{f['path']}:{f['line']}" if f["path"] else "(PR)"
        if not f["thread_id"]:
            feitos["sem_thread"] += 1
            continue
        if f.get("already_replied") or f["id"] in ja:
            # Resposta minha ja existe (rodada anterior ou execucao que morreu
            # no meio): nao responde de novo. Mas se a decisao fecha a thread e
            # ela ficou aberta — morreu entre o reply e o resolve —, completa.
            feitos["pulado"] += 1
            if dec["decisao"] not in DEIXA_ABERTO and not f.get("resolved"):
                if a.apply:
                    resolve_thread(f["thread_id"])
                feitos["resolvido"] += 1
                print(f"  {f['id']} {dec['decisao']:10} {'so resolve: resposta ja existia':24} {loc}")
            continue

        corpo = f"<!-- prt:{f['id']} -->\n**{ROTULO[dec['decisao']].split(' ', 1)[1]}** — {dec['resposta']}"
        if dec["decisao"] in DEIXA_ABERTO:
            corpo += "\n\n_Deixando esta thread aberta de proposito: quem e dono do PR decide._"
        if a.apply:
            reply_graphql(f["thread_id"], corpo)
            feitos["respondido"] += 1
            if dec["decisao"] not in DEIXA_ABERTO:
                resolve_thread(f["thread_id"])
                feitos["resolvido"] += 1
        else:
            feitos["respondido"] += 1
            feitos["resolvido"] += int(dec["decisao"] not in DEIXA_ABERTO)
        print(f"  {f['id']} {dec['decisao']:10} {'responde+resolve' if dec['decisao'] not in DEIXA_ABERTO else 'responde, deixa aberta':24} {loc}")

    # So o que esta em jogo NESTA rodada conta para o resumo: decisoes.md
    # acumula, e contar bloco de achado ja resolvido inflaria o placar.
    contagem: dict[str, int] = {}
    for _, dec in tratados:
        contagem[dec["decisao"]] = contagem.get(dec["decisao"], 0) + 1
    placar = " · ".join(f"{n} {d}" for d, n in sorted(contagem.items()))

    def bloco(f: dict, dec: dict) -> list[str]:
        """Item de lista com o motivo por extenso logo abaixo do cabecalho."""
        sem = "" if f["thread_id"] else " · sem thread"
        # Linha em branco + indentacao de 2 espacos: o motivo vira paragrafo
        # proprio DENTRO do item; sem isso o GFM cola motivo e titulo.
        motivo = "\n".join("  " + l if l.strip() else "" for l in dec["resposta"].splitlines())
        return [f"- **{f['id']} · `{loc_curta(f)}` · {ROTULO[dec['decisao']]}{sem}** — "
                f"{encurtar(f['title'], 100)}", "", motivo, ""]

    escalados = [(f, d) for f, d in tratados if d["decisao"] in DEIXA_ABERTO]
    discutidos = [(f, d) for f, d in tratados if d["decisao"] in ("rejeitado", "adiado")]
    corrigidos = [f for f, d in tratados if d["decisao"] == "corrigido"]

    corpo_resumo = ["## Triagem dos achados de revisão", "",
                    f"{len(tratados)} achado(s): {placar}.", ""]

    # Quem le o resumo precisa do motivo sem clicar em nada: rejeicao, adiamento
    # e escalada sao exatamente as decisoes que alguem pode querer contestar — e
    # o GitHub colapsa as threads resolvidas onde elas tambem estao. Item com o
    # motivo embaixo, nao tabela: motivo cita `arquivo:linha` e nao cabe em celula.
    if escalados:
        corpo_resumo += [f"### 🙋 Aguardando decisão do dono do PR ({len(escalados)})", "",
                         "_As threads destes ficaram abertas de propósito._", ""]
        for f, dc in escalados:
            corpo_resumo += bloco(f, dc)
    if discutidos:
        corpo_resumo += [f"### Rejeitados e adiados ({len(discutidos)})", ""]
        for f, dc in discutidos:
            corpo_resumo += bloco(f, dc)

    # Os corrigidos ficam colapsados e sem justificativa: a evidencia e o commit,
    # e o paredao de defesas soterraria as poucas decisoes que se precisa ler.
    if corrigidos:
        corpo_resumo += [f"<details><summary>✅ Corrigidos ({len(corrigidos)}) — "
                         "a evidência é o commit</summary>", "",
                         "| # | Onde | Achado |", "|---|---|---|"]
        corpo_resumo += [f"| {f['id']} | `{loc_curta(f)}` | "
                         f"{encurtar(f['title'], 80).replace('|', '/')} |" for f in corrigidos]
        corpo_resumo += ["", "</details>", ""]

    if not a.no_summary:
        print("  " + comentario_resumo(repo, pr, me, "\n".join(corpo_resumo),
                                       a.apply and bool(findings)))

    (d / "resumo.md").write_text("\n".join(corpo_resumo))

    print(f"\n{'PUBLICADO' if a.apply else 'SIMULACAO (use --apply para publicar)'}: "
          f"{feitos['respondido']} respondidos, {feitos['resolvido']} resolvidos, "
          f"{feitos['sem_thread']} sem thread (foram para o resumo), "
          f"{feitos['pulado']} pulados por ja terem resposta minha")
    if escalados:
        print(f"{len(escalados)} thread(s) deixada(s) aberta(s) para o dono decidir: "
              + ", ".join(f["id"] for f, _ in escalados))
    print(f"-> {d}/resumo.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
