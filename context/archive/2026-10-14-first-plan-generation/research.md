---
date: 2026-10-14T13:45:29Z
researcher: Claude Code (claude-sonnet-5-5)
git_commit: df7dcc2
branch: main
repository: 10xdevs
topic: "What does S-02 first-plan-generation need to build on: what the codebase already provides, and what external evidence says about the AI pipeline, structured output and long-running requests"
tags: [research, codebase, external, S-02, ai-pipeline, exercises, auth, nestjs, prisma, fly]
status: partial
last_updated: 2026-10-14
last_updated_by: Claude Code (claude-sonnet-5-5)
---

# Research: S-02 first-plan-generation, internal and external evidence

**Date**: 2026-10-14T13:45:29Z
**Researcher**: Claude Code (claude-sonnet-5-5)
**Git Commit**: df7dcc2 (working tree clean at start)
**Branch**: main
**Repository**: 10xdevs

## Research Question

`change.md` carries no intent text, so the question comes from `context/foundation/roadmap.md` S-02 (lines 106-117) and `prd.md` FR-004/FR-005/US-01: a signed-in user submits the plan form (experience, current/desired weekly frequency, height/weight, goals) and receives an AI-generated 8-week plan, drafted then refined in a second pass, using only catalog exercises; any pipeline failure or unusable output must surface as an error. Research covers (a) what the existing backend and frontend provide to build on, (b) which prior decisions bind S-02, and (c) external evidence on AI SDK options, structured output and long-running HTTP requests on Fly.io. It does not pick the AI provider, which roadmap.md:115 and :196 assign to the user.

## Summary

- **Greenfield for AI, well-prepared everywhere else.** Neither package declares an AI SDK, schema-validation library or any plan/form type (`backend/package.json` dependencies; grep over `frontend/src` for plan/experience/frequency found only the page title and an `<h1>`). The Prisma schema has two models, `Exercise` and `Profile`, and no plan model (`backend/prisma/schema.prisma:17-25, 32-38`).
- **The catalog is ready to be fed whole to a model.** 32 exercises (`backend/prisma/seed-data/exercises.json`), keyed by `slug` primary key, exposed by `ExercisesService.findAll()` (`backend/src/exercises/exercises.service.ts:9-11`), exported from its module and imported into `AppModule`. The compact projection without `imageKey` is 4,725 characters as minified JSON and 2,227 characters as `slug|name|muscle|equipment|level|category` lines (measured this session). The archived catalog plan states the catalog is "intended to be fed whole to the AI prompt" and defers validating that generated plans use only catalog exercises to S-02 (`context/archive/2026-10-04-exercise-catalog-seed/plan.md:48, 256, 313`).
- **A new gated endpoint needs no auth code.** `AuthGuard` is the global `APP_GUARD`, so any controller in a module imported into `AppModule` is gated unless marked `@Public()` (`backend/src/auth/auth.module.ts:13`, `auth.guard.ts:35-41`). `@CurrentUser()` yields `{ id, email, role }`; per `context/foundation/lessons.md:5-10`, authorization and any per-user limit must key on `user.id`, never email.
- **No request-validation stack exists.** `main.ts` has no `ValidationPipe`; `class-validator`, `class-transformer` and `zod` are absent from `backend/package.json`. S-02 must introduce one for the form body and, separately, a validation step for the model's output.
- **Biggest external finding: a multi-minute plain POST is at risk on Fly.** Fly staff, in community posts, describe a 60-second HTTP idle timeout that resets while bytes flow in either direction and cannot be changed on normal plans (secondary sources, see Open Questions). `fly.toml` sets no request timeout (`backend/fly.toml:10-18`), and `infrastructure.md` justified Fly by WebSocket support and never analyzed a long plain POST (`context/foundation/infrastructure.md:19, 40`). Roadmap splits streaming into S-03 (`roadmap.md:128`), but S-02's own transport is undecided and has to survive until then.
- **Structured-output tooling is mature across providers.** Vercel AI SDK v7 `generateText` with `Output.object({ schema })` returns a typed `result.output` and throws `NoObjectGeneratedError` on invalid output; it also accepts `timeout` and `maxRetries` (Context7, ai@7.0.0 docs, checked 2026-10-14). The Anthropic TypeScript SDK offers `messages.parse` with `zodOutputFormat`; OpenAI strict JSON-schema mode requires `additionalProperties: false` and every property in `required`.
- **Still open for the user:** provider and models (roadmap.md:196), plan JSON shape (not defined anywhere), the S-02 transport, and cost/abuse controls for an endpoint that spends money behind open, unverified-email sign-up.

## Detailed Findings

### Exercise catalog (F-01) as the pipeline's constraint set

- `Exercise` has `slug String @id`, `name`, `primaryMuscles String[]`, `equipment String`, `level ExerciseLevel` (BEGINNER/INTERMEDIATE/EXPERT), `category String`, `imageKey String`; `equipment`, `category` and `primaryMuscles` are free strings (`backend/prisma/schema.prisma:11-25`).
- `ExercisesService` has exactly one method, `findAll(): Promise<Exercise[]>`, ordered by slug ascending; no by-slug or by-slugs lookup exists (`backend/src/exercises/exercises.service.ts:9-11`). No controller exposes the catalog and nothing else under `src/` consumes the service (inspected: whole `backend/src`, per backend agent).
- Wiring: `ExercisesModule` imports `PrismaModule` and exports `ExercisesService` (`src/exercises/exercises.module.ts:6,8`); `AppModule` imports `ExercisesModule` (`src/app.module.ts:14`).
- Seed file: 32 records, each with exactly one primary muscle; category counts strength 31 and powerlifting 1; level counts beginner 26, intermediate 5, expert 1; equipment counts dumbbell 8, barbell 7, body only 7, machine 6, cable 4; 12 distinct primary muscles (quadriceps 4, shoulders 4, hamstrings 3, chest 3, biceps 3, triceps 3, abdominals 3, glutes 2, calves 2, lats 2, middle back 2, lower back 1). Counts computed from `exercises.json` by the backend agent; the record total of 32 and the prompt-size figures were re-measured by the primary agent.
- The database may differ from the JSON: the seed upserts and only warns about stale rows (`backend/prisma/seed.ts:101-108`), and seeding is a manual step (`prisma.config.ts:9`). The live row count was not queried.
- Slugs match `^[a-z0-9]+(-[a-z0-9]+)*$` (`catalog-plan:171`), which is what the plan expects S-02 to pass to the model and what S-05 will store (`catalog-plan:81`; `seed-data/README.md:61`).
- With 32 exercises covering 12 muscles at 1-4 exercises each, a 5-day weekly split over 8 weeks will necessarily repeat exercises heavily, and 26 of 32 are beginner level. This is an observation about content that bears on perceived plan quality (the riskiest assumption named at `roadmap.md:116`); it is not a code defect.

### Auth and the shape of a gated endpoint

- `AuthGuard` is registered as `{ provide: APP_GUARD, useClass: AuthGuard }` (`backend/src/auth/auth.module.ts:13`); `AuthModule` is imported by `AppModule` (`app.module.ts:15`). `@Public()` is used on exactly two controllers, `AppController` and `HealthController` (`src/app.controller.ts:5`, `src/health/health.controller.ts:10`).
- Token path: bearer header required (401 otherwise), `jose` verification against Supabase JWKS (issuer, audience `authenticated`, ES256/RS256), then `ProfilesService.resolve`; a Profile with `blockedAt` set gets 403 `Account is blocked`; JWKS/provider failures give 503 (`auth.guard.ts:43-60`, `supabase-jwt.verifier.ts:32-65`, `profiles.service.ts:10-42`).
- Gated-controller template: `@Controller('me')` with `@Get()` and `@CurrentUser() user: RequestUser`, no `@UseGuards` (`src/profiles/me.controller.ts:5-10`). Registration pattern: the controller is declared in a feature module (`profiles.module.ts:8`) that is reachable from `AppModule`.
- Errors use built-in Nest exceptions with fixed messages, no custom filter, no error-body contract (`health.controller.ts:21`, `supabase-jwt.verifier.ts`). Logging uses a per-class Nest `Logger` (`supabase-jwt.verifier.ts:25,44`).
- Lesson to carry: never authorize or key limits on email, only `Profile.id` (`context/foundation/lessons.md:5-10`). Sign-up is open with unverified email (`context/archive/2026-10-10-sign-up-and-login/plan-brief.md:59`, per archive agent), so any per-user quota is trivially evadable with new accounts; blocking is S-07 and not built.

### Backend conventions an S-02 module must follow

- Module style: feature module imports `PrismaModule`/other modules and exports its service; `AppModule` imports `ConfigModule.forRoot({ isGlobal: true })`, `PrismaModule`, `ExercisesModule`, `AuthModule` (`app.module.ts:10-20`). Relative imports carry a `.js` suffix (ESM, `module: nodenext`).
- `main.ts` (lines 4-12): CORS from `FRONTEND_URL` (comma-split, trimmed, trailing slashes stripped, default `http://localhost:5173`), listens on `PORT ?? 3000` at `0.0.0.0`. No global prefix, `ValidationPipe`, filters, interceptors, body-size or timeout configuration. Express's default JSON body limit is assumed, not verified; the S-02 request body (a small form) is unlikely to approach it.
- Env: `@nestjs/config` is installed and registered but no code injects `ConfigService`; code reads `process.env.*` directly (`main.ts:7,12`, `prisma.service.ts:12`, `jwks.provider.ts:9`). `jwks.provider.ts:8-34` shows the boot-time throw-on-missing/invalid pattern that auth review F1 made a lesson (`context/archive/2026-10-10-sign-up-and-login/reviews/impl-review.md:26-38`, per archive agent). `.env.example` names five backend variables (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `DIRECT_URL`, `FRONTEND_URL`); an AI key would be a sixth, set as a Fly secret (`infrastructure.md:110`).
- Prisma: runtime uses `DATABASE_URL` (Supabase transaction pooler) via `@prisma/adapter-pg`, CLI migrations use `DIRECT_URL` (`prisma.config.ts:12-15`, `prisma.service.ts:12`). Every new table needs `ENABLE ROW LEVEL SECURITY` appended by hand to its migration (`prisma/migrations/20261004181902_create_exercise/migration.sql:20-22`, `...create_profile/migration.sql:15-17`). Migrations are forward-only (memory + `catalog-plan:51`). Whether S-02 needs any table is a plan decision: roadmap assigns the persisted plan shape to S-05 (`roadmap.md:152`).
- Tests: Vitest, specs beside source, `Test.createTestingModule` with a mocked `PrismaService` (`src/exercises/exercises.service.spec.ts:9-20`); the guard spec signs real ES256 tokens with a local `jose` key (`src/auth/auth.guard.spec.ts:53-62`). The only e2e spec boots the full `AppModule` and calls the public `GET /`, which connects to the real DB and requires `SUPABASE_URL` (`test/app.e2e-spec.ts`; `prisma.service.ts:16-17`; `supabase-jwt.verifier.ts:29`). No precedent exists for testing a gated route end to end, and no AI mocks exist.

### Deployment constraints that touch a long AI call

- `backend/fly.toml`: `internal_port = 3000`, `auto_stop_machines = "off"` with a comment tying it to the no-fixed-max-wait requirement, `min_machines_running = 1`, health check `GET /health` every 15 s with 5 s timeout, VM `shared-cpu-1x` with 512 MB; no `concurrency` block and no request-timeout setting (lines 10-29, as read by the primary agent).
- `infrastructure.md` records: usage-based billing with no hard cap and a runaway retry loop as the cost risk, with mitigation "spend-alert/budget cap; retry-limit and circuit breaker in the AI pipeline's model-call logic" (`infrastructure.md:58, 62, 89`, per archive agent); single machine and single region assumed (`:66, :90`).
- The infra document cites a 100-minute HTTP timeout for Render and a 5-minute one for Railway and rejects Railway on that basis (`infrastructure.md:44, 48`), but gives no Fly request/idle figure, and its Fly rationale is WebSocket support (`:19, :40`). No transport (WebSocket, SSE, polling) has been decided for S-03; `roadmap.md:69` records "no streaming gateway".
- Frontend is a static Workers asset with no server code or secret store; it calls the API directly at `VITE_API_URL` with no proxy (`frontend/wrangler.jsonc`, `frontend/vite.config.ts:1-7`, `frontend/src/lib/api.ts:13`). An AI key therefore can only live on the backend.

### Frontend integration points

- Routing: `createBrowserRouter`; public `/sign-up`, `/sign-in`; gated routes are children of a pathless `RequireAuth` layout route whose only child today is index `/` rendering `HomePage` (`frontend/src/router/router.tsx:7-15`, `RequireAuth.tsx:4-17`). A new gated page is added to that `children` array.
- API client: `apiFetch(path, init?)` is a 14-line wrapper over `fetch` that attaches `Authorization: Bearer <access_token>` from `supabase.auth.getSession()` on each call (`frontend/src/lib/api.ts:3-13`). It sets no `Content-Type`, has no timeout/abort handling of its own (a caller can pass `signal`), returns the raw `Response`, and never throws on non-2xx.
- The only 401/403 handling lives inline in `HomePage` (403 calls `signOut('blocked')`, 401 calls `signOut()`; `frontend/src/pages/HomePage.tsx:33-41`). A second API caller would duplicate it unless extracted. No non-GET call, JSON body, select or radio input, or long-wait UX exists in the repo.
- UI: no component library (no PrimeVue/Tailwind in `frontend/package.json`); one global `index.css` with bare element selectors for `form`, `label`, `input`, `button`, utility classes `.hint/.status/.error/.banner`, and no `select`, `textarea`, `fieldset` or `legend` rules (`frontend/src/index.css:43-101`). Forms are controlled inputs with per-field `useState`, native HTML validation, `pending` boolean, `try/catch/finally`, fixed error copy in `<p className="error" role="alert">` (`SignInPage.tsx:25-58, 87-94`; `SignUpPage.tsx:77-82`).
- Style rules observed: arrow-function expressions only, named exports, `type` aliases, no comments, no semicolons, single quotes; `strict` off, `erasableSyntaxOnly` and `verbatimModuleSyntax` on; no test framework (`frontend/tsconfig.app.json:2-24`, `frontend/.oxlintrc.json:3-7`). This matches memory notes "prefer function expressions" and "no code comments".

### External evidence (checked 2026-10-14)

Provider choice is an open user decision, so the options below are compared on capability, not recommended.

- **Vercel AI SDK v7** (Context7 `/vercel/ai/ai_7.0.0`): `generateText({ model, output: Output.object({ schema }), prompt })` returns `result.output`; invalid output throws `NoObjectGeneratedError` carrying `text`, `cause`, `response`, `usage`. `generateText` accepts `maxRetries`, `timeout`, `maxOutputTokens`, `temperature`, and namespaced `providerOptions` (for example `openai.reasoningEffort`, `anthropic.thinking`). One call site can use different models per pass, which fits draft-then-review. Uses `zod`.
- **Anthropic TypeScript SDK** (Context7 `/anthropics/anthropic-sdk-typescript`): `client.messages.parse({ model, max_tokens, messages, output_config: { format: zodOutputFormat(Schema) } })` returns `parsed_output`; `jsonSchemaOutputFormat` accepts raw JSON Schema; request options include `maxRetries`. Example model id in the docs is `claude-sonnet-5-5`. Secondary sources conflict on whether numeric and array-length constraints are enforced by the API or only client-side (sources: [mer.vin](https://mer.vin/news/json-schema-limits-claudes-structured-outputs-wont-enforce/), [AWS Bedrock structured output](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.md)); Anthropic's own page was not fetched.
- **OpenAI structured outputs** (Context7 `/websites/developers_openai`): `response_format`/`text.format` of type `json_schema` with `strict: true` requires `additionalProperties: false` on each object and every property listed in `required`, with optional fields expressed as nullable; only a subset of JSON Schema is supported in strict mode.
- **Implication independent of provider:** any of the three still needs an application-side check that every exercise slug in the output exists in the catalog, because JSON-schema structure does not encode catalog membership unless the slug list is injected as an `enum`. Whether an enum of 32 slugs is accepted and reliably enforced by a given provider was not verified.
- **Fly.io idle timeout** (secondary, Fly community staff replies: [60-second timeout](https://community.fly.io/t/60-second-timeout-for-http-server/1243), [request timeouts](https://community.fly.io/t/request-timeouts-on-fly-io/5653), [streaming and autostop](https://community.fly.io/t/autostop-is-causing-problems-for-my-streaming-web-api/27014)): connections with no bytes in either direction for 60 s are closed; sending bytes keeps them open; staff suggested early response bytes or a 202-and-poll job pattern. No official Fly documentation page was found confirming this, and the posts range from 2023 to 2025.

## Code References

- `backend/prisma/schema.prisma:11-25` - `ExerciseLevel` enum and `Exercise` model (slug PK)
- `backend/prisma/schema.prisma:32-38` - `Profile` model (uuid id = JWT sub, `blockedAt`)
- `backend/src/exercises/exercises.service.ts:9-11` - `findAll()`, the only catalog accessor
- `backend/src/exercises/exercises.module.ts:6,8` - imports `PrismaModule`, exports service
- `backend/src/app.module.ts:10-20` - module wiring, global `ConfigModule`
- `backend/src/auth/auth.module.ts:13` - global `APP_GUARD`
- `backend/src/auth/auth.guard.ts:35-60` - public check, token verify, profile resolve, 403 on blocked
- `backend/src/profiles/me.controller.ts:5-10` - gated controller template
- `backend/src/main.ts:4-12` - CORS, port, no pipes/filters
- `backend/src/auth/jwks.provider.ts:8-34` - boot-time env validation pattern
- `backend/fly.toml:10-29` - Fly service, VM, checks; no request timeout
- `backend/prisma/seed-data/exercises.json` - 32 catalog records
- `frontend/src/lib/api.ts:3-13` - `apiFetch`
- `frontend/src/router/router.tsx:7-15` - routes and `RequireAuth` layout
- `frontend/src/pages/HomePage.tsx:33-41` - the only 401/403 handling
- `context/foundation/roadmap.md:106-117` - S-02 definition and open provider question
- `context/foundation/infrastructure.md:19,40,58,62,89` - Fly rationale, cost risk, retry-limit mitigation

## Architecture Insights

- Fail-closed global auth means S-02's security work is not "add a guard" but "decide per-user abuse controls", because the endpoint spends money and sign-up is open with unverified email.
- The catalog was deliberately designed for this slice: slug identity, no pagination, whole-catalog prompt, and an explicit hand-off of output validation to S-02. Following that design means the validation layer (schema check plus slug-membership check against `findAll()`) is in-scope for S-02, not a later hardening step.
- The repository's stated guardrail is "never present a broken plan as success" (`prd.md` Guardrails, US-01 acceptance criteria). That maps to two separate failure classes the code must distinguish: provider/transport failure (analogous to the auth 503 vs 401 distinction in the auth plan review) and unusable model output (schema or catalog violation).
- The backend reads env directly and validates at boot; an AI key and model-name settings fit that style without introducing `ConfigService`.

## Historical Context (from prior changes)

- `context/archive/2026-10-04-exercise-catalog-seed/plan.md:48` - validating generated plans against the catalog is explicitly deferred to S-02 (supported by `catalog-plan:256, 313`).
- `context/archive/2026-10-04-exercise-catalog-seed/plan.md:42` - secondary muscles, force/mechanic and instructions were left out and can be added "via a later migration if S-02 needs them" (supported; S-02 may or may not need them).
- `context/archive/2026-10-10-sign-up-and-login/plan.md` and `reviews/` - fail-closed guard, 403 for blocked profiles even with live JWT, boot-time config validation, provider outage must not look like an invalid token. Applicable to an AI provider outage distinction (supported by archive agent's reading; not re-read by the primary agent).
- `context/foundation/roadmap.md:128` - S-02 and S-03 were split so a pipeline problem and a streaming problem can be diagnosed separately (supported).
- `context/foundation/infrastructure.md:62` - the pre-mortem predicts a retry loop inflating the bill and a pipeline running past 15 minutes dropping a WebSocket silently (supported as a recorded risk; no load test exists).
- The archive agent could not recover the F-01 "image source" deviation because the archived catalog folder holds only `change.md`, `plan-brief.md`, `plan.md`; `lessons.md:13` references it (partial: referenced, not recoverable).

## Related Research

None found under `context/changes/**/research.md` or `context/archive/**/research.md` (inspected: both archived changes and `context/changes/bootstrap-verification`; no `research.md` present).

## Open Questions

Decisions for the user (settle in or before `/10x-plan`):

1. **Provider and models for draft and review passes** (roadmap.md:196). Must be settled before implementation; drives the SDK choice and the secret name.
2. **Plan output contract.** No document defines weeks, days, sessions, sets, reps, rest or notes, nor the semantics of "current vs desired" frequency, nor output language (the user is Polish; not mentioned anywhere). The contract also becomes S-05's persistence shape.
3. **S-02 transport.** Options evidenced above: single long POST (needs bytes flowing or it risks the Fly 60 s idle cut), or 202-and-poll, or a minimal stream. Whether S-02 should already pick a shape that S-03 can extend is a planning choice.
4. **Abuse and cost controls** for the new endpoint: per-user concurrency/quota keyed on `Profile.id`, token and retry caps, spend alert on the provider account. None specified beyond infra.md:89's retry-limit/circuit-breaker note.
5. **Does S-02 persist anything?** Roadmap leaves persistence to S-05; a transient in-memory plan means a refresh loses the result until S-04/S-05 land.

Evidence gaps (did not verify):

- Fly's idle-timeout behavior rests on community staff posts, not official docs, and was not tested against this app.
- The live database row count of `Exercise` was not queried.
- Whether each provider accepts a 32-value slug `enum` and enforces it was not verified.
- Anthropic's own structured-output page was not read; constraint-enforcement claims above are secondary.
- `.env*` files were not read (permission rules), so real `VITE_API_URL` and `.env.example` contents beyond variable names are unknown; CI workflows exist under `.github/workflows/` (`deploy-backend.yml`, `deploy-frontend.yml`) but were not read, so whether migrations run in CI is unknown.
- Express default body limit is assumed, not read from source.
