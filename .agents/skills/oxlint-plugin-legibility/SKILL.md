---
name: oxlint-plugin-legibility
description: >
  Use when checking JavaScript or TypeScript readability with oxlint-plugin-legibility, fixing legibility diagnostics, installing the packaged agent skill, maintaining this repository, or guiding agents through a repeatable changed-file lint feedback loop.
---

# Oxlint Plugin Legibility

Use `oxlint-plugin-legibility` with Oxlint to keep JavaScript and TypeScript readable during agent-assisted development. Prefer small, behavior-preserving edits that make conditions, computed values, collection processing, naming, and control flow easier to review.

## Agent Compatibility

Use this as the shared workflow for Codex, Claude, and generic agent skill roots. Keep tool-specific rule files as generated pointers or thin wrappers over this content.

## Comments

Both presets enforce the same comment-quality rules. Use the session flag to reject comments added while an agent works.

- Agents do not add source comments by default.
- Run `npx lint-changed --comments=forbid` during agent sessions.
- `legibility/no-stacked-comments` rejects adjacent comments.
- The session flag enables `legibility/no-unmatched-comments` as an error for new files and added lines.
- Inline disable directives cannot suppress the session policy.
- A configured `prefixIdentifiers` or `suffixIdentifiers` value lets the rule allow a matching comment.
- An adjacent comment should be updated or removed instead of stacking another comment.

## Package Install

The npm package ships this skill, but does not install it automatically. After installing the package, install the skill explicitly:

```sh
npx oxlint-plugin-legibility-install-skill
```

For a specific agent target:

```sh
npx oxlint-plugin-legibility-install-skill --target codex
npx oxlint-plugin-legibility-install-skill --target claude
```

## Developer Cleanup Loop

1. Inspect the changed JavaScript and TypeScript files before editing.
2. Run changed-file linting with the agent comment policy:
   ```sh
   npx lint-changed --comments=forbid
   ```
3. Pass a base ref when the branch does not target `origin/main`:
   ```sh
   npx lint-changed origin/develop
   ```
4. Fix actionable diagnostics with behavior-preserving edits:

   - Hoist operator-heavy conditions into named booleans.
   - Prefer guard clauses and early returns over nested main paths.
   - Name intermediate computed values before returns and object or array values.
   - Replace repeated collection scans with lookups.
   - Split long array chains when each step deserves a name.
   - Keep cyclomatic complexity at 20 or below.
   - Keep functions at 40 nonblank, non-comment lines or fewer.
   - Keep JSX and object literals free of hidden complex logic.

5. Re-run `npx lint-changed --comments=forbid` until the touched files are clean or only documented unrelated failures remain.

Do not run `eslint .`, `nub run lint`, or `oxlint .` for the cleanup loop unless the user asks for full-repo validation.

## Repository Maintenance Loop

In this repository, use the local package:

```sh
nub run build
nubx lint-changed
nub run test
```

For a full release-grade check:

```sh
nub run validate
```

When changing public rule behavior:

- Update rule metadata and implementation in `src/constants.ts` and `src/index.ts`.
- Add positive and negative tests in `tests/unit/plugin`.
- Update README rule tables and examples when public behavior changed.
- Rebuild the package skill with `nub run build:agent` after changing agent guidance.

## Review Guidance

- Do not install dependencies or fetch packages unless the user asked for it.
- Do not rewrite code just to satisfy a diagnostic when behavior would become less clear.
- Treat false positives as rule bugs and add regression tests before broadening detection.
- Keep generated build artifacts out of commits unless they are package-facing artifacts.
