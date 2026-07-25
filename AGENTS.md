# AGENTS.md — Multi-Agent Coordination Contract

**READ THIS FIRST, before editing anything.** This repository is built by **many AI agents working concurrently in the same working tree** — often spawned from *different* Claude sessions that do **not** share memory, task lists, or context with each other. The filesystem + git are the *only* shared coordination medium. These rules are mandatory. Violating them corrupts other agents' in-flight work.

If you are a human, this still applies to any agent you launch here.

---

## 0. The one-paragraph version

Pick a task from `docs/plan-part1.md`..`part3.md`. **Claim it** by atomically creating a claim file under `.agent-coordination/claims/` (see §3). Only touch the files in *your* task's **Files** list. Never edit a **frozen file** (§2). Never `git add -A` / `git add .` — stage only your own paths (§4). Scope your tests to your own files (§5). When done, commit your own files and **release** your claim. If a file you need is already claimed by a live agent, do a different task or wait — never overwrite their work.

---

## 1. Work is partitioned by task, and tasks own disjoint files

The implementation plan (`docs/plan-part1.md`, `docs/plan-part2.md`, `docs/plan-part3.md`) defines **22 tasks in 6 dependency waves**. Every task has an explicit **Files** list and the file sets are **disjoint by construction** — so if every agent stays inside its own list, there are zero conflicts.

- **Only create/edit files in your task's `Files` list.** Nothing else. Not "just a quick fix" to a neighboring file.
- If your task genuinely seems to need a change to a file another task owns, that is a **plan/coordination issue** → stop, write a note in `.agent-coordination/NOTES.md`, and surface it to the orchestrator/human instead of editing across the boundary.
- The per-task file-ownership map is in `docs/plan-part1.md` under "File-ownership map (who creates what)".

## 2. Frozen files — NEVER edit these

These are created once and depended on by everything. Editing them breaks other agents:

- Root & workspace: `package.json`, `package-lock.json` (no new deps, ever)
- `server/src/app.js`, `server/src/db.js`, `server/src/config.js`
- `server/src/plugins/auth.js`, `server/src/lib/errors.js`
- `server/src/migrations/*.sql` — **any already-applied migration.** Editing one is a no-op on
  every database that already ran it, so the schema silently diverges per environment. Schema
  changes during the original 22-task build were a plan bug; post-build, add a **new** numbered
  migration (`004_*.sql`, …) — `migrate.js` applies them in filename order and records each in
  `_migrations`. Existing rows must be backfilled by that same migration (see `002`/`003`).
- `web/src/router.js`, `web/src/api/client.js`, `web/src/App.vue`, `web/src/assets/main.css`

If you think you need to touch one, you're almost certainly misreading your task. Stop and escalate via `.agent-coordination/NOTES.md`.

## 3. Claim protocol (the coordination mechanism)

Before doing any work on a task, **claim it**:

1. Choose a unique agent id: `${short-purpose}-${random6}` (e.g. `t14-trip-ui-a1b2c3`).
2. Create your claim file **with `set -o noclobber`** so the create is atomic and fails if someone already claimed it:
   ```bash
   ( set -o noclobber; cat > .agent-coordination/claims/T14.claim <<EOF
   task: T14
   agent: t14-trip-ui-a1b2c3
   session: <your session id or "unknown">
   started: $(date -u +%FT%TZ)
   files:
     - web/src/views/TripsListView.vue
     - web/src/stores/trips.js
     # ... every file you will write
   status: in_progress
   EOF
   ) || echo "T14 already claimed — pick another task"
   ```
3. If the claim file already exists, **read it**. If `status: in_progress` and `started` is recent (< 30 min) → that task is taken; pick another. If it's stale (see §6) you may take it over (append a `takeover:` line noting why).
4. When finished (files written, your scoped tests green, committed): set `status: done` in the claim (or delete it) so the task is visibly complete.

Claim files are committed to git so agents in other sessions see them after a `git pull`/in the shared tree. Keep them tiny.

## 4. Git discipline

- **Never** `git add -A`, `git add .`, or `git commit -a`. Those stage other agents' half-written files. **Stage only your task's explicit paths**: `git add server/src/routes/foo.routes.js server/test/foo.test.js`.
- One logical commit per task; use the commit message the plan specifies for that task.
- **Never** run history/tree-destroying commands: no `git reset --hard`, `git checkout -- <file>` on files you don't own, `git clean -fd`, `git stash` of the whole tree, `git rebase`, or `git push --force`. These silently delete other agents' uncommitted work.
- If an orchestrator is managing commits (check `.agent-coordination/NOTES.md`), **do not commit at all** — just leave your files written and your scoped tests green, and let the orchestrator stage your paths.
- Prefer isolation when available: a **git worktree** or branch per task (`git worktree add .worktrees/T14 -b wave3/t14-trip-ui`) removes even the theoretical race. Merge back in task-number order; disjoint files → conflict-free.

### 4.1 Commit at checkpoints (not one giant commit at the end)

Commit **incrementally, per checkpoint**, so work is durable and other agents/humans can see progress — never leave a large amount of finished work uncommitted.

- A **checkpoint** = a self-contained, green step. Natural checkpoints: (a) tests written & failing, (b) implementation green, (c) task complete. At minimum commit once per task when its scoped tests pass.
- Each checkpoint commit stages **only your own paths** (§4) and leaves the scoped tests green — never commit a red/broken checkpoint.
- Commit message convention: start with the task id, e.g. `feat(T14): trip wizard + detail views` or `test(T14): failing store tests`. Use the exact message the plan gives for the task's final commit.
- The **orchestrator** commits at **wave checkpoints**: after each wave it runs the full suite/build, then makes one commit per task (in task-number order) — this is the integration checkpoint. If an orchestrator is active (see `.agent-coordination/NOTES.md`), individual agents skip committing and let it checkpoint instead.
- Never bundle multiple tasks into one commit; keep the history one-checkpoint-per-logical-step so any point is a working, bisectable state.

## 5. Testing under concurrency

- The **full** suite and full build **will show transient failures** while siblings are mid-edit (a half-written view breaks `vite build`; an unfinished route breaks the server suite). That is expected and is **not your bug**.
- **Scope your test run to your own files**, e.g. `npm test --workspace=server -- <yourname>` or `npm test --workspace=web -- <yourstore>`.
- Do **not** run `npm run build` (whole-web compile) during a wave — the orchestrator runs it once after the wave completes.
- Tests use isolated temp DBs (`makeTestApp()`), so concurrent server test processes don't collide. The mock LLM queue is anchored on `globalThis`; still call `clearMocks()` in `beforeEach` for hygiene.

## 6. Staleness & takeover

An agent can die mid-task. A claim is **stale** if `status: in_progress` AND (`started` > 30 min ago) AND there is no corresponding commit. Before taking over a stale task: check `git log` for partial work, run the task's scoped tests to see current state, finish/repair rather than blindly overwrite, and append a `takeover:` note to the claim.

## 7. Handling API / context-length errors ("prompt too long")

Large tasks can blow an agent's context and trigger API errors (e.g. `Prompt is too long`) mid-work, leaving files half-written. Defend against it:

- **Split the work across multiple requests/steps.** Don't try to emit one enormous file (or many files) in a single response. Write one file, run its scoped test, commit that checkpoint (§4.1), then move to the next. Small, sequential steps keep context bounded and make progress durable.
- **Read narrowly.** Read only your task section + the specific contract files listed for you — never re-read whole plan files or large sources repeatedly. Re-reading is the #1 cause of context blowup here.
- **Prefer targeted edits over re-emitting whole files.** Use string-replace/patch edits instead of rewriting a large file from scratch.
- If you still hit the error, **stop cleanly**: leave whatever is committed intact, append a `partial:` note (what's done, what remains, which files) to `.agent-coordination/NOTES.md` and to your claim, and let a fresh agent resume from that checkpoint. A resuming agent should `git log`/run scoped tests to see the current state before continuing, and finish the remainder in small steps.
- Orchestrators: when re-spawning after such a failure, hand the new agent a **narrower** slice (e.g. "only the store + its test", then "only the views") rather than the whole task again.

## 8. Escalation

Anything you can't resolve inside your task boundary — a needed cross-file change, an ambiguous contract, a suspected plan bug, a file claimed-but-broken — goes in `.agent-coordination/NOTES.md` (append-only, timestamp + agent id + one paragraph). Do not "fix" it by reaching into another task's files.

---

**Summary of hard rules:** stay in your Files list · never edit frozen files · claim before you work · `git add` only your paths · never destructive git · scope tests to your files · escalate, don't cross boundaries.

## 9. Phase-2 amendments (usability/PrimeVue — 2026-07-19)

- Active plan: `docs/superpowers/plans/2026-07-19-tripper-usability-primevue.md` (tasks U1–U14, waves 0–3). Its File Ownership Map is authoritative for this phase.
- §2 frozen list AMENDED: `web/src/main.js`, `web/src/App.vue`, `web/src/api/client.js`, `web/src/router.js`, `web/src/assets/main.css`, `web/package.json` are task-owned per that map. Root `package.json`/`package-lock.json`: hands-off except U1's single `npm install --workspace=web`.
- Claims use `U<N>.claim`. Wave gate: do not start a wave-N task until every wave-(N−1) claim is `status: done` and its final commit exists.
- Everything else in this contract unchanged.

## UI process rules

1. **No bare routes.** Every new authenticated view renders inside a shared
   layout (`TripLayout` for trip sections, the AppNav shell otherwise) with
   persistent navigation and a visible way back (sidebar/breadcrumb). Only
   `/login` and `/p/:token` are bare. Adding a trip section = adding a child
   route under `/trips/:id` + an entry in `web/src/utils/tripNav.js`. Never
   a flat top-level route.
2. **Tests passing ≠ done.** A UI change is complete only after the golden
   path is click-driven in a real browser (playwright-core + the cached
   chromium headless shell; plain `chrome --headless --screenshot` hangs on
   Vite's HMR socket) and the screenshots have actually been looked at:
   every section reachable from every other, no blank frames, no console
   errors. See `e2e/ui-walk.mjs`.
3. **IA before features.** New feature waves start with a navigation/IA
   design pass (brainstorm → spec), not with per-ticket view additions.
4. **Gates clean up after themselves, and never depend on another gate's
   litter.** A gate that drives the real app writes real rows, so it must
   call `purgeQaData()` from `e2e/purge-qa.mjs` before it exits, and it must
   *create* whatever trip/person it needs rather than reusing `trips[0]`.
   Left unchecked this compounded to 19 junk trips, 37 junk document rows and
   210MB of orphaned upload blobs — and it was not merely untidy: a
   person-scoped Select degenerated to a single option, which is thin enough
   to hide a real defect during visual QA. It also hid two gates silently
   depending on leftovers (`qa-upload-reselect.mjs` skipped its whole
   participant surface once the leftovers were gone). Give any new
   gate-generated name a matching GLOB in
   `server/scripts/purge-qa-data.js`; run that script with no flags for a
   dry run, `--apply` to delete. Trips/persons are scoped by `organizer_id`,
   so remember the seeded `Asha Kumar` / `Vietnam` belong to
   demo@tripper.dev, NOT to the demo@example.com most gates log in as.
