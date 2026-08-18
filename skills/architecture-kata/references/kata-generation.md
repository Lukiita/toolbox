# Generating a kata

A kata is a business asking for a system — never a tech spec. The learning is in extracting architecture from mush, so the mush is deliberate.

## Anatomy (write kata.md with exactly these sections)

- **Título** — evocative, names the business, not the tech.
- **Descrição** — 2-4 paragraphs in the *client's voice*: what the business does, why now, what success looks like. Vague and occasionally contradictory on purpose — clients are.
- **Usuários** — who, and **with numbers** where scale drives anything: counts, growth, seasonality, geography ("3 000 lojistas hoje, dobrando ao ano; pico 8× no Natal").
- **Requisitos** — 7-12 functional bullets, business-worded, non-exhaustive.
- **Contexto adicional** — 2-4 juicy constraints: budget, deadline, team size/skill, legacy to coexist with, regulation, politics ("o CEO voltou de um evento falando em microservices").

## The hidden key — gabarito.md, written at generation time

Generate the answer key **with** the kata and save it immediately (it must survive session breaks; the file opens with a spoiler warning). It contains:

- the 2-3 **dominant characteristics** the scenario actually stresses, each with the sentence in the kata that evidences it;
- one **implicit characteristic** never stated but implied (security, compliance, a availability floor — the book's point: clients don't say these);
- a defensible **top-3 ranking** (not the only one — note which alternatives are also defensible);
- the **style(s) that fit** the top-3 and the one-line why, per the book's style ratings;
- **the trap**: the seductive wrong answer and *why* it seduces (the red-herring requirement that looks architectural but isn't driving, the fashionable style the constraints actually forbid);
- what a **senior would sketch** — 5-8 lines, enough to grade against, not a full design.

The review is graded against this file. Nothing in it leaks before the review — not as a hint, not as a leading question so pointed it gives the answer away.

## Calibration knobs (ask only if the user didn't say)

- **Focus** — a characteristic to practice ("um que estressa elasticidade"), a style ("onde a resposta certa é monólito modular"), or a judgment ("quando NÃO distribuir"). The kata is built backwards from the focus; the focus goes in the gabarito, never in the statement.
- **Difficulty** — 1: characteristics near-explicit, one clearly best style. 2: conflicting drivers force a real ranking. 3: implicit characteristics, political constraints, and a strong trap. Default: one level above the last review's weakest step.
- **Domain** — rotate away from recent katas and from the user's day-job domains most of the time (unfamiliarity forces the questions phase to matter); occasionally land near a real domain for transfer.

## The client Q&A phase

Present the kata, then open the floor: the user interrogates the client before architecting — that is half the skill. The coach roleplays the client: answers in character, invents details **consistent with the gabarito**, and appends every invented fact to `kata.md` under `## Respostas do cliente` so it becomes canon for the rest of the kata. A client may be uncertain ("não sei, o financeiro que sabe") when uncertainty is realistic — handling missing information is part of the exercise.

When the questions dry up, hand over to [coaching-method.md](coaching-method.md) — the ladder starts at business drivers.

## Calibration examples (inspiration, never copies)

Silicon Sandwiches and Going, Going, Gone (the book's own katas) set the tone and size; architecturalkatas.com (Neward) has dozens more. Generate fresh ones — a kata the user may have read grades comprehension, not judgment.
