'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  outputDir: path.join('src', 'generated'),
  sourceRoots: ['src', 'App.tsx', 'index.js'],
  types: {
    image: {
      rootDir: path.join('src', 'assets'),
      extensions: new Set(['.png', '.jpg', '.jpeg', '.webp']),
      exportName: 'Assets',
      typeImport: { typeName: 'ImageSourcePropType', from: 'react-native' },
    },
    svg: {
      rootDir: path.join('src', 'assets', 'svg'),
      extensions: new Set(['.svg']),
      exportName: 'Svgs',
      inlineType: 'unknown',
    },
    lottie: {
      rootDir: path.join('src', 'assets', 'lottie'),
      extensions: new Set(['.json']),
      exportName: 'Lotties',
      typeImport: { typeName: 'AnimationObject', from: 'lottie-react-native' },
    },
  },
};

const normalizeExtensions = value => {
  if (value instanceof Set) {
    return value;
  }

  if (Array.isArray(value)) {
    return new Set(value);
  }

  return new Set([value]);
};

const mergeTypeConfig = (defaultTypeConfig, userTypeConfig) => {
  if (!userTypeConfig) {
    return { ...defaultTypeConfig };
  }

  const merged = { ...defaultTypeConfig, ...userTypeConfig };

  if (userTypeConfig.extensions !== undefined) {
    merged.extensions = normalizeExtensions(userTypeConfig.extensions);
  }

  return merged;
};

const mergeConfig = (defaults, overrides) => {
  if (!overrides || typeof overrides !== 'object') {
    return {
      outputDir: defaults.outputDir,
      sourceRoots: [...defaults.sourceRoots],
      types: Object.fromEntries(
        Object.entries(defaults.types).map(([type, config]) => [type, { ...config }]),
      ),
    };
  }

  const mergedTypes = { ...defaults.types };

  if (overrides.types) {
    for (const [type, userTypeConfig] of Object.entries(overrides.types)) {
      mergedTypes[type] = mergeTypeConfig(defaults.types[type] ?? {}, userTypeConfig);
    }
  }

  return {
    outputDir: overrides.outputDir ?? defaults.outputDir,
    sourceRoots: overrides.sourceRoots ?? [...defaults.sourceRoots],
    types: mergedTypes,
  };
};

const loadConfig = projectRoot => {
  const candidates = [
    path.join(projectRoot, 'rn-typed-assets.config.js'),
    path.join(projectRoot, 'rn-typed-assets.config.cjs'),
  ];

  let userConfig = {};

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      userConfig = require(candidate);
      break;
    }
  }

  return mergeConfig(DEFAULT_CONFIG, userConfig);
};

module.exports = {
  DEFAULT_CONFIG,
  loadConfig,
  mergeConfig,
};
