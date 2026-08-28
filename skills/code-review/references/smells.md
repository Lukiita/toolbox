# Smell baseline — Reviewer B

Twelve Fowler smells (*Refactoring*, ch. 3), each as **what it is → how to fix**.
Apply them to what the diff **introduces**, never to what was already there. Two
rules bind the list:

- **A written repo rule wins.** What `AGENTS.md`/`CLAUDE.md` endorses is not a
  smell, even where this list would flag it.
- **Always a judgement call, never a hard violation.** Label it "possible Feature
  Envy" and quote the hunk. Skip what lint and typecheck already catch.

- **Mysterious Name** — a function, variable or type whose name does not reveal
  what it does or holds. → Rename it; if no honest name comes, the design is
  murky.
- **Duplicated Code** — the same logic shape in more than one hunk or file of the
  change. → Extract the shared shape and call it from both.
- **Feature Envy** — a method that touches another object's data more than its
  own. → Move the method next to the data it envies.
- **Data Clumps** — the same few fields or parameters always travelling together
  (a type wanting to be born). → Bundle them into one type and pass that — in
  this house, a value object.
- **Primitive Obsession** — a primitive or string standing in for a domain
  concept that deserves its own type. → Give the concept a small type (`Money`,
  `Cpf`, a typed id).
- **Repeated Switches** — the same `switch`/`if` cascade over the same type,
  recurring across the change. → Polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many
  files of the diff. → Gather what changes together into one module.
- **Divergent Change** — one file or module edited for several unrelated reasons.
  → Split it: one reason to change per module.
- **Speculative Generality** — an abstraction, parameter or hook for a need the
  spec does not have. → Delete it; inline back until a real need shows up.
- **Message Chains** — a long `a.b().c().d()` walk the caller should not depend
  on. → Hide the walk behind one method on the first object.
- **Middle Man** — a class or function that only delegates onward. → Cut it and
  call the real target directly.
- **Refused Bequest** — a subclass or implementer that ignores or overrides
  almost everything it inherits. → Replace inheritance with composition.

List in this shape from mattpocock/skills `code-review` (MIT), 2026-08-27.
