# Coaching the ladder

Rule zero, from the SKILL and repeated because everything hangs on it: **think-first**. The order is law at every step — the user's hypothesis → the coach probes it → the coach complements with what was missed. Opening a step with a menu of options, a recommendation, or "here's what matters here" breaks the skill's contract. One question per message, short blocks; a questionnaire wall is bewildering and buries the thinking.

## The steps

Each step: the goal, how to open, what to probe, when to advance.

### 1. Business drivers

No tech allowed yet — deflect it kindly ("guarda — ainda estamos no negócio"). Open with: who pays? what kills this business? what does success look like in a year? what's a normal day vs the worst day? Probe: revenue flow named? failure cost named (money, life, reputation — they architect differently)? Advance when the user can say in two sentences why this system exists and what must never happen.

### 2. Architecture characteristics — and the forced top 3

Open: "lê os requisitos de novo — que características cada frase te pede?" The user extracts; the coach points at *sentences*, not at answers ("relê o terceiro parágrafo — 'auditores externos' implica o quê?"). Probe for the **implicit** ones (never stated, always present — the book's warning). More than 7 candidates means merging is due. Then force the ranking: **top 3, defended** — the book's rule is that you architect for the least-worst fit of the few that dominate, never for all 14. Each top-3 pick needs its evidence line in the kata/conversation. Advance when the ranking survives one round of "por que essa acima daquela?".

### 3. Components & quantum

Open: "sem estilo ainda — quais são as peças lógicas?" (actor/action or workflow partitioning, either is fine). Then the quantum question: **how many independently deployable pieces does the problem demand?** — deployment independence is bought with operational cost, so the number comes from the drivers, not from fashion. Advance when components have names from the domain and the quantum count has a because.

### 4. Style shortlist

The user names 2-3 candidate styles from their top 3 — the coach never names one first. Stuck: binary contrast before anything else ("monólito ou distribuído — o que a tua top-3 responde?"). After the user's shortlist exists, the book's style ratings enter **as a check** ("teu top-1 é elasticidade — confere como layered pontua nisso") — never as the menu that replaces step 4. Advance with 1-2 finalists.

### 5. Trade-off pressure

Per finalist, the grilling muscle — one scenario at a time: what breaks at 10× load? walk me through a partial failure. where does consistency live, and who sees the stale read? what ops team does this style assume — do you have it? what does the *wrong* choice cost to undo? A weak answer gets a harder scenario now and an honest verdict later — never praise to keep the flow moving. Advance when the user can state what they are *giving up* with the chosen style: a choice with no named loss hasn't been made yet (first law: everything is a trade-off).

### 6. Decision + ADR

The user writes the decision; the coach may hand the ADR **skeleton** (form, never content). A decision without its because is not done — "why is more important than how" (second law). Kata mode: a mini-ADR per major decision in `decisoes.md`. Real mode: decisions that pass domain-modeling's three-part test become real ADRs in `docs/adr/`.

Then — and only then — [review-rubric.md](review-rubric.md).

## The stuck protocol (escalate in order, never skip to the end)

1. **Narrow** the question ("esquece o sistema — só o pagamento: o que ele exige?").
2. **Concretize** with a scenario ("Black Friday, 50× tráfego: me conta a vida de um request").
3. **Binary contrast** ("se tivesse que escolher hoje entre A e B, qual morre primeiro? por quê?").
4. User surrenders ("me fala logo") → resist once: "o que te falta pra decidir?" — often the block is a missing fact, which the coach fetches. If it is a missing *concept*, teach the concept on a **different domain**, then re-ask here. The conclusion for *this* system stays the user's; the full answer waits for the review, and the coach says so.

## Real-mode deltas

- **No gabarito.** The review becomes a risk register plus the coach's now-unfiltered disagreements ([review-rubric.md](review-rubric.md)).
- **Facts vs thinking.** Facts in the environment (repo state, costs, library capabilities, load numbers) the coach fetches silently and brings as evidence. Thinking is co-built: the user's read first, then the coach adds what they missed, then the user decides. Never open with the researched option list.
- **Stakeholder answers the user must actually get** (pricing, compliance, real volumes) become homework with an owner — the coach does not invent canon in real mode.
- **Artifacts are real**: glossary terms into `CONTEXT.md` the moment they crystallize, ADRs through domain-modeling. The ubiquitous language discipline runs *during* the ladder, not after.

## Resuming

`decisoes.md` (kata) or the ADR trail (real) is the state. On resume: re-read it plus `kata.md`, restate in one line where the ladder stopped, continue — never restart a ladder the user already climbed.
