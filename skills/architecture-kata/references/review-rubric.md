# The review — where the answer finally lives

Runs when the user **commits** the design — or explicitly abandons (then review what exists; abandoning is also data). Never mid-ladder. The ladder's silence was paid for by this moment's honesty: soften nothing. Format is TDAH-friendly: the verdict table first, prose after, one theme to reread at the end.

## Kata mode — graded against gabarito.md

Per-step verdict — `solid` / `gap` / `miss` — plus one line of why, citing the evidence:

| Step | The question the verdict answers |
|---|---|
| Drivers | Did they find who pays and what kills the business — or architect for a fantasy? |
| Characteristics | Found the gabarito's dominants? Caught the implicit one? Is the top-3 *defended with sentences from the kata* (a defensible alternative ranking is `solid`, not `miss` — grade the defense, not conformity)? |
| Components & quantum | Domain-named components? Quantum count with a because, or fashion? |
| Style | Did the shortlist contain the fit? **Did they take the trap?** |
| Trade-offs | Losses named unprompted, or only under pressure? Anything material never surfaced? |
| Decision/ADR | Does the ADR carry the because a stranger could follow in a year? |

Then, in order:

1. **The trap, disclosed** — what it was, why it seduces, whether it worked.
2. **What a senior would do** — now the coach architects, fully and concretely, as contrast material. This is the one moment the skill hands over a design; it lands only against the user's own attempt, which is what makes it teach.
3. **House-canon check** — where the design touched structure, check it against the user's global AGENTS.md canon: package by feature, cross-feature imports through the public API only, connascence (strong forms converted to weak; distance demands weaker forms), the cohesion ruler. Cite the canon; don't restate it.
4. **One theme to reread** — by *theme*, not chapter number (editions renumber): modularity, characteristics identification, the specific style, or decision-making. One, not a list.
5. **Next kata's focus** — built from the weakest step; carried into the next generation's calibration.

Write it to `katas/<slug>/review.md`.

## Real mode — no gabarito, so the review changes shape

1. **Risk register** — per major decision: what would prove it wrong, and the *earliest cheap signal* to watch for. A decision without a falsifier is a belief.
2. **What I'd challenge** — the coach's honest disagreements, held back all ladder, stated plainly now, each with its scenario. Disagreement withheld here is sycophancy with extra steps.
3. **Postponed decisions** — the deliberate deferrals, each with the trigger that reopens it ("revisit when >N tenants"). Deferring is a decision; undated deferring is drift.
4. **ADR audit** — every decision that passes domain-modeling's three-part test has its ADR, and every ADR carries the because. Practice never wrote to `docs/adr/`; real mode always does.

The register and challenges live in the conversation; anything worth keeping goes where the project keeps memory (an ADR's consequences section, or `docs/`), through the user's call.
