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

  test('organize resolves the assets directory placed after a value-taking flag', () => {
    const { projectRoot, writeFile } = makeTempProject();

    writeFile('src/assets/svgs/logo.svg', '<svg />');
    fs.mkdirSync(path.join(projectRoot, 'src/assets/svg'), { recursive: true });

    const result = runCli(projectRoot, [
      'organize',
      '--output',
      'json',
      'src/assets',
      '--types=svg',
    ]);

    expect(result.status).toBe(0);

    const envelope = JSON.parse(result.stdout.trim());

    expect(envelope.ok).toBe(true);
    expect(envelope.data.movedFiles).toEqual([
      'src/assets/svgs/logo.svg -> src/assets/svg/logo.svg',
    ]);
    expect(
      fs.existsSync(path.join(projectRoot, 'src/assets/svg/logo.svg')),
    ).toBe(true);
  });

  test('generate --output json prints a single JSON envelope with entries', () => {
    const { projectRoot, writeFile } = makeTempProject();

    writeFile('src/assets/icons/home.png');
    writeFile('src/assets/lottie/loading.json', '{}');

    const result = runCli(projectRoot, [
      'generate',
      '--types=image,lottie',
      '--output',
      'json',
    ]);

    expect(result.status).toBe(0);

    const envelope = JSON.parse(result.stdout.trim());

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('generate');
    expect(envelope.data.count).toBe(2);
    expect(
      envelope.data.entries.map((entry) => `${entry.type}:${entry.keyPath}`),
    ).toEqual(['image:icons.home', 'lottie:loading']);
  });

  test('generate --case snake produces snake_case keys', () => {
    const { projectRoot, writeFile } = makeTempProject();

    writeFile('src/assets/icons/home-button.png');

    const result = runCli(projectRoot, [
      'generate',
      '--types=image',
      '--case',
      'snake',
      '--output',
      'json',
    ]);

    expect(result.status).toBe(0);

    const envelope = JSON.parse(result.stdout.trim());

    expect(envelope.data.entries.map((entry) => entry.keyPath)).toEqual([
      'icons.home_button',
    ]);
  });

  test('generate --on-collision first drops duplicates and reports collisions', () => {
    const { projectRoot, writeFile } = makeTempProject();

    writeFile('src/assets/icons/home-button.png');
    writeFile('src/assets/icons/home_button.png');

    const result = runCli(projectRoot, [
      'generate',
      '--types=image',
      '--on-collision',
      'first',
      '--output',
      'json',
    ]);

    expect(result.status).toBe(0);

    const envelope = JSON.parse(result.stdout.trim());

    expect(envelope.ok).toBe(true);
    expect(envelope.data.count).toBe(1);
    expect(envelope.data.collisions).toHaveLength(1);
    expect(envelope.data.collisions[0].keyPath).toBe('icons.homeButton');
  });

  test('generate collision defaults to error and emits a JSON failure envelope', () => {
    const { projectRoot, writeFile } = makeTempProject();

    writeFile('src/assets/icons/home-button.png');
    writeFile('src/assets/icons/home_button.png');

    const result = runCli(projectRoot, [
      'generate',
      '--types=image',
      '--output',
      'json',
    ]);

    expect(result.status).toBe(1);

    const envelope = JSON.parse(result.stdout.trim());

    expect(envelope.ok).toBe(false);
    expect(envelope.command).toBe('generate');
    expect(envelope.error.message).toMatch(/Duplicate generated asset key/);
  });

  test('audit --output json emits a structured envelope', () => {
    const { projectRoot, writeFile } = makeTempProject();

    writeFile('src/assets/icons/home.png');

    expect(runCli(projectRoot, ['generate', '--types=image']).status).toBe(0);

    const result = runCli(projectRoot, [
      'audit',
      '--types=image',
      '--output',
      'json',
    ]);

    expect(result.status).toBe(0);

    const envelope = JSON.parse(result.stdout.trim());

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('audit');
    expect(envelope.data.manifestMatchesFilesystem).toBe(true);
    expect(envelope.data.unusedEntries).toEqual(['image:icons.home']);
  });

  test('organize moves a flat asset directory into canonical subdirectories', () => {
    const { projectRoot, writeFile } = makeTempProject();

    writeFile('src/assets/logo.png');
    writeFile('src/assets/icon.svg', '<svg />');
    writeFile('src/assets/loading.json', '{}');

    const result = runCli(projectRoot, [
      'organize',
      'src/assets',
      '--output',
      'json',
    ]);

    expect(result.status).toBe(0);

    const envelope = JSON.parse(result.stdout.trim());

    expect(envelope.ok).toBe(true);
    expect(envelope.data.movedFiles.sort()).toEqual([
      'src/assets/icon.svg -> src/assets/svg/icon.svg',
      'src/assets/loading.json -> src/assets/lottie/loading.json',
      'src/assets/logo.png -> src/assets/images/logo.png',
    ]);
  });

  test('generate succeeds when a configured asset root does not exist', () => {
    const { projectRoot, writeFile } = makeTempProject();

    writeFile('src/assets/logo.png');

    const result = runCli(projectRoot, ['generate', '--output', 'json']);

    expect(result.status).toBe(0);

    const envelope = JSON.parse(result.stdout.trim());

    expect(envelope.ok).toBe(true);
    expect(envelope.data.count).toBe(1);

    const generatedModule = fs.readFileSync(
      path.join(projectRoot, 'src/generated/assets.gen.ts'),
      'utf8',
    );

    expect(generatedModule).toContain("logo: require('../assets/logo.png')");
    expect(generatedModule).toContain('export const Svgs = {} as const;');
  });
});
