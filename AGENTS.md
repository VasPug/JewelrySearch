# Repository Design Workflow

This product uses the globally installed Intent and Impeccable skill packages for user-facing design work.

## Required skills

- Intent: `ghaida/intent` (`intent` plus its routed UX skills)
- Impeccable: `pbakaus/impeccable` (`impeccable`)

If either package is unavailable, install it before substantial UX or visual-interface work:

```sh
npx skills add ghaida/intent --all -g -y
npx skills add pbakaus/impeccable --all -g -y
```

## Routing

For a new surface, redesign, or meaningful user-facing behavior change:

1. Use `intent` first to make the user, job, constraints, evidence, ethics, and success criteria explicit. Route to the smallest relevant Intent skill such as `journey`, `organize`, `wireframe`, `articulate`, `evaluate`, `fortify`, `include`, or `specify`.
2. Once the experience direction is resolved, use `impeccable` for the visual world, frontend implementation, responsive behavior, interaction states, and bounded visual QA.
3. Keep design rationale traceable to product evidence or a clearly labeled assumption.
4. Verify the implemented interface in the browser at desktop and mobile widths. Run relevant tests, lint, and the production build.

For an existing interface that needs improvement:

1. Start with Intent's `evaluate` when the problem is unclear or broad.
2. Route structural findings to the appropriate Intent skill.
3. Use Impeccable's scoped command for execution (`polish`, `layout`, `clarify`, `adapt`, `harden`, or another matching playbook).
4. Re-evaluate once after implementation; do not create an open-ended polish loop.

For a small, explicit visual tweak inside the established system, skip the full Intent context protocol and use the narrowest Impeccable workflow. Skip both packages for backend-only changes with no UX impact.

## Sources of truth

- `PRODUCT.md` records durable product truth: users, jobs, capabilities, constraints, evidence, principles, and accessibility needs.
- `DESIGN.md` records the incumbent visual system after it has been intentionally documented with Impeccable.
- Code remains the authority for current behavior when documentation and implementation disagree; report the drift rather than silently rewriting product or design context.

## Product UX guardrails

- Keep chat as the dominant control surface, while preserving visible structured criteria, scoring equations, evidence, memory, and exports as the product system underneath it.
- Do not require users to invent scoring weights. Let the system propose changes, explain them, and keep them inspectable and reversible in advanced controls.
- Preserve user autonomy: AI recommendations remain explainable and the human makes the final lead decision.
- Show evidence and uncertainty; never present model judgment as verified fact.
- Make running, cancelled, exhausted, failed, and partial-result states visibly distinct and recoverable.
- Keep irreversible or destructive actions proportional, explicit, and preferably reversible.
- Treat accessibility, keyboard navigation, responsive behavior, and clear error recovery as baseline requirements.
- Never fabricate customer evidence, performance claims, research findings, or model accuracy.
