---
change_id: exercise-catalog-seed
title: Seed a minimal curated exercise catalog with images
status: implementing
created: 2026-10-04
updated: 2026-10-04
archived_at: null
---

## Notes

from @context/foundation/roadmap.md — roadmap item F-01 (foundation, Stream A, M-1). GitHub issue: https://github.com/JakubBrandys/gym-training-plan-generator/issues/1

Outcome: a small curated set of exercises, each with an image, exists in the data store and can be queried by the plan generator; it is not the full catalog. PRD refs: FR-011, US-01. Unlocks S-02 (#3) and S-04 (#5).

Open roadmap questions touching this change:
- Where do the exercise images come from (self-made, licensed, generated)? Not blocking: the seed can start small and grow.
- How large must the catalog be before M-1 closes (minimal seed vs the PRD's ~50–150)? Blocks F-01 scope — settle during `/10x-plan`.
