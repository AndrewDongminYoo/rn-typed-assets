'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  collectGeneratedAssetUsages,
  collectRequireAssetPaths,
  auditAssetUsage,
  resolveUnusedManifestEntries,
  applyAuditFix,
} = require('../src/audit');
const { DEFAULT_CONFIG } = require('../src/config');

describe('audit', () => {
  test('collectGeneratedAssetUsages finds dotted registry accesses', () => {
    const source = `
      const image = Assets.toast.info;
      const anim = Lotties.loading;
      const svg = Svgs.logo;
      const noop = Other.toast.info;
    `;

    expect(collectGeneratedAssetUsages(source, 'example.tsx', DEFAULT_CONFIG)).toEqual({
      Assets: ['toast.info'],
      Lotties: ['loading'],
      Svgs: ['logo'],
    });
  });

  test('collectRequireAssetPaths resolves legacy relative require calls', () => {
    const source = `
      const icon = require('../assets/toast/info.png');
      const anim = require('../assets/lottie/loading.json');
    `;

    expect(
      collectRequireAssetPaths({
        code: source,
        filePath: 'src/components/Toast.tsx',
        projectRoot: '/repo',
      }),
    ).toEqual(['src/assets/lottie/loading.json', 'src/assets/toast/info.png']);
  });

  test('auditAssetUsage reports unused entries and unknown generated keys', () => {
    const report = auditAssetUsage({
      manifest: {
        generatedAt: '2026-04-13T00:00:00.000Z',
        types: {
          image: [
            {
              keyPath: 'toast.info',
              filePath: 'src/assets/toast/info.png',
              modulePath: '../assets/toast/info.png',
            },
            {
              keyPath: 'toast.warning',
              filePath: 'src/assets/toast/warning.png',
              modulePath: '../assets/toast/warning.png',
            },
          ],
          lottie: [
            {
              keyPath: 'loading',
              filePath: 'src/assets/lottie/loading.json',
              modulePath: '../assets/lottie/loading.json',
            },
          ],
          svg: [],
        },
      },
      generatedUsages: {
        Assets: ['toast.info', 'toast.missing'],
        Lotties: ['loading'],
        Svgs: [],
      },
      requirePaths: ['src/assets/toast/info.png'],
      config: DEFAULT_CONFIG,
    });

    expect(report.unknownGeneratedUsages).toEqual(['Assets.toast.missing']);
    expect(report.unusedEntries).toEqual(['image:toast.warning']);
  });

  test('resolveUnusedManifestEntries maps unused keys back to exact file paths', () => {
    expect(
      resolveUnusedManifestEntries({
        manifest: {
          generatedAt: '2026-04-13T00:00:00.000Z',
          types: {
            image: [
              {
                keyPath: 'toast.warning',
                filePath: 'src/assets/toast/warning.png',
                modulePath: '../assets/toast/warning.png',
              },
            ],
            lottie: [],
            svg: [],
          },
        },
        unusedEntries: ['image:toast.warning'],
      }),
    ).toEqual([
      {
        type: 'image',
        keyPath: 'toast.warning',
        filePath: 'src/assets/toast/warning.png',
        modulePath: '../assets/toast/warning.png',
      },
    ]);
  });

  test('applyAuditFix deletes unused files and leaves used files intact', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-audit-fix-'));
    const writeFile = relativePath => {
      const absolutePath = path.join(projectRoot, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, 'test');
    };

    writeFile('src/assets/toast/info.png');
    writeFile('src/assets/toast/warning.png');

    const deletedFiles = applyAuditFix({
      projectRoot,
      manifest: {
        generatedAt: '2026-04-13T00:00:00.000Z',
        types: {
          image: [
            {
              keyPath: 'toast.info',
              filePath: 'src/assets/toast/info.png',
              modulePath: '../assets/toast/info.png',
            },
            {
              keyPath: 'toast.warning',
              filePath: 'src/assets/toast/warning.png',
              modulePath: '../assets/toast/warning.png',
            },
          ],
          lottie: [],
          svg: [],
        },
      },
      unusedEntries: ['image:toast.warning'],
    });

    expect(deletedFiles).toEqual(['src/assets/toast/warning.png']);
    expect(fs.existsSync(path.join(projectRoot, 'src/assets/toast/info.png'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/assets/toast/warning.png'))).toBe(false);
  });
});
