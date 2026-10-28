# Quality Tooling Refresh

## Approved Scope

Refresh supported dependencies and existing quality tooling.
Preserve public APIs, generated artifacts and repository-specific boundaries.
Keep release `1.6.1`, the public Node `>=20.0.0` engine, the optional TypeScript `>=4.9.0` peer and zero runtime dependencies.
Do not run asset commands against this repository or real consumers.
Use the existing synthetic and temporary test fixtures.

## Tooling Compatibility

- Refresh Jest to supported version 30 and run the existing tests.
- Keep development TypeScript 6.0.3 because TypeScript 7.0.2 omits the classic Compiler API and is outside the `typescript-eslint` peer range.
- Use installed Node 20.20.2 and npm 10.8.2 for local gates; the exact `.nvmrc` patch 20.20.1 is unavailable.
- Keep major-specific security override floors separate and inspect the resolved graph after npm regenerates the lockfile.
- Preserve TruffleHog's JSON-to-SARIF reader while scanning offline with `--no-verification` and without `--only-verified`.

## Acceptance

- Pinact remains locked to `4.1.1` with `lint` and `upgrade`.
- The full no-fix Trunk scan and declared project gates pass.
- Each changed manifest has a package-manager-generated lockfile under repository policy.
- Advisory dispositions have specific evidence and affected knowledge claims are reconciled.
- Prove the TruffleHog reader detects a synthetic credential and accepts a clean control, then remove the exact temporary fixture.
- For an authorized unresolved advisory disposition, retain a failing raw lock scan, a passing configured scan and a failing unrelated vulnerability control.
- Record that TypeScript 4.9 compatibility is not tested by this refresh.

## Publication

Push and PR creation require explicit repository-specific approval.
After approval, continue the requested hosted gates, merge, cleanup and memory recording.
