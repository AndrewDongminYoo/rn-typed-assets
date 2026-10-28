# Quality Tooling Refresh Plan

## Work

1. Verify repository identity, instructions, current changes and Oracle precedent.
2. Refresh compatible dependency and linter versions with npm, then verify the installed graph and advisory patch floors.
3. Check compiler and Markdown-renderer compatibility where a newer package changes its exported API or Node requirement.
4. Run the declared local gates and `trunk check --all --no-fix --jobs=2`.
5. Verify security readers with failing synthetic controls and clean controls; record any authorized, unresolved advisory disposition.
6. Reconcile affected knowledge and review the scoped candidate.
7. Let the root coordinator commit locally and prepare visible evidence before requesting publication approval.

## Success Checks

1. Updated manifest and generated lockfile → verify with `npm ci` and `npm ls --all`.
2. Compatible development tools → verify with `npm run lint`, `npm run typecheck` and `npm test -- --runInBand` under Node 20.
3. Advisory coverage → verify direct OSV lock scans and the configured Trunk security readers against negative controls.
4. All tracked files → verify with `trunk check --all --no-fix --jobs=2` and `git diff --check`.
5. Affected documentation → compare commands, dependency claims and known compatibility limits against the manifest, source and gate output.

## Declared Gates

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm test -- --runInBand`
- `trunk check --all --no-fix --jobs=2`
