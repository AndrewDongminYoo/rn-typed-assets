# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-04-20

### Added

- **`organize` command** — moves asset files from legacy or flat directories into canonical subdirectories (`images/`, `svgs/`, `lotties/`), then regenerates the manifest and rewrites source file references automatically.

  ```bash
  rn-typed-assets organize src/assets
  ```

- **`--inplace` flag for `generate`** — after regenerating the manifest, rewrites every source file that contains stale `require('../assets/...')` paths or renamed `Assets.*` / `Svgs.*` / `Lotties.*` references.

  ```bash
  rn-typed-assets generate --inplace
  ```

- **Content hashing** — each asset entry in `assets.manifest.json` now includes a `contentHash` (SHA-1 of the file's bytes). The codemod uses this to track files that move or are renamed without content changes, resolving their new symbol unambiguously.

- **Codemod engine** (`src/codemod.js`) — programmatic API for diffing two manifests and rewriting TypeScript/JavaScript source files:
  - `diffAssetManifests({ previousManifest, nextManifest, config })` — returns `renamedSymbols` and `currentSymbolsByFilePath` derived from content-hash matching.
  - `rewriteTypedAssetSource({ code, filePath, previousManifest, nextManifest, projectRoot, config })` — replaces `require()` calls with generated symbols and updates stale dotted references; adds or extends the `import { … } from '…/assets.gen'` statement automatically.
  - `flattenManifestEntries(manifest)` — utility to flatten a manifest's typed sections into a single array.

- **Shared TypeScript AST utilities** (`src/ts-util.js`) — `buildSourceFile`, `extractPropertyChain`, and `requireTypescript` extracted from the audit module so both audit and codemod share a single implementation.

### Changed

- `assets.manifest.json` schema now includes `contentHash` on every entry (SHA-1 hex string). Existing manifests without `contentHash` continue to work; the codemod falls back to `keyPath` matching when the field is absent.
- `applyAuditFix` now uses a direct `unlinkSync` inside a `try/catch (ENOENT)` instead of a preceding `existsSync` check, eliminating a TOCTOU race condition.
- Shared `buildSourceFile` and `extractPropertyChain` functions moved from `src/audit.js` into the new `src/ts-util.js` module. The audit module re-exports them via `require('./ts-util')`.

### New exports (programmatic API)

| Export                    | Module           |
| ------------------------- | ---------------- |
| `hashFileContent`         | `src/core.js`    |
| `diffAssetManifests`      | `src/codemod.js` |
| `flattenManifestEntries`  | `src/codemod.js` |
| `rewriteTypedAssetSource` | `src/codemod.js` |

## [1.0.0] - 2026-04-13

### Added

- Initial release.
- `generate` command — scans `src/assets` and emits `assets.gen.ts` + `assets.manifest.json`.
- `audit` command — compares manifest against source usages; `--fix` deletes unused files.
- Config system (`rn-typed-assets.config.js`) with support for custom asset types, root directories, export names, and TypeScript type imports.
- Full programmatic API via `require('rn-typed-assets')`.
- Three built-in asset types: `image`, `svg`, `lottie`.
- Deterministic, sorted output stable across runs.
- Collision detection for files that normalize to the same key.
