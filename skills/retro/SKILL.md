---
name: retro
description: Retrospectiva do ambiente do agente ao fim de uma sessão — o que virar hook, fitness function, regra do reviewer, ponteiro no AGENTS.md ou corte de no-op. Só o usuário invoca (/retro). Propõe, não escreve.
disable-model-invocation: true
---

# Retro — o que a sessão ensinou sobre o ambiente

O `lessons` do tlc aprende sobre a **spec e os testes** (mutante que sobreviveu, AC furado). Esta skill aprende sobre a **harness**: o que faltou ao agente pra trabalhar bem, e em qual arquivo do toolbox isso vira algo permanente. A saída é uma lista de propostas; nada é escrito.

## Fonte

A sessão atual, como aconteceu — é a fonte primária. Só se o usuário apontar outra (um transcript, uma sessão anterior), leia aquela.

## As sete categorias

Passe todas; relate só as que têm **evidência** (um momento concreto da sessão). Cada uma diz quando costuma render:

- **Navegação** — o agente demorou pra achar um arquivo, uma convenção, uma dependência escondida entre arquivos? Proposta: um ponteiro de contexto (uma linha no `AGENTS.md`/`CLAUDE.md` do projeto, ou na description de uma skill). *Rende quando* a sessão gastou tempo procurando.
- **Checks automáticos** — o agente cometeu um erro que lint, typecheck, teste ou um guard pegaria? Proposta: regra de lint, fitness function no `quality-gate/`, guard em `hooks/`. *Rende quando* um erro só apareceu na revisão ou em runtime.
- **Regras do reviewer** — o `code-review` deixou passar algo que uma regra escrita pegaria? Ou tem regra que só gera ruído? Proposta: entrada nova ou cortada no `AGENTS.md` do projeto (o Revisor B cita regra textual). A revisão é quem impõe padrão, não a implementação: o implementador é o agente com mais pressão de contexto, o revisor o com menos. *Rende quando* a revisão errou.
- **Steering global** — tem instrução no `AGENTS.md` global que deveria ser check automático ou regra do reviewer, em vez de texto carregado toda sessão? *Rende quando* o arquivo está grande.
- **Economia de tool** — chamada cara que podia ser um comando só, MCP ou CLI que devolve muito mais do que o agente usou? *Rende quando* uma chamada custou contexto demais.
- **No-ops** — instrução de steering que não muda o comportamento do modelo (ele já faria igual sem ela)? Proposta: cortar a frase inteira. *Rende quando* os arquivos de steering estão grandes.
- **Acesso a informação** — faltou ao agente uma informação que existia (log do dev server, leitura de um serviço, um dashboard)? Proposta: como dar acesso read-only. *Rende quando* o agente chutou por não conseguir ver.

## Saída

Em português, ordenada por severidade (o que mais atrasou a sessão primeiro). Para cada proposta:

- **Evidência** — o momento da sessão que motiva (cite).
- **Alvo** — o arquivo que muda: `hooks/`, `quality-gate/`, `AGENTS.md` do projeto ou global, a description de uma skill, `til/`.
- **Texto proposto** — a regra, o ponteiro ou o check, pronto pra colar.

Não edite nada. Lucas escolhe o que entra: uma mudança de harness aplicada sem ele ler é como ele deixa de saber o que a harness faz.

Categorias e a tese "a revisão impõe padrão, não a implementação" vêm do rascunho `retro` de mattpocock/skills (MIT, 2026-08-27).
