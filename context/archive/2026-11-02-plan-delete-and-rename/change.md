---
change_id: plan-delete-and-rename
title: Delete a saved plan and give it an editable title
status: archived
created: 2026-11-02
updated: 2026-11-23
archived_at: 2026-11-23T15:04:00Z
---

## Notes

Let the owner delete a saved plan (SavedPlansPage list and SavedPlanPage, with confirmation; DELETE /saved-plans/:id owner-only, 404 for others) and give a saved plan an optional editable title (nullable column via a forward-only migration, PATCH /saved-plans/:id, shown in list and plan view). Today saved plans only support save, list and view. Exercise-level editing (PRD FR-008) is out of scope and deferred.
