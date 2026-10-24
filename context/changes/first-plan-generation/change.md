---
change_id: first-plan-generation
title: First plan generation
status: implemented
created: 2026-10-14
updated: 2026-10-24
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-10-24 quality evaluation (deployed stack, `gpt-6-luna` for both passes, 3 profiles):
  - Profiles: expert 5 to 5, beginner 2 to 4, intermediate 3 to 5. Sessions per week were 5,5,5,5,5,5,5,5 / 2,2,3,3,3,4,4,4 / 3,3,4,4,4,5,5,5; the frequency ramp held in all three with no step larger than one.
  - Time and cost (six jobs in the retained Fly logs, profile mapping inferred from output size): 61 to 104 s per job for draft plus review, 6,730 to 9,664 input tokens and 7,906 to 14,183 output tokens per job. Every pass ended `finishReason=stop` on attempt 1, with no retries and no validator rejections. At the `gpt-5.6-luna` list price ($0.10 in, $0.60 out per million tokens; `gpt-6-luna` pricing not verified) the largest job is about 1 cent.
  - Content: sensible per level (beginner light 2-set full-body work, intermediate full body then upper/lower then a five-day split, expert upper/lower with a week 4 deload). Weakness: after the last frequency change the weeks repeat. Beginner and intermediate weeks 6 to 8 are identical apart from plank durations and notes, and the expert's squat is `4 x 5-6` in weeks 1 to 3 and week 6; progression is described in notes more than prescribed. Expert plan used 23 distinct catalog exercises, with Incline Dumbbell Press and Seated Cable Rows in two sessions each week. Only the expert plan has a deload.
  - Review pass: contribution not measurable because the draft is not stored; review output is about the same size as the draft.
  - Decision: keep `gpt-6-luna` for both passes. Week-to-week repetition is a prompt issue (require explicit week-over-week progression), to handle in a follow-up change before reconsidering a stronger `PLAN_REVIEW_MODEL`.
- 2026-10-24: Plan jobs and the per-user limiter are in memory per machine. Fly app `gym-training-plan-generator-api` has a second machine that is stopped; if it is started, polls can land on the wrong machine (404 for a running job) and the limits can be bypassed. Keep it stopped or run a single machine until jobs and counters move out of memory.
