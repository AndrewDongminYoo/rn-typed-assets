'use strict';

const path = require('path');

const { DEFAULT_CONFIG, mergeConfig } = require('../src/config');

describe('config', () => {
  test('DEFAULT_CONFIG has expected types with correct defaults', () => {
    expect(Object.keys(DEFAULT_CONFIG.types)).toEqual([
      'image',
      'svg',
      'lottie',
    ]);
    expect(DEFAULT_CONFIG.outputDir).toBe(path.join('src', 'generated'));
    expect(DEFAULT_CONFIG.sourceRoots).toEqual(['src', 'App.tsx', 'index.js']);
  });

  test('mergeConfig returns defaults when no overrides provided', () => {
    const config = mergeConfig(DEFAULT_CONFIG, {});

    expect(config.outputDir).toBe(DEFAULT_CONFIG.outputDir);
    expect(config.sourceRoots).toEqual(DEFAULT_CONFIG.sourceRoots);
    expect(Object.keys(config.types)).toEqual(
      Object.keys(DEFAULT_CONFIG.types),
    );
  });

  test('mergeConfig defaults keyCase to camel and onCollision to error', () => {
    expect(DEFAULT_CONFIG.keyCase).toBe('camel');
    expect(DEFAULT_CONFIG.onCollision).toBe('error');

    const config = mergeConfig(DEFAULT_CONFIG, {});

    expect(config.keyCase).toBe('camel');
    expect(config.onCollision).toBe('error');
  });

  test('mergeConfig overrides keyCase and onCollision', () => {
    const config = mergeConfig(DEFAULT_CONFIG, {
      keyCase: 'snake',
      onCollision: 'first',
    });

    expect(config.keyCase).toBe('snake');
    expect(config.onCollision).toBe('first');
  });

  test('mergeConfig rejects invalid keyCase and onCollision values', () => {
    expect(() => mergeConfig(DEFAULT_CONFIG, { keyCase: 'kebab' })).toThrow(
      'Unsupported keyCase: kebab',
    );
    expect(() => mergeConfig(DEFAULT_CONFIG, { onCollision: 'merge' })).toThrow(
      'Unsupported onCollision: merge',
    );
  });

  test('mergeConfig overrides outputDir and sourceRoots', () => {
    const config = mergeConfig(DEFAULT_CONFIG, {
      outputDir: 'generated',
      sourceRoots: ['src'],
    });

    expect(config.outputDir).toBe('generated');
    expect(config.sourceRoots).toEqual(['src']);
    expect(Object.keys(config.types)).toEqual(
      Object.keys(DEFAULT_CONFIG.types),
    );
  });

  test('mergeConfig deep-merges type overrides and preserves unspecified type defaults', () => {
    const config = mergeConfig(DEFAULT_CONFIG, {
      types: {
        image: {
          rootDir: 'assets/images',
          exportName: 'Images',
        },
      },
    });

    expect(config.types.image.rootDir).toBe('assets/images');
    expect(config.types.image.exportName).toBe('Images');
    // unspecified fields preserved from defaults
    expect(config.types.image.typeImport).toEqual(
      DEFAULT_CONFIG.types.image.typeImport,
    );
    // other types untouched
    expect(config.types.lottie).toEqual(DEFAULT_CONFIG.types.lottie);
    expect(config.types.svg).toEqual(DEFAULT_CONFIG.types.svg);
  });

  test('mergeConfig converts extensions array to Set', () => {
    const config = mergeConfig(DEFAULT_CONFIG, {
      types: {
        image: {
          extensions: ['.png', '.gif'],
        },
      },
    });

    expect(config.types.image.extensions).toBeInstanceOf(Set);
    expect(config.types.image.extensions.has('.png')).toBe(true);
    expect(config.types.image.extensions.has('.gif')).toBe(true);
    expect(config.types.image.extensions.has('.jpg')).toBe(false);
  });

  test('mergeConfig supports adding a new custom type', () => {
    const config = mergeConfig(DEFAULT_CONFIG, {
      types: {
        font: {
          rootDir: 'src/assets/fonts',
          extensions: new Set(['.ttf', '.otf']),
          exportName: 'Fonts',
          inlineType: 'string',
        },
      },
    });

    expect(config.types.font).toBeDefined();
    expect(config.types.font.exportName).toBe('Fonts');
    expect(config.types.font.extensions.has('.ttf')).toBe(true);
    // original types still present
    expect(config.types.image).toBeDefined();
  });
});
