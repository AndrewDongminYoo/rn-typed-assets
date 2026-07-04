# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-07-05

### Added

- **`--output json` for all commands** — `generate`, `audit`, and `organize` accept `--output <text|json>`. In `json` mode the command prints exactly one machine-readable envelope (`{ ok, command, data, error }`) to stdout and suppresses all human-readable logging, while still signalling success/failure through the process exit code. This makes the tool consumable by AI agents and scripts without screen-scraping.
- **Configurable key casing (`keyCase`)** — generated asset keys can now be emitted as `camel` (default, unchanged) or `snake` via the `keyCase` config field or the `--case <camel|snake>` CLI flag. Numeric prefixes, reserved-word escaping, and leaf/branch collision suffixes all follow the chosen casing (e.g. `point_asset` instead of `pointAsset`).
- **Collision policy (`onCollision`)** — when two files normalize to the same key, the new `onCollision` config field / `--on-collision <error|first>` flag selects the behaviour: `error` (default) preserves the existing fail-fast behaviour, while `first` keeps the first sorted path, drops the rest, and reports each dropped file in `data.collisions` (JSON) or as `Collision:` lines (text). The policy is non-interactive by design so it stays compatible with `--output json`.

### Fixed

- **`organize` no longer swallows the assets directory after a value-taking flag** — positional resolution now skips the values consumed by flags such as `--output json`, so `organize --output json src/assets` correctly targets `src/assets`.

## [1.5.0] - 2026-05-17

### Added

- **`valueType` config field** — each type config in `rn-typed-assets.config.js` now accepts an optional `valueType` string that controls the TypeScript annotation applied to generated values independently of the imported type name. Useful when the value annotation is a composite type (e.g. `React.FC<SvgProps>`) that differs from the raw imported name (`SvgProps`).

### Documentation

- **SVG type configuration guide** — added a dedicated section in the README documenting the two SVG usage patterns:
  - _With `react-native-svg-transformer`_: configure `typeImport + valueType` to get `React.FC<SvgProps>` annotations
  - _Without transformer (SvgUri)_: configure `typeImport: ImageRequireSource`; `SvgUri.uri` requires a `string` so the number asset ID must be resolved to a URI first
- Fixed incorrect SVG usage example (`<SvgUri source={...} />` → component pattern with `<Logo />`)

## [1.4.0] - 2026-04-23

### Fixed

- **`organize` output roots now match generation roots** — `organize` moves assets into each type's configured `rootDir` when that directory is inside the requested asset root, so moved SVG and Lottie files are still discovered by the follow-up generation step.
- **Legacy plural asset folders are migrated safely** — existing `svgs/` and `lotties/` directories are treated as legacy inputs and migrated to the default `svg/` and `lottie/` roots.
- **Documentation now matches default asset roots** — README organize examples now use `images/`, `svg/`, and `lottie/`, consistent with the default configuration.

## [1.3.0] - 2026-04-22

### Added

- **ES module `import` migration** — `generate --inplace` and `organize` now rewrite ES module import statements for asset files in addition to `require()` calls. When a source file contains `import logo from '../assets/logo.png'`, the codemod removes the import declaration and replaces every reference to the imported binding (`logo`) with the corresponding generated symbol (`Assets.logo`), then adds or extends the `import { Assets } from '…/assets.gen'` statement automatically.

  Supported import forms:

  | Form                                         | Handled                                              |
  | -------------------------------------------- | ---------------------------------------------------- |
  | `import logo from '../assets/logo.png'`      | ✅ replaced                                          |
  | `import { logo } from '../assets/logo.png'`  | ✅ replaced                                          |
  | `import type logo from '../assets/logo.png'` | ✅ removed (no binding replacement)                  |
  | `import * as NS from '../assets/logo.png'`   | skipped — namespace imports require manual migration |

  Shorthand property assignments are expanded to avoid syntax errors: `{ logo }` becomes `{ logo: Assets.logo }`.

- **`collectAssetImportBindings`** — new programmatic API function that scans a parsed TypeScript/JavaScript source file for asset `import` declarations and returns the binding → symbol mapping and the text ranges to remove. Useful for integrating ES import migration into custom build scripts.

### New exports (programmatic API)

| Export                       | Module           |
| ---------------------------- | ---------------- |
| `collectAssetImportBindings` | `src/codemod.js` |

## [1.2.0] - 2026-04-21

### Fixed

- **Scoped `eslint-disable` in generated files** — the blanket `/* eslint-disable */` header in `assets.gen.ts` is replaced with `/* eslint-disable @typescript-eslint/no-require-imports -- require() is intentional for React Native static asset bundling */`. Projects using `unicorn/no-abusive-eslint-disable` will no longer see a lint error in the generated file.
- **No orphaned `import type` statements** — `import type` lines are now only emitted when at least one asset entry of that type exists. Previously, an empty asset directory could produce an unused `import type` line, which triggers `@typescript-eslint/no-unused-vars` and similar rules.

### Changed

- **`typescript` peer dependency is now optional** — marked `optional: true` in `package.json`. The `audit` command still requires TypeScript to be present, but `generate` and `organize` work without it.
- **Explicit `exports` map** — `package.json` now declares `"exports": { ".": "./src/index.js" }`, enabling correct Node.js ESM-aware module resolution without a fallback scan.

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
