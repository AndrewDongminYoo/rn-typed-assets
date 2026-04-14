'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseTypesArg,
  normalizeAssetName,
  collectAssetEntries,
  generateAssetsModule,
  generateAssetsManifest,
} = require('../src/core');
const { DEFAULT_CONFIG } = require('../src/config');

const makeTempProject = () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-gen-'));

  const writeFile = (relativePath, content = 'test') => {
    const absolutePath = path.join(projectRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  };

  return { projectRoot, writeFile };
};

describe('core', () => {
  test('parseTypesArg defaults to all types and validates enum values', () => {
    expect(parseTypesArg(undefined, DEFAULT_CONFIG)).toEqual(Object.keys(DEFAULT_CONFIG.types));
    expect(parseTypesArg('image,lottie', DEFAULT_CONFIG)).toEqual(['image', 'lottie']);
    expect(() => parseTypesArg('image,unknown', DEFAULT_CONFIG)).toThrow('Unsupported asset type: unknown');
  });

  test('normalizeAssetName converts file names into stable camelCase keys', () => {
    expect(normalizeAssetName('harini-cry')).toBe('hariniCry');
    expect(normalizeAssetName('camera_guide')).toBe('cameraGuide');
    expect(normalizeAssetName('Info-Filled')).toBe('infoFilled');
    expect(normalizeAssetName('coupangHarini')).toBe('coupangHarini');
    expect(normalizeAssetName('noSmile')).toBe('noSmile');
    expect(normalizeAssetName('1')).toBe('n1');
  });

  test('collectAssetEntries recursively discovers selected asset types', () => {
    const { projectRoot, writeFile } = makeTempProject();

    writeFile('src/assets/coupang/harini-cry.png');
    writeFile('src/assets/banner-icon/1.png');
    writeFile(
      'src/assets/lottie/loading.json',
      '{"v":"5.7.0","fr":60,"ip":0,"op":60,"w":100,"h":100,"assets":[],"layers":[]}',
    );
    writeFile('src/assets/svg/logo.svg', '<svg />');

    const entries = collectAssetEntries({
      projectRoot,
      types: ['image', 'lottie'],
      config: DEFAULT_CONFIG,
    });

    expect(entries.map(entry => `${entry.type}:${entry.keyPath}`)).toEqual([
      'image:bannerIcon.n1',
      'image:coupang.hariniCry',
      'lottie:loading',
    ]);

    expect(entries.map(entry => entry.filePath)).toEqual([
      'src/assets/banner-icon/1.png',
      'src/assets/coupang/harini-cry.png',
      'src/assets/lottie/loading.json',
    ]);
  });

  test('collectAssetEntries fails on normalized key collisions', () => {
    const { projectRoot, writeFile } = makeTempProject();

    writeFile('src/assets/coupang/harini-cry.png');
    writeFile('src/assets/coupang/harini_cry.png');
    writeFile(
      'src/assets/lottie/loading.json',
      '{"v":"5.7.0","fr":60,"ip":0,"op":60,"w":100,"h":100,"assets":[],"layers":[]}',
    );
    writeFile('src/assets/svg/.gitkeep', '');

    expect(() =>
      collectAssetEntries({
        projectRoot,
        types: ['image'],
        config: DEFAULT_CONFIG,
      }),
    ).toThrow('Duplicate generated asset key "coupang.hariniCry"');
  });

  test('collectAssetEntries preserves directory namespaces and suffixes conflicting file leaves', () => {
    const { projectRoot, writeFile } = makeTempProject();

    writeFile('src/assets/point.png');
    writeFile('src/assets/point/coffee.png');

    const entries = collectAssetEntries({
      projectRoot,
      types: ['image'],
      config: DEFAULT_CONFIG,
    });

    expect(entries.map(entry => entry.keyPath)).toEqual(['pointAsset', 'point.coffee']);
  });

  test('generateAssetsModule emits typed registries with deterministic paths', () => {
    const entries = [
      {
        type: 'image',
        keyPath: 'toast.info',
        keySegments: ['toast', 'info'],
        filePath: 'src/assets/toast/info.png',
        modulePath: '../assets/toast/info.png',
      },
      {
        type: 'lottie',
        keyPath: 'loading',
        keySegments: ['loading'],
        filePath: 'src/assets/lottie/loading.json',
        modulePath: '../assets/lottie/loading.json',
      },
    ];

    const output = generateAssetsModule({
      entries,
      types: ['image', 'lottie'],
      config: DEFAULT_CONFIG,
    });

    expect(output).toContain("import type { ImageSourcePropType } from 'react-native';");
    expect(output).toContain("import type { AnimationObject } from 'lottie-react-native';");
    expect(output).toContain("info: require('../assets/toast/info.png') as ImageSourcePropType");
    expect(output).toContain("loading: require('../assets/lottie/loading.json') as AnimationObject");
    expect(output).toContain('export const Svgs = {} as const;');
  });

  test('generateAssetsManifest records the exact file path for each generated key', () => {
    const entries = [
      {
        type: 'image',
        keyPath: 'coupang.hariniCry',
        keySegments: ['coupang', 'hariniCry'],
        filePath: 'src/assets/coupang/harini-cry.png',
        modulePath: '../assets/coupang/harini-cry.png',
      },
      {
        type: 'lottie',
        keyPath: 'loading',
        keySegments: ['loading'],
        filePath: 'src/assets/lottie/loading.json',
        modulePath: '../assets/lottie/loading.json',
      },
    ];

    const manifest = generateAssetsManifest({
      entries,
      types: ['image', 'lottie'],
      config: DEFAULT_CONFIG,
      generatedAt: '2026-04-13T00:00:00.000Z',
    });

    expect(manifest.types.image).toEqual([
      {
        keyPath: 'coupang.hariniCry',
        filePath: 'src/assets/coupang/harini-cry.png',
        modulePath: '../assets/coupang/harini-cry.png',
      },
    ]);
    expect(manifest.types.lottie).toEqual([
      {
        keyPath: 'loading',
        filePath: 'src/assets/lottie/loading.json',
        modulePath: '../assets/lottie/loading.json',
      },
    ]);
    expect(manifest.types.svg).toEqual([]);
  });
});
