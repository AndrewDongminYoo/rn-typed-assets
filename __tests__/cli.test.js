'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cliPath = path.join(__dirname, '..', 'src', 'cli.js');

const makeTempProject = () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-cli-'));

  const writeFile = (relativePath, content = 'test') => {
    const absolutePath = path.join(projectRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  };

  return { projectRoot, writeFile };
};

const runCli = (projectRoot, args) =>
  spawnSync(process.execPath, [cliPath, ...args, '--root', projectRoot], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

describe('cli', () => {
  test('organize moves legacy plural folders into configured generate roots', () => {
    const { projectRoot, writeFile } = makeTempProject();

    writeFile('src/assets/svgs/logo.svg', '<svg />');
    writeFile('src/assets/lotties/loading.json', '{}');
    fs.mkdirSync(path.join(projectRoot, 'src/assets/svg'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(projectRoot, 'src/assets/lottie'), {
      recursive: true,
    });

    const result = runCli(projectRoot, [
      'organize',
      'src/assets',
      '--types=svg,lottie',
    ]);

    expect(result.status).toBe(0);
    expect(
      fs.existsSync(path.join(projectRoot, 'src/assets/svg/logo.svg')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(projectRoot, 'src/assets/lottie/loading.json')),
    ).toBe(true);
    const generatedModule = fs.readFileSync(
      path.join(projectRoot, 'src/generated/assets.gen.ts'),
      'utf8',
    );

    expect(generatedModule).toContain(
      "logo: require('../assets/svg/logo.svg')",
    );
    expect(generatedModule).toContain(
      "loading: require('../assets/lottie/loading.json')",
    );
  });
});
