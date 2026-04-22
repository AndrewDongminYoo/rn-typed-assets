# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                        # Run all Jest tests
npx jest __tests__/core.test.js # Run a single test file
npm run assets:generate         # CLI: scan assets and generate assets.gen.ts + manifest
npm run assets:audit            # CLI: compare manifest vs. source usage
npm run assets:organize         # CLI: move assets to canonical directory layout
```

No build step — the project is plain JavaScript source in `src/`.

## Architecture

`rn-typed-assets` is a CLI tool and programmatic library that generates a typed TypeScript asset registry for React Native projects. It replaces stringly-typed `require('../assets/icon.png')` calls with compile-time safe named exports (`Assets.icon`).

### Source layout

| File             | Role                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/cli.js`     | Entry point — routes `generate`, `audit`, `organize` subcommands                                            |
| `src/core.js`    | Asset discovery, camelCase key normalization, registry tree building, TypeScript module + manifest emission |
| `src/config.js`  | Config schema, default values, user `rn-typed-assets.config.js` loading and merging                         |
| `src/audit.js`   | TypeScript AST traversal to collect asset usages, comparison against manifest, optional deletion            |
| `src/codemod.js` | Manifest diffing by SHA-1 hash, `require()` → named export rewriting, import injection                      |
| `src/ts-util.js` | Shared TypeScript Compiler API helpers; lazy-loads `typescript` as optional peer dep                        |
| `src/index.js`   | Re-exports all public functions for programmatic use                                                        |

### Pipelines

**Generate:** scan asset dirs → normalize filenames to camelCase keys (collision-safe) → build nested registry object → emit `assets.gen.ts` + `asset-manifest.json`

**Audit:** TypeScript AST-walk all source files → collect `Assets.*.path` chains and legacy `require()` calls → diff against manifest → report or delete unused entries

**Codemod:** diff old vs. new manifest by content hash (tracks file moves) → rewrite stale `require()` calls and dotted refs in source files → manage `import { Assets }` statements

### Key design decisions

- **Content hashing for moves** — `codemod.js` uses SHA-1 to track renamed/moved files so references stay valid even when paths change.
- **Collision detection** — `core.js` appends `Asset` suffix when a flat key conflicts with a directory name (e.g., `point.png` + `point/` → `pointAsset`).
- **TypeScript as optional peer dep** — `ts-util.js` lazy-loads `typescript`; the `audit` and `codemod` commands require it but `generate` and `organize` do not.
- **Deterministic output** — all entries are sorted before emission so diffs are minimal and reproducible across runs.
- **No runtime dependencies** — zero `dependencies` in `package.json`; all packages are `devDependencies` or `peerDependencies`.

### Configuration

Users place `rn-typed-assets.config.js` at project root to override defaults:

```js
module.exports = {
  outputDir: 'src/generated',
  sourceRoots: ['src', 'App.tsx'],
  types: {
    image: { rootDir: 'src/assets', extensions: ['.png', '.jpg', '.webp'] },
    svg: { rootDir: 'src/assets/svg', extensions: ['.svg'] },
    lottie: { rootDir: 'src/assets/lottie', extensions: ['.json'] },
  },
};
```

Config is loaded in `config.js` via `loadConfig()` and deep-merged with defaults.

## Testing

Tests are in `__tests__/` and use Jest 29 with Node environment. Each test file covers one module (`core.test.js`, `config.test.js`, `audit.test.js`, `codemod.test.js`). Tests make real filesystem calls against fixtures rather than heavy mocking.
