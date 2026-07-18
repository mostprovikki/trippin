# .agent-coordination/

Shared, file-based coordination state for concurrent agents (see `../AGENTS.md` for the full contract).

- `claims/` — one `T<N>.claim` file per task an agent is working on. Create it **atomically** with `set -o noclobber` before starting; set `status: done` or delete it when finished. If a fresh claim exists, that task is taken.
- `NOTES.md` — append-only log for escalations, orchestrator status, partial-work handoffs, and takeover notes. Timestamp + agent id + one paragraph per entry.
- `claims/EXAMPLE.claim` — copy this shape for a real claim.

Everything here is committed to git so agents in **separate sessions** see the same coordination state.
