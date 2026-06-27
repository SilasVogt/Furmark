# Furmark

TypeScript benchmark harness for the 3 agent, 3 mode, 9 task Furmark matrix.

## Resume Workflow

Real benchmark runs resume by default when you reuse a batch ID. Completed `passed` and `skipped` runs are reused from `public/results/batches/<batchId>/<runId>/run.json`; `failed` and `error` runs are retried.

OpenCode uses GLM and runs last in the full matrix, after Claude Code and Codex. If GLM quota is tight, run it in small chunks:

```bash
pnpm bench:run --matrix full --batch official-001 --max-runs 3
pnpm bench:run --matrix full --batch official-001 --max-runs 3
```

Useful controls:

- `--batch <id>`: resume or extend a named batch.
- `--max-runs <n>`: run at most `n` new pending cases, not counting reused runs.
- `--force`: rerun even if a passed or skipped `run.json` exists.
- `--no-resume`: ignore completed artifacts for the selected cases.
- `--continue-on-error`: keep going after a CLI failure. By default real runs pause after a failed or errored case.

Progress is checkpointed at `results/raw/<batchId>/state.json`. Raw logs stay ignored by git.

## Ponytail Skill

Official Furmark runs use prompt injection, so they only need the canonical Ponytail skill file in this repo:

```bash
pnpm bench:skill import ponytail --from github:DietrichGebert/ponytail
```

That copies `skills/ponytail/SKILL.md` from the Ponytail repository into `skills/ponytail/SKILL.md` here. Native Ponytail plugin installation is separate and host-specific. For Codex, Ponytail documents:

```bash
codex plugin marketplace add DietrichGebert/ponytail
codex
```

Then open `/plugins`, install Ponytail, open `/hooks`, trust its hooks, and start a new thread.

## Common Commands

```bash
pnpm bench:dry-run
pnpm bench:run --matrix full
pnpm bench:run --agent codex --mode furry --task coding-cache
pnpm bench:score --batch <batchId>
pnpm bench:skill import ponytail --from <path>
pnpm dev
pnpm test
pnpm build
pnpm test:e2e
```
