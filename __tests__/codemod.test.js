'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

const { DEFAULT_CONFIG } = require('../src/config');
const {
  diffAssetManifests,
  flattenManifestEntries,
  rewriteTypedAssetSource,
} = require('../src/codemod');

const makeManifest = (types) => ({
  generatedAt: '2026-04-20T00:00:00.000Z',
  types: {
    image: [],
    lottie: [],
    svg: [],
    ...types,
  },
});

describe('codemod', () => {
  describe('flattenManifestEntries', () => {
    test('flattens typed entries into a single array with type attached', () => {
      const manifest = makeManifest({
        image: [
          {
            contentHash: 'aaa',
            keyPath: 'logo',
            filePath: 'src/assets/logo.png',
            modulePath: '../assets/logo.png',
          },
        ],
        lottie: [
          {
            contentHash: 'bbb',
            keyPath: 'loading',
            filePath: 'src/assets/lottie/loading.json',
            modulePath: '../assets/lottie/loading.json',
          },
        ],
      });

      const flat = flattenManifestEntries(manifest);

      expect(flat).toEqual([
        {
          type: 'image',
          contentHash: 'aaa',
          keyPath: 'logo',
          filePath: 'src/assets/logo.png',
          modulePath: '../assets/logo.png',
        },
        {
          type: 'lottie',
          contentHash: 'bbb',
          keyPath: 'loading',
          filePath: 'src/assets/lottie/loading.json',
          modulePath: '../assets/lottie/loading.json',
        },
      ]);
    });

    test('returns empty array for empty or null manifest', () => {
      expect(flattenManifestEntries(null)).toEqual([]);
      expect(flattenManifestEntries(makeManifest({}))).toEqual([]);
    });
  });

  describe('diffAssetManifests', () => {
    test('detects no renames when manifests are identical', () => {
      const manifest = makeManifest({
        image: [
          {
            contentHash: 'aaa',
            keyPath: 'logo',
            filePath: 'src/assets/logo.png',
            modulePath: '../assets/logo.png',
          },
        ],
      });

      const { renamedSymbols } = diffAssetManifests({
        previousManifest: manifest,
        nextManifest: manifest,
        config: DEFAULT_CONFIG,
      });

      expect(renamedSymbols).toEqual({});
    });

    test('detects a file moved to a new directory by contentHash', () => {
      const previousManifest = makeManifest({
        image: [
          {
            contentHash: 'img-hash',
            keyPath: 'logo',
            filePath: 'src/assets/logo.png',
            modulePath: '../assets/logo.png',
          },
        ],
      });

      const nextManifest = makeManifest({
        image: [
          {
            contentHash: 'img-hash',
            keyPath: 'brand.logo',
            filePath: 'src/assets/images/brand/logo.png',
            modulePath: '../assets/images/brand/logo.png',
          },
        ],
      });

      const { renamedSymbols, currentSymbolsByFilePath } = diffAssetManifests({
        previousManifest,
        nextManifest,
        config: DEFAULT_CONFIG,
      });

      expect(renamedSymbols['Assets.logo']).toBe('Assets.brand.logo');
      expect(currentSymbolsByFilePath['src/assets/logo.png']).toBe(
        'Assets.brand.logo',
      );
    });

    test('falls back to keyPath match when contentHash is absent', () => {
      const previousManifest = makeManifest({
        image: [
          {
            keyPath: 'logo',
            filePath: 'src/assets/logo.png',
            modulePath: '../assets/logo.png',
          },
        ],
      });

      const nextManifest = makeManifest({
        image: [
          {
            keyPath: 'logo',
            filePath: 'src/assets/logo.png',
            modulePath: '../assets/logo.png',
          },
        ],
      });

      const { renamedSymbols } = diffAssetManifests({
        previousManifest,
        nextManifest,
        config: DEFAULT_CONFIG,
      });

      expect(renamedSymbols).toEqual({});
    });
  });

  describe('rewriteTypedAssetSource', () => {
    const makeTempProject = () => {
      const projectRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), 'codemod-test-'),
      );

      return projectRoot;
    };

    test('rewrites require() calls to generated asset symbols', () => {
      const projectRoot = makeTempProject();

      const previousManifest = makeManifest({});
      const nextManifest = makeManifest({
        image: [
          {
            contentHash: 'img-hash',
            keyPath: 'logo',
            filePath: 'src/assets/logo.png',
            modulePath: '../assets/logo.png',
          },
        ],
      });
      const code = `const img = require('../assets/logo.png');\n`;
      const result = rewriteTypedAssetSource({
        code,
        filePath: 'src/components/Logo.tsx',
        previousManifest,
        nextManifest,
        projectRoot,
        config: DEFAULT_CONFIG,
      });

      expect(result.changed).toBe(true);
      expect(result.code).toContain('Assets.logo');
      expect(result.code).toContain('import { Assets }');
      expect(result.code).not.toContain("require('../assets/logo.png')");
    });

    test('rewrites stale generated symbol references after a rename', () => {
      const projectRoot = makeTempProject();

      const previousManifest = makeManifest({
        image: [
          {
            contentHash: 'img-hash',
            keyPath: 'logo',
            filePath: 'src/assets/logo.png',
            modulePath: '../assets/logo.png',
          },
        ],
      });
      const nextManifest = makeManifest({
        image: [
          {
            contentHash: 'img-hash',
            keyPath: 'brand.logo',
            filePath: 'src/assets/images/brand/logo.png',
            modulePath: '../assets/images/brand/logo.png',
          },
        ],
      });
      const code = `import { Assets } from '../generated/assets.gen';\nconst img = Assets.logo;\n`;
      const result = rewriteTypedAssetSource({
        code,
        filePath: 'src/components/Logo.tsx',
        previousManifest,
        nextManifest,
        projectRoot,
        config: DEFAULT_CONFIG,
      });

      expect(result.changed).toBe(true);
      expect(result.code).toContain('Assets.brand.logo');
      expect(result.code).not.toContain('Assets.logo;');
    });

    test('returns changed: false when no rewrites are needed', () => {
      const projectRoot = makeTempProject();

      const manifest = makeManifest({});
      const code = `const x = 1;\n`;
      const result = rewriteTypedAssetSource({
        code,
        filePath: 'src/utils/helper.ts',
        previousManifest: manifest,
        nextManifest: manifest,
        projectRoot,
        config: DEFAULT_CONFIG,
      });

      expect(result.changed).toBe(false);
      expect(result.code).toBe(code);
    });

    test('adds new root to an existing import when symbol changes root', () => {
      const projectRoot = makeTempProject();

      const previousManifest = makeManifest({});
      const nextManifest = makeManifest({
        svg: [
          {
            contentHash: 'svg-hash',
            keyPath: 'icons.arrow',
            filePath: 'src/assets/svgs/icons/arrow.svg',
            modulePath: '../assets/svgs/icons/arrow.svg',
          },
        ],
      });
      const code = `import { Assets } from '../generated/assets.gen';\nconst icon = require('../assets/svgs/icons/arrow.svg');\n`;
      const result = rewriteTypedAssetSource({
        code,
        filePath: 'src/components/Arrow.tsx',
        previousManifest,
        nextManifest,
        projectRoot,
        config: DEFAULT_CONFIG,
      });

      expect(result.changed).toBe(true);
      expect(result.code).toContain('Svgs.icons.arrow');
      expect(result.code).toContain('Assets, Svgs');
    });
  });
});
