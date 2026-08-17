#!/usr/bin/env python3
"""Coleta os achados de revisao de um PR do GitHub em um ledger compacto.

Le tres fontes que os revisores automaticos usam e que costumam ser confundidas
com uma so:

  1. review threads inline  -> tem threadId, da para responder e resolver
  2. corpo das reviews      -> quando ha achados demais o CodeRabbit joga
                               Major/Minor/Nitpick dentro de <details> aqui, e
                               esses NAO viram thread: nao ha o que resolver
  3. issue comments         -> humanos e resumos de bot

Sai daqui um findings.md (para ler) e um findings.json (para o apply.py).
Os IDs (Fnn) sao estaveis por PR — ids.json guarda o mapa impressao-digital->ID,
entao o mesmo achado mantem o mesmo numero em todas as rodadas.

O estado (findings, decisoes, ids) mora FORA do working tree, em
~/.local/state/pr-review/<dono>/<repo>/pr-<N>/ (respeita XDG_STATE_HOME):
e estado do PR, nao do codigo — nao aparece no repo, sobrevive entre rodadas
e e recolhido sozinho quando o PR para (30 dias sem atividade).

Uso:
    python3 collect.py                     # PR da branch atual
    python3 collect.py --pr 15
    python3 collect.py --pr 15 --repo dono/repo --out /outro/lugar
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path


def storage_root() -> Path:
    """Raiz do estado da triagem, fora de qualquer repositorio."""
    base = os.environ.get("XDG_STATE_HOME", "").strip() or "~/.local/state"
    return Path(base).expanduser() / "pr-review"

# --------------------------------------------------------------------------
# gh

def gh(*args: str, check: bool = True) -> str:
    p = subprocess.run(["gh", *args], capture_output=True, text=True)
    if check and p.returncode != 0:
        sys.exit(f"gh {' '.join(args)} falhou:\n{p.stderr.strip()}")
    return p.stdout


def gh_json(*args: str):
    out = gh(*args)
    return json.loads(out) if out.strip() else None


GQL_THREADS = """
query($owner:String!,$repo:String!,$num:Int!,$cursor:String){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$num){
      reviewDecision
      reviewThreads(first:50, after:$cursor){
        pageInfo{ hasNextPage endCursor }
        nodes{
          id isResolved isOutdated path line originalLine
          comments(first:20){ nodes{ databaseId author{login} body url createdAt } }
        }
      }
    }
  }
}
"""


def fetch_threads(owner: str, repo: str, num: int):
    nodes, cursor, decision = [], None, None
    while True:
        args = ["api", "graphql", "-f", f"query={GQL_THREADS}",
                "-F", f"owner={owner}", "-F", f"repo={repo}", "-F", f"num={num}"]
        if cursor:
            args += ["-F", f"cursor={cursor}"]
        pr = gh_json(*args)["data"]["repository"]["pullRequest"]
        decision = pr["reviewDecision"]
        rt = pr["reviewThreads"]
        nodes += rt["nodes"]
        if not rt["pageInfo"]["hasNextPage"]:
            return nodes, decision
        cursor = rt["pageInfo"]["endCursor"]


# --------------------------------------------------------------------------
# limpeza

# Blocos que o CodeRabbit injeta para serem *executados* por um agente, e
# secoes puramente informativas. Fora ambos: o primeiro por seguranca (e
# instrucao de terceiro), o resto por custo.
DROP_SUMMARIES = re.compile(
    r"(Prompt for AI Agents|Prompt for all review comments|Review info|Run configuration"
    r"|Commits|Files selected for processing|Files ignored due to path filters"
    r"|Files skipped from review|Code graph analysis|Autofix|Review details"
    r"|Tips|Walkthrough|Estimated code review effort|Poem|Pre-merge checks"
    r"|Docstrings|Finishing Touches|Comment @coderabbitai"
    # Verificacao interna do CodeRabbit: scripts shell que ELE rodou e o output.
    # Ja poluiu um findings.md com 11KB de dump e virou "titulo" de achado
    # ("Script executed"). A conclusao da analise esta no texto do achado.
    r"|Analysis chain|Scripts? executed|Web query|Learnings)", re.I)

DETAILS_TOKEN = re.compile(r"<details[^>]*>|</details>")
HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)
# [\s>]* e nao \s*: dentro de um blockquote as tags vem prefixadas por "> ".
SUMMARY_RE = re.compile(r"[\s>]*<summary>(.*?)</summary>", re.S)
TAG_RE = re.compile(r"<[^>]+>")

# Bot cujo comentario no PR e resultado de portao — vale como contexto no
# cabecalho. Qualquer outro bot e descartado (ver from_issue_comments).
CI_BOTS = re.compile(r"^(github-actions|codecov|sonarcloud|sonarqubecloud|"
                     r"vercel|netlify|render|circleci|azure-pipelines)(\[bot\])?$", re.I)

SEV_GROUP = re.compile(
    r"(Critical|Major|Minor|Nitpick|Duplicate|Outside diff range|Additional)\s+comments?\s*\((\d+)\)", re.I)
SEV_INLINE = re.compile(r"_(?:🔴|🟠|🟡|🔵|🟣|🧹)?\s*(Critical|Major|Minor|Nitpick|Refactor)\s*_", re.I)
# "caminho.tsx-193-210 (1)" e tambem "caminho.tsx (1)" — o intervalo nem sempre
# vem, e sem o opcional o caminho saia com o contador colado nele.
FILE_GROUP = re.compile(r"^(?P<path>\S+?)(?:-(?P<a>\d+)-(?P<b>\d+))?\s*\((?P<n>\d+)\)\s*$")
BLOCKQUOTE = re.compile(r"^\s*>\s?", re.M)
FINDING_HEAD = re.compile(r"^`(\d+(?:-\d+)?)`:\s*(.*)$", re.M)
INDICATOR = re.compile(r"cr-indicator-types:([a-z_]+)")

SEV_RANK = {"critical": 0, "major": 1, "minor": 2, "refactor": 3,
            "nitpick": 4, "duplicate": 5, "outside diff range": 6, "additional": 7, "": 8}


def details_blocks(text: str):
    """(summary, body) de cada <details> de primeiro nivel em text."""
    out, depth, start = [], 0, None
    for m in DETAILS_TOKEN.finditer(text):
        if m.group(0).startswith("</"):
            depth = max(0, depth - 1)
            if depth == 0 and start is not None:
                inner = text[start:m.start()]
                sm = SUMMARY_RE.match(inner)
                summary = TAG_RE.sub("", sm.group(1)).strip() if sm else ""
                body = inner[sm.end():] if sm else inner
                out.append((summary, body))
                start = None
        else:
            if depth == 0:
                start = m.end()
            depth += 1
    return out


def strip_noise(text: str) -> str:
    """Remove <details> informativos/injetados e comentarios HTML."""
    keep, depth, start, start_tag = [], 0, None, 0
    last = 0
    for m in DETAILS_TOKEN.finditer(text):
        if m.group(0).startswith("</"):
            depth = max(0, depth - 1)
            if depth == 0 and start is not None:
                inner = text[start:m.start()]
                sm = SUMMARY_RE.match(inner)
                summary = TAG_RE.sub("", sm.group(1)).strip() if sm else ""
                if DROP_SUMMARIES.search(summary):
                    keep.append(text[last:start_tag])
                    last = m.end()
                start = None
        else:
            if depth == 0:
                start, start_tag = m.end(), m.start()
            depth += 1
    keep.append(text[last:])
    out = "".join(keep)
    out = HTML_COMMENT.sub("", out)
    # O CodeRabbit aninha parte dos achados em <blockquote>. Deixar o "> " de
    # cada linha quebra tudo o que ancora em inicio de linha depois daqui: o
    # titulo some e o intervalo de linhas nao e reconhecido.
    out = re.sub(r"</?blockquote>", "", out)
    if len([l for l in out.splitlines() if l.strip()]) and \
       all(l.lstrip().startswith(">") or not l.strip() for l in out.splitlines()):
        out = BLOCKQUOTE.sub("", out)
    return re.sub(r"\n{3,}", "\n\n", out).strip()


def severity_of(body: str, fallback: str = "") -> str:
    m = SEV_INLINE.search(body)
    return (m.group(1) if m else fallback).lower()


def fingerprint(path: str, body: str) -> str:
    """Identidade estavel de um achado: o CodeRabbit repete o mesmo texto entre
    passadas incrementais, e sem isto a mesma coisa e triada duas vezes."""
    core = HTML_COMMENT.sub("", body)
    core = re.sub(r"\s+", " ", core).strip()[:400]
    return hashlib.sha1(f"{path}|{core}".encode()).hexdigest()[:10]


def title_of(body: str) -> str:
    for line in body.splitlines():
        s = line.strip()
        if not s or s.startswith(("<", "!", "|", ">", "```")):
            continue
        s = re.sub(r"^`\d+(?:-\d+)?`:\s*", "", s)   # "`71-101`: " prefixa o achado
        s = re.sub(r"_[^_]*_\s*\|?\s*", "", s)      # "_🟠 Major_ | " e afins
        s = re.sub(r"^\*\*(.*?)\*\*:?$", r"\1", s)
        s = TAG_RE.sub("", s).strip(" *:")
        # Crase so nas pontas desbalanceia o code span ("parseFloat` trunca…");
        # nesse caso e mais honesto remover todas.
        if s.count("`") % 2:
            s = s.replace("`", "")
        if len(s) > 3:
            return s[:120]
    return "(sem titulo)"


# --------------------------------------------------------------------------
# extracao

def from_threads(nodes, me: str, include_resolved: bool):
    found = []
    for t in nodes:
        cs = t["comments"]["nodes"]
        if not cs:
            continue
        first = cs[0]
        author = (first["author"] or {}).get("login", "?")
        if author == me:
            continue
        if t["isResolved"] and not include_resolved:
            continue
        raw = first["body"]
        body = strip_noise(raw)
        ind = INDICATOR.search(raw)
        replied = any((c["author"] or {}).get("login") == me for c in cs[1:])
        found.append({
            "source": "thread",
            "thread_id": t["id"],
            "comment_id": first["databaseId"],
            "url": first["url"],
            "author": author,
            "path": t["path"],
            "line": t["line"] or t["originalLine"],
            "resolved": t["isResolved"],
            "outdated": t["isOutdated"],
            "already_replied": replied,
            "kind": ind.group(1) if ind else "",
            "severity": severity_of(raw),
            "title": title_of(body),
            "body": body,
            # fp sobre o corpo LIMPO, nao o cru: os blocos de verificacao
            # interna do revisor (scripts, "Length of output: NNN") variam
            # entre passadas e mudariam o ID de um achado identico. As outras
            # fontes ja calculam sobre o texto limpo.
            "fp": fingerprint(t["path"] or "", body),
        })
    return found


def from_review_body(review, me: str):
    """Achados que so existem dentro de <details> do corpo da review.

    Nao tem thread: nao da para resolver, so responder num comentario do PR.
    E a fonte que mais se esquece — quando o CodeRabbit prioriza Critical como
    inline, os Major inteiros ficam so aqui."""
    author = review["user"]["login"]
    if author == me:
        return []
    found = []
    for group_summary, group_body in details_blocks(review.get("body") or ""):
        if DROP_SUMMARIES.search(group_summary):
            continue
        g = SEV_GROUP.search(group_summary)
        if not g:
            continue
        sev = g.group(1).lower()
        for file_summary, file_body in details_blocks(group_body):
            fm = FILE_GROUP.match(file_summary.strip())
            path = fm.group("path") if fm else file_summary.strip()
            clean = strip_noise(file_body)
            heads = list(FINDING_HEAD.finditer(clean))
            chunks = ([(h.group(1), clean[h.start():heads[i + 1].start() if i + 1 < len(heads) else len(clean)])
                       for i, h in enumerate(heads)] or [("", clean)])
            for lines, chunk in chunks:
                if len(chunk.strip()) < 30:
                    continue
                found.append({
                    "source": "review_body",
                    "thread_id": None,
                    "comment_id": None,
                    "url": review["html_url"],
                    "author": author,
                    "path": path,
                    "line": lines,
                    "resolved": False,
                    "outdated": False,
                    "already_replied": False,
                    "kind": "",
                    "severity": severity_of(chunk, sev),
                    "title": title_of(chunk),
                    "body": chunk.strip(),
                    "fp": fingerprint(path, chunk),
                })
    return found


def from_issue_comments(comments, me: str):
    """Devolve (achados, sinais, bots_ignorados).

    Achado de revisor automatico NUNCA chega por aqui: a API do GitHub o entrega
    como thread ou dentro do corpo da review. Entao comentario de bot no PR e
    sempre uma de duas coisas — sinal de CI (portao, cobertura, deploy), que e
    contexto e vai para o cabecalho, ou ruido de integracao e status (link de
    tarefa, walkthrough, "processando alteracoes"), que se descarta.

    Testar o tipo da conta em vez de manter lista de logins e o que faz isso
    continuar valendo quando aparecer um bot que ninguem previu."""
    found, signals, ignorados = [], [], []
    for c in comments:
        author = c["user"]["login"]
        if author == me:
            continue
        body = strip_noise(c["body"] or "")
        if c["user"].get("type") == "Bot" or author.endswith("[bot]"):
            if CI_BOTS.match(author):
                head = next((l for l in body.splitlines() if l.strip()), "")[:100]
                fail = bool(re.search(r"reprovad|fail|❌|✗|error", body, re.I))
                signals.append({"author": author, "failing": fail,
                                "head": TAG_RE.sub("", head).strip("# *"),
                                "url": c["html_url"]})
            elif author not in ignorados:
                ignorados.append(author)
            continue
        if len(body) < 40 or re.match(r"^@[\w-]+\s", body.strip()):
            continue
        found.append({
            "source": "issue_comment",
            "thread_id": None,
            "comment_id": c["id"],
            "url": c["html_url"],
            "author": author,
            "path": "",
            "line": "",
            "resolved": False,
            "outdated": False,
            "already_replied": False,
            "kind": "",
            "severity": severity_of(body),
            "title": title_of(body),
            "body": body,
            "fp": fingerprint("", body),
        })
    return found, signals, ignorados


# --------------------------------------------------------------------------
# identidade

# Qualquer marcador prt: ja publicado no PR — inclusive de versoes antigas
# deste script, que numeravam por rodada.
MARCADOR_PRT = re.compile(r"<!--\s*prt:F(\d+)\s*-->")
# Cabecalho de bloco do decisoes.md ("## F03 — corrigido").
BLOCO_DECISAO = re.compile(r"^##\s+(F\d+)\s*[—\-–:]", re.M)


def atribuir_ids(findings, outdir: Path, corpos_publicados: list[str]) -> None:
    """IDs estaveis por PR: a mesma impressao digital recebe o mesmo Fnn em
    todas as rodadas, via mapa persistido em ids.json.

    Sem isso os numeros mudam a cada coleta (so as threads abertas entram), e
    tudo que referencia um ID — decisoes.md, os marcadores <!-- prt:Fnn --> das
    respostas ja publicadas — passa a apontar para o achado errado na rodada
    seguinte. Ja fez o apply.py pular achados novos por confundi-los com
    resposta antiga.
    """
    mapa_path = outdir / "ids.json"
    mapa: dict[str, str] = json.loads(mapa_path.read_text()) if mapa_path.exists() else {}
    usados = [int(v[1:]) for v in mapa.values()]
    # PR triado por versao antiga do script tem marcadores com numeracao de
    # rodada. Numerar acima deles evita que um achado novo herde marcador alheio.
    usados += [int(n) for corpo in corpos_publicados for n in MARCADOR_PRT.findall(corpo)]
    prox = max(usados, default=0) + 1
    for f in findings:
        fid = mapa.get(f["fp"])
        if fid is None:
            fid, prox = f"F{prox:02d}", prox + 1
            mapa[f["fp"]] = fid
        f["id"] = fid
    mapa_path.write_text(json.dumps(mapa, indent=1) + "\n")


# --------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pr", type=int, help="numero do PR (padrao: o da branch atual)")
    ap.add_argument("--repo", help="dono/repo (padrao: o remoto atual)")
    ap.add_argument("--out", default=None,
                    help="raiz de saida (padrao: ~/.local/state/pr-review/<dono>/<repo>)")
    ap.add_argument("--include-resolved", action="store_true",
                    help="inclui threads ja resolvidas (padrao: so as abertas)")
    ap.add_argument("--max-body", type=int, default=1600,
                    help="corte por achado no findings.md")
    a = ap.parse_args()

    repo = a.repo or gh("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner").strip()
    owner, name = repo.split("/", 1)
    num = a.pr or int(gh("pr", "view", "--json", "number", "-q", ".number").strip())
    me = gh("api", "user", "-q", ".login").strip()

    threads, decision = fetch_threads(owner, name, num)
    reviews = gh_json("api", f"repos/{repo}/pulls/{num}/reviews", "--paginate") or []
    issues = gh_json("api", f"repos/{repo}/issues/{num}/comments", "--paginate") or []

    findings = from_threads(threads, me, a.include_resolved)
    for r in reviews:
        findings += from_review_body(r, me)
    humans, signals, bots_ignorados = from_issue_comments(issues, me)
    findings += humans

    # Dedup: thread ganha de corpo-de-review para o mesmo achado, e passadas
    # incrementais repetem o texto.
    by_fp: dict[str, dict] = {}
    for f in findings:
        cur = by_fp.get(f["fp"])
        if cur is None or (cur["source"] != "thread" and f["source"] == "thread"):
            by_fp[f["fp"]] = f
    findings = list(by_fp.values())
    findings.sort(key=lambda f: (SEV_RANK.get(f["severity"], 8), f["path"], str(f["line"])))

    if a.out:
        outdir = Path(a.out) / f"pr-{num}"
        exclude_artifacts(a.out)
    else:
        outdir = storage_root() / owner / name / f"pr-{num}"
        migrar_legado(Path(".pr-review"), storage_root() / owner / name)
        gc_antigos(storage_root(), keep=outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    # Corpos crus de tudo ja publicado no PR: e onde vivem os marcadores
    # prt:Fnn de rodadas (e versoes do script) anteriores.
    corpos_publicados = [c["body"] or "" for t in threads for c in t["comments"]["nodes"]]
    corpos_publicados += [(c.get("body") or "") for c in issues]
    atribuir_ids(findings, outdir, corpos_publicados)

    # decisoes.md acumula entre rodadas; com IDs estaveis, um bloco antigo
    # continua valendo. Achado que reaparece ja decidido (tipico dos sem
    # thread: o corpo da review nao some) vem marcado para nao ser triado
    # de novo.
    dec_path = outdir / "decisoes.md"
    ja_decididos = set(BLOCO_DECISAO.findall(dec_path.read_text())) if dec_path.exists() else set()

    meta = {"repo": repo, "pr": num, "review_decision": decision, "me": me,
            "open_threads": sum(1 for t in threads if not t["isResolved"]),
            "total_threads": len(threads), "findings": len(findings),
            "signals": signals}
    (outdir / "findings.json").write_text(
        json.dumps({"meta": meta, "findings": findings}, ensure_ascii=False, indent=2))

    lines = [f"# Achados abertos — {repo} PR #{num}", "",
             f"reviewDecision: **{decision}** · threads abertas: {meta['open_threads']}/{meta['total_threads']}"
             f" · achados apos dedup: **{len(findings)}**", ""]
    if signals:
        lines.append("Sinais de CI (contexto, nao sao achados a triar):")
        for s in signals:
            lines.append(f"- {'❌' if s['failing'] else '✅'} `{s['author']}` — {s['head']}")
        lines.append("")
    if not findings:
        lines.append("Nenhum achado aberto.")
    for f in findings:
        loc = f"{f['path']}:{f['line']}" if f["path"] else "(PR)"
        flags = []
        if f["source"] != "thread":
            flags.append("SEM THREAD — so responde em comentario do PR")
        if f["outdated"]:
            flags.append("outdated")
        if f["already_replied"]:
            flags.append("ja respondido por voce")
        if f["id"] in ja_decididos:
            flags.append("ja decidido em decisoes.md (rodada anterior) — nao trie de novo")
        if f["resolved"]:
            flags.append("ja resolvido")
        body = f["body"]
        if len(body) > a.max_body:
            body = body[:a.max_body] + f"\n\n…(cortado; inteiro em findings.json)"
        lines += [f"## {f['id']} · {f['severity'] or '?'} · `{loc}`",
                  f"*{f['author']}* · {f['kind'] or f['source']}"
                  + (f" · {' · '.join(flags)}" if flags else ""),
                  "", body, "", f"<{f['url']}>", "", "---", ""]
    (outdir / "findings.md").write_text("\n".join(lines))

    print(f"{repo} PR #{num} · reviewDecision={decision}")
    print(f"threads {meta['open_threads']} abertas de {meta['total_threads']} · "
          f"{len(findings)} achados apos dedup")
    counts: dict[str, int] = {}
    for f in findings:
        counts[f["severity"] or "?"] = counts.get(f["severity"] or "?", 0) + 1
    if counts:
        print("por severidade: " + ", ".join(f"{k}={v}" for k, v in sorted(
            counts.items(), key=lambda kv: SEV_RANK.get(kv[0], 8))))
    sem_thread = sum(1 for f in findings if f["source"] != "thread")
    if sem_thread:
        print(f"{sem_thread} sem thread (so no corpo da review) — nao ha o que resolver neles")
    decididos = sum(1 for f in findings if f["id"] in ja_decididos)
    if decididos:
        print(f"{decididos} ja decidido(s) em rodada anterior (decisoes.md) — nao trie de novo")
    for s in signals:
        print(f"sinal de CI: {'REPROVADO' if s['failing'] else 'ok'} · {s['author']} · {s['head'][:70]}")
    if bots_ignorados:
        print("comentarios de bot descartados (nao sao achados): " + ", ".join(bots_ignorados))
    print(f"-> {outdir}/findings.md")
    return 0


def migrar_legado(legado: Path, destino_repo: Path) -> None:
    """Move o .pr-review/ que versoes antigas deixavam dentro do repo.

    TODOS os pr-*, nao so o PR atual: o de PR ja encerrado nunca mais seria
    coletado e ficaria para tras como lixo permanente — exatamente o que a
    mudanca de local quis eliminar. Apagar em vez de mover perderia decisoes
    de triagem em andamento."""
    if not legado.is_dir():
        return
    for pr_dir in sorted(legado.glob("pr-*")):
        alvo = destino_repo / pr_dir.name
        if alvo.exists():
            print(f"aviso: {pr_dir} nao migrado ({alvo} ja existe) — pode apagar")
            continue
        destino_repo.mkdir(parents=True, exist_ok=True)
        shutil.move(str(pr_dir), str(alvo))
        print(f"estado migrado: {pr_dir} -> {alvo}")
    try:
        legado.rmdir()
    except OSError:
        return  # sobrou coisa que nao e nossa; nao mexe
    # Sem o diretorio, a linha que exclude_artifacts deixou no exclude e a
    # ultima reliquia — remove so a entrada exata que escreviamos.
    try:
        top = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                             capture_output=True, text=True).stdout.strip()
        ex = Path(top) / ".git" / "info" / "exclude"
        if top and ex.exists():
            linhas = ex.read_text().splitlines()
            if ".pr-review/" in linhas:
                ex.write_text("\n".join(l for l in linhas if l != ".pr-review/") + "\n")
    except Exception:
        pass


def gc_antigos(root: Path, keep: Path, dias: int = 30) -> None:
    """Recolhe diretorios de PR sem atividade ha mais de `dias`.

    Quando a triagem termina, tudo que importa ja esta publicado no PR
    (respostas, resolves, resumo); o estado local so vale enquanto ha rodadas
    acontecendo. Se um PR renascer depois da limpeza, a numeracao continua
    segura: atribuir_ids comeca acima de qualquer marcador ja publicado."""
    corte = time.time() - dias * 86400
    for pr_dir in root.glob("*/*/pr-*"):
        if pr_dir == keep or not pr_dir.is_dir():
            continue
        try:
            recente = max(p.stat().st_mtime for p in pr_dir.iterdir())
        except (ValueError, OSError):
            recente = pr_dir.stat().st_mtime
        if recente < corte:
            shutil.rmtree(pr_dir, ignore_errors=True)
            print(f"estado recolhido (parado ha +{dias}d): {pr_dir}")
            for pai in (pr_dir.parent, pr_dir.parent.parent):
                try:
                    pai.rmdir()
                except OSError:
                    break


def exclude_artifacts(out: str) -> None:
    """Mantem os artefatos fora do working tree sem tocar no .gitignore versionado.

    So faz sentido quando a saida cai dentro do repositorio: caminho de fora
    nao significa nada em .git/info/exclude, e escrever la sujaria o repo de
    quem so quis mandar a saida para outro lugar."""
    try:
        top = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                             capture_output=True, text=True).stdout.strip()
        if not top:
            return
        raiz = Path(top).resolve()
        alvo = Path(out).resolve()
        if raiz not in alvo.parents and alvo != raiz:
            return
        entry = alvo.relative_to(raiz).as_posix().rstrip("/") + "/"
        ex = raiz / ".git" / "info" / "exclude"
        cur = ex.read_text() if ex.exists() else ""
        if entry not in cur.split():
            with ex.open("a") as fh:
                fh.write(("" if cur.endswith("\n") or not cur else "\n") + entry + "\n")
    except Exception:
        pass


if __name__ == "__main__":
    raise SystemExit(main())
