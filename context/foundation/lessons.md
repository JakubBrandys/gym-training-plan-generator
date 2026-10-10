# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Never authorize by email — key access on Profile.id

- **Context**: Any change touching auth, roles, permissions or invites (backend/src/auth, backend/src/profiles) while Supabase 'Confirm email' is off.
- **Problem**: Profile.email comes from an unverified sign-up: anyone can register another person's address, so an email-based check can be satisfied by an impostor (and 'User already registered' leaks which emails exist).
- **Rule**: Never authorize, grant a role, or designate an admin based on email; key every access decision on Profile.id (the verified JWT sub).
- **Applies to**: plan, plan-review, implement, impl-review
