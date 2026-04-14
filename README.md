# rn-typed-assets

**Get rid of all string-based asset references in React Native — forever.**

`rn-typed-assets` scans your asset directories and generates a typed TypeScript registry, so that every image, SVG, and Lottie animation is accessed through a named constant instead of a brittle `require('../../../assets/icon.png')` path. If the file doesn't exist, the import fails at generation time — not at runtime.

```ts
// Before
<Image source={require('../../../assets/toast/info.png')} />
<LottieView source={require('../../utils/loading.json')} />

// After
import { Assets, Lotties } from '../generated/assets.gen';

<Image source={Assets.toast.info} />
<LottieView source={Lotties.loading} />
```

## Inspiration

This tool is directly inspired by two codegen tools from other ecosystems:

- **[SwiftGen](https://github.com/SwiftGen/SwiftGen)** — the canonical Swift code generator for Xcode resources. SwiftGen pioneered the pattern of scanning asset catalogs and emitting fully type-safe Swift enums, eliminating string-based `UIImage(named:)` calls entirely.

- **[FlutterGen](https://github.com/FlutterGen/flutter_gen)** — the Flutter equivalent. FlutterGen reads `pubspec.yaml` assets and emits Dart classes with typed getters, so `Assets.images.profile.image()` replaces `Image.asset('assets/images/profile.jpg')`.

`rn-typed-assets` brings the same discipline to React Native: a manifest-driven, deterministic generator that makes unused or mistyped asset references a compile-time (or generation-time) problem rather than a runtime crash.

## Features

- **Zero-config for standard RN projects** — works out of the box with the default `src/assets` layout
- **Three built-in asset types** — `image` (PNG/JPG/WebP), `svg`, `lottie` (JSON)
- **Deterministic, sorted output** — generated files are stable across runs and friendly to code review
- **Collision detection** — files that normalize to the same key (e.g. `harini-cry.png` and `harini_cry.png`) are caught at generation time with a clear error
- **Manifest-backed audit** — find and optionally delete unused assets that are no longer referenced anywhere in source
- **Configurable** — override paths, export names, TypeScript type imports, or add entirely new asset types via `rn-typed-assets.config.js`
- **Programmatic API** — every function is exported; integrate the generator into your own scripts or build tools
- **Lightweight** — zero runtime dependencies; `typescript` is a peer dependency used only by the audit command

## How It Works

```log
src/assets/                        scripts/
  toast/info.png    ──┐            generate
  toast/warning.png ──┤  scan  ──► assets.gen.ts        (typed require() registry)
  lottie/loading.json─┤            assets.manifest.json (path ↔ key index)
  svg/logo.svg ───────┘

                                   audit
src/**/*.{ts,tsx,js,jsx} ──────►  compare usages in source
                                   vs. entries in manifest
                                   → report (or delete) unused assets
```

### Generation pipeline

1. **Scan** — For each enabled asset type, recursively list files under the configured `rootDir`.
2. **Normalize** — Convert each filename to a stable camelCase key (`harini-cry.png` → `hariniCry`, `1.png` → `n1`).
3. **Build registry tree** — Assemble a nested object tree from path segments. Detect and resolve branch/leaf collisions automatically (e.g. a file named `point.png` alongside a `point/` directory becomes `pointAsset`).
4. **Emit** — Write `assets.gen.ts` (a typed `as const` object) and `assets.manifest.json` (a stable index of every key ↔ file mapping).

### Audit pipeline

1. **Parse source files** — Use the TypeScript Compiler API to walk the AST of every `.ts/.tsx/.js/.jsx` file under `sourceRoots`.
2. **Collect usages** — Detect `Assets.*`, `Lotties.*`, and `Svgs.*` property-access chains. Also collect legacy `require('../assets/...')` calls for files still in migration.
3. **Compare against manifest** — Any key present in the manifest but unreferenced in source is reported as unused. Any key used in source but absent from the manifest is reported as unknown.
4. **Optionally fix** — With `--fix`, delete the unused files and regenerate the manifest.

## Installation

```bash
npm install --save-dev rn-typed-assets
```

`typescript` must be available in the project (it is a `peerDependency`). Most React Native projects already have it as a dev dependency.

## Quick Start

### 1. Add scripts to `package.json`

```json
{
  "scripts": {
    "assets:generate": "rn-typed-assets generate",
    "assets:audit": "rn-typed-assets audit"
  }
}
```

### 2. Run the generator

```bash
npm run assets:generate
```

This writes two files to `src/generated/`:

- `assets.gen.ts` — the typed registry you import in your components
- `assets.manifest.json` — the index used by the audit command (commit this file)

### 3. Import the registry

```ts
import { Assets, Lotties, Svgs } from './generated/assets.gen';

// Images
<Image source={Assets.toast.info} />
<Image source={Assets.coupang.hariniCry} />

// Lottie
<LottieView source={Lotties.loading} autoPlay loop />

// SVG (with react-native-svg)
<SvgUri source={Svgs.logo} />
```

### 4. Audit for unused assets

```bash
npm run assets:audit          # report unused entries
npm run assets:audit -- --fix # delete unused files and regenerate
```

## CLI Reference

```bash
rn-typed-assets <command> [options]
```

### `generate`

Scan asset directories and emit `assets.gen.ts` + `assets.manifest.json`.

| Flag              | Description                                    | Default                       |
| ----------------- | ---------------------------------------------- | ----------------------------- |
| `--types <types>` | Comma-separated list of asset types to include | `image,svg,lottie`            |
| `--root <path>`   | Project root directory                         | `cwd`                         |
| `--config <path>` | Path to config file                            | `./rn-typed-assets.config.js` |

```bash
rn-typed-assets generate
rn-typed-assets generate --types=image,lottie
rn-typed-assets generate --root=/path/to/project
```

### `audit`

Compare manifest against actual source-file usages.

| Flag              | Description                                           | Default                       |
| ----------------- | ----------------------------------------------------- | ----------------------------- |
| `--types <types>` | Asset types to include in the audit                   | `image,svg,lottie`            |
| `--fix`           | Delete unused asset files and regenerate the manifest | `false`                       |
| `--root <path>`   | Project root directory                                | `cwd`                         |
| `--config <path>` | Path to config file                                   | `./rn-typed-assets.config.js` |

```bash
rn-typed-assets audit
rn-typed-assets audit --fix
rn-typed-assets audit --types=image
```

## Configuration

Create `rn-typed-assets.config.js` in your project root to override any default. The file is optional — omitting it is equivalent to accepting all defaults.

```js
// rn-typed-assets.config.js
module.exports = {
  // Where to write assets.gen.ts and assets.manifest.json
  // Default: 'src/generated'
  outputDir: 'src/generated',

  // Directories and entry files scanned by the audit command
  // Default: ['src', 'App.tsx', 'index.js']
  sourceRoots: ['src', 'App.tsx', 'index.js'],

  // Per-type configuration (all fields are optional overrides)
  types: {
    image: {
      rootDir: 'src/assets', // scan root
      extensions: ['.png', '.jpg', '.jpeg', '.webp'], // included extensions
      exportName: 'Assets', // export const Assets = ...
      typeImport: {
        typeName: 'ImageSourcePropType', // TypeScript type name
        from: 'react-native', // import source
      },
    },
    svg: {
      rootDir: 'src/assets/svg',
      extensions: ['.svg'],
      exportName: 'Svgs',
      inlineType: 'unknown', // emits: export type SvgsAssetSource = unknown
    },
    lottie: {
      rootDir: 'src/assets/lottie',
      extensions: ['.json'],
      exportName: 'Lotties',
      typeImport: {
        typeName: 'AnimationObject',
        from: 'lottie-react-native',
      },
    },
  },
};
```

### Adding a custom asset type

Any type not in the defaults can be added under `types`. The audit command discovers it automatically via the `exportName` → `type` reverse map.

```js
module.exports = {
  types: {
    font: {
      rootDir: 'src/assets/fonts',
      extensions: ['.ttf', '.otf'],
      exportName: 'Fonts',
      inlineType: 'string', // emits: export type FontsAssetSource = string
    },
  },
};
```

## Generated Output

Given this asset tree:

```log
src/assets/
  toast/
    info.png
    warning.png
  coupang/
    harini-cry.png
  lottie/
    loading.json
  svg/
    logo.svg
```

Running `rn-typed-assets generate` produces:

```ts
// src/generated/assets.gen.ts
// Auto-generated by rn-typed-assets. Do not edit manually.

import type { ImageSourcePropType } from 'react-native';
import type { AnimationObject } from 'lottie-react-native';
export type SvgsAssetSource = unknown;

export const Assets = {
  coupang: {
    hariniCry:
      require('../assets/coupang/harini-cry.png') as ImageSourcePropType,
  },
  toast: {
    info: require('../assets/toast/info.png') as ImageSourcePropType,
    warning: require('../assets/toast/warning.png') as ImageSourcePropType,
  },
} as const;

export const Lotties = {
  loading: require('../assets/lottie/loading.json') as AnimationObject,
} as const;

export const Svgs = {
  logo: require('../assets/svg/logo.svg') as SvgsAssetSource,
} as const;
```

### Key normalization rules

| Filename                           | Generated key                        |
| ---------------------------------- | ------------------------------------ |
| `harini-cry.png`                   | `hariniCry`                          |
| `camera_guide.png`                 | `cameraGuide`                        |
| `Info-Filled.png`                  | `infoFilled`                         |
| `1.png`                            | `n1` (numeric prefix → `n`)          |
| `point.png` alongside `point/` dir | `pointAsset` (leaf/branch collision) |

## Programmatic API

All functions are available for use in custom build scripts:

```js
const {
  loadConfig,
  collectAssetEntries,
  generateAssetsModule,
  generateAssetsManifest,
  writeGeneratedAssets,
  auditAssetUsage,
  collectGeneratedAssetUsages,
} = require('rn-typed-assets');

const config = loadConfig(projectRoot);

// Generate
const { entries, moduleContent, manifest } = writeGeneratedAssets({
  projectRoot,
  types: ['image', 'lottie'],
  config,
});

// Audit (requires typescript peer dep)
const usages = collectGeneratedAssetUsages(sourceCode, filePath, config);
const report = auditAssetUsage({
  manifest,
  generatedUsages: usages,
  requirePaths: [],
  config,
});
```

See [`src/index.js`](src/index.js) for the full list of exported functions.

## CI Integration

Add generation and audit to your CI pipeline to catch drift between the manifest and the filesystem:

```yaml
# .github/workflows/ci.yml
- name: Verify asset manifest is up to date
  run: |
    npm run assets:generate
    git diff --exit-code src/generated/
```

Or use a pre-commit hook via [Husky](https://typicode.github.io/husky/):

```bash
# .husky/pre-commit
npm run assets:generate
git add src/generated/assets.gen.ts src/generated/assets.manifest.json
```

## Future Plans

### Watch mode

Automatically re-run `generate` when files under any `rootDir` are added, removed, or renamed. Useful during active development without having to manually invoke the CLI.

```bash
rn-typed-assets generate --watch   # planned
```

### Metro plugin integration

A Metro resolver plugin that runs generation as part of the bundler's startup, ensuring `assets.gen.ts` is always in sync before the first bundle is produced — eliminating the need for a separate pre-build step.

### Husky / lint-staged recipe

A first-class `init` command that scaffolds a Husky pre-commit hook and `lint-staged` configuration so that generation runs automatically whenever asset files are staged.

```bash
rn-typed-assets init --hooks   # planned
```

### Font and audio asset types

Extend the default type set to cover fonts (`.ttf`, `.otf`) and audio files (`.mp3`, `.wav`, `.aac`) with appropriate TypeScript types (`FontSource`, `NodeRequire`). These types already work today via the custom-type config API; the plan is to promote them to built-in defaults.

### Strict audit mode for CI

A `--strict` flag for the audit command that exits non-zero if the manifest is stale, if any unknown keys are in use, or if any unused entries remain — making the full audit a one-command CI gate.

```bash
rn-typed-assets audit --strict   # planned
```

### Monorepo support

Allow multiple packages in a workspace to share a single invocation, with per-package output directories and per-package manifests, controlled by a root-level config or workspace glob.

### Output template customization

Inspired by [SwiftGen's Stencil templates](https://github.com/SwiftGen/SwiftGen#templates), allow users to supply a custom EJS or Handlebars template for `assets.gen.ts`, enabling alternative output styles — for example, emitting functions instead of `require()` literals, or targeting a custom asset loader.

## License

MIT
