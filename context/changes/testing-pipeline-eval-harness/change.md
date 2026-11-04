---
change_id: testing-pipeline-eval-harness
title: Pipeline eval harness for plan quality (test-plan Phase 4)
status: impl_reviewed
created: 2026-11-04
updated: 2026-11-04
archived_at: null
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "Pipeline eval harness (AI-native)".
Risks covered: #7. Test types planned: on-demand eval: deterministic checks first, LLM judge for the personalisation rubric only.
Risk response intent:
- #7: a prompt or pipeline change that makes the real model emit more invalid or less personalised plans shows up before merge as a pass rate over a small fixed set of inputs; a fake-model unit test says nothing about prompt quality and one good sample is not evidence; deterministic validity checks run first and an LLM judge is used only for the personalisation rubric, never over what a validator already catches, and model text is not snapshotted.
After creating the folder, follow the downstream continuation rule.
