---
change_id: testing-access-control-and-abuse-limits
title: Testing access control and abuse limits
status: implementing
created: 2026-11-04
updated: 2026-11-04
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Access control and abuse limits".
Risks covered: #6, #5. Test types planned: integration route table, parallel-request limit test, injection fixture.
Risk response intent:
- #6: a blocked profile is refused on every gated route, including with a still-valid token; a block takes effect immediately; a half-applied block is visible, not silent.
- #5: instruction-laden goals text cannot produce output that violates catalog or structure rules because output validation still gates; the N+1th parallel generation is refused; behaviour of the limit across a restart is known.
After creating the folder, follow the downstream continuation rule.
