---
name: vibe-graph
description: "Create, maintain, validate, and hand off AgentHub-style AI collaboration graphs that connect SPEC -> PLAN -> TASK -> IMPLEMENTS -> TRACE -> SUMMARY. Use when Codex needs to write or update specs, generate plans, split tasks, record implementation traces, backfill historical Vibecoding/Claude Code/Codex documents, prepare rules/skills/prompts for project-lead handoff, or validate docs/vibe-graph nodes."
---

# Vibe Graph

Use this skill to maintain a traceable collaboration graph for software work.

The canonical AgentHub rules live in `docs/vibe-graph/rules.md`. Always follow
that file when working inside AgentHub. For another repository, adapt the same
node model without copying AgentHub-specific business facts.

## Core Workflow

1. Read `docs/vibe-graph/rules.md` before creating or changing graph nodes.
2. Use templates from `docs/vibe-graph/templates/`.
3. Keep historical documents in place; link them through `source_assets`.
4. Build the chain:

```text
SPEC -> PLAN -> TASK -> IMPLEMENTS -> TRACE -> SUMMARY
```

5. Record uncertain facts as `TBD`, `unknown`, or explicit `to-confirm`; do not
   invent approvals, verification results, or implementation paths.

## Reference Loading

- Use `references/node-schema.md` when checking frontmatter fields, status values, and relationships.
- Use `references/migration-guide.md` when backfilling history from `archive/development/plans/`, `archive/development/summaries/`, `docs/ai-collab/`, or old Codex/Claude Code notes.
- Use `handoff.md` when the user asks to package or explain the collaboration rules to a project lead.
- Use `prompts.md` when the user wants reusable AI instructions rather than a one-off answer.

## When Creating New Work

1. Search existing graph nodes and source assets for reusable specs.
2. Create or update `SPEC-*` first.
3. Create `PLAN-*` from the spec and mark review requirements.
4. Split `TASK-*` into independently executable work units.
5. Only implement after the required plan review is satisfied or the user
   explicitly asks to proceed.
6. After implementation, update `TRACE-*` with changed paths, verification,
   deviations, followups, and summary links.

## When Backfilling History

Use `references/migration-guide.md`.

Backfill only facts supported by source documents, repository files, diffs, or
test output. Historical backfill must not modify business code.

## When Preparing a Handoff

1. Ensure the collaboration method itself has an `AICOLLAB` graph chain.
2. Ensure `handoff.md` explains purpose, assets, examples, usage, validation, and next steps.
3. Include at least one real business graph example; prefer two or more.
4. Update `index.md`, `README.md`, `obsidian.md`, and `prompts.md` so the handoff is discoverable.
5. Run the validator and record the result in the relevant `TRACE-*` and summary.

## Node Schema

Use `references/node-schema.md` for required frontmatter fields, status values,
and relationship rules.

## Validation

Run the optional validator after editing graph nodes:

```powershell
python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
```

The validator checks frontmatter shape, ID/file consistency, duplicate IDs,
basic relationships, and referenced local paths.

## Guardrails

- Do not modify business code for historical backfill or rules handoff unless the user explicitly asks.
- Do not mark `verified` unless validation was actually run.
- Do not turn historical summary claims into current facts without checking the repository or labeling them as historical.
- Prefer small capability-oriented specs over broad catch-all specs.

