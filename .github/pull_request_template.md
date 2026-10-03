## Goal

<!-- What user or business problem does this change solve? -->

## Success metric

<!-- What observable result means the change worked? -->

## Risk class

- [ ] L0 — documentation/copy only
- [ ] L1 — small and reversible behavior
- [ ] L2 — multi-file generation, SEO semantics, or deployment behavior
- [ ] L3 — credentials, personal data, schema, history, concurrency, or irreversible operation

**Owner review required:** <!-- yes/no and why -->

## Non-goals

<!-- Explicitly state what this PR will not solve. -->

## Smallest viable change

<!-- Describe the simplest implementation that could satisfy the goal. -->

## Proposed implementation

<!-- Explain the selected implementation and why it is proportional. -->

## Complexity budget

- Expected files changed:
- Expected implementation size:
- New dependencies:
- New persistent state, journal, mutex, queue, or schema:
- Expected operational burden:

## Alternatives and trade-offs

<!-- Include the minimal option and any hardened option. -->

## Scope-expansion gate

- [ ] Actual scope remains within the complexity budget.
- [ ] No new state machine, journal, mutex, queue, schema, or destructive operation was introduced unexpectedly.
- [ ] Any expansion is documented below and has owner approval before further implementation.

**Expansion decision:**

## Verification

### Focused checks

- [ ] Relevant unit/integration tests pass
- [ ] Failure-path or regression test added where appropriate

### Final checks

- [ ] Full canonical suite passes
- [ ] Generated output is deterministic where applicable
- [ ] Diff contains no credentials, personal data, or private operations information
- [ ] Deployment/live verification plan is documented

## Rollback

<!-- State the exact reversible action or explain why rollback is not applicable. -->

## Publication and privacy review

- [ ] Safe for a public repository
- [ ] No credentials or customer information
- [ ] No private filesystem paths or internal schedules
- [ ] No account quota/token information
- [ ] Public claims are supported by public-safe evidence

## Independent review

<!-- Summarize blocking findings and their disposition. Avoid repeated review loops; architecture should be reconsidered after recurring blockers. -->

## Owner decision

- [ ] Approved for merge
- [ ] Changes requested
- [ ] Return to the minimal option
- [ ] Close without merge

**Owner comment or decision link:**

## Post-merge measurement

<!-- Specify the metric, observation window, and checkpoint. Successful deployment is not automatically successful product impact. -->
