#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { DEFAULT_CONFIG, loadConfig, mergeConfig } = require('./config');
const {
  collectAssetEntries,
  generateAssetsManifest,
  parseCliArgs,
  parseTypesArg,
  writeGeneratedAssets,
} = require('./core');
const { listProjectSourceFiles } = require('./audit');
const { rewriteTypedAssetSource } = require('./codemod');
const { parseOutputArg, emitSuccess, emitFailure } = require('./output');

const USAGE = `
Usage: rn-typed-assets <command> [options]

Commands:
  generate              Generate typed asset registry (assets.gen.ts + assets.manifest.json)
  audit                 Audit asset usage against generated manifest
  organize <assetsDir>  Move assets into canonical subdirs and regenerate

Common options (all commands):
  --case <camel|snake>          Casing for generated asset keys (default: camel)
  --on-collision <error|first>  Key collision policy (default: error)
  --output <text|json>          Output format; json prints one machine-readable
                                envelope to stdout (default: text)
  --root <path>                 Project root directory (default: cwd)
  --config <path>               Path to config file (default: ./rn-typed-assets.config.js)

Options (generate):
  --types <types>     Comma-separated asset types (e.g. image,lottie)
  --inplace           Rewrite source files to update asset references

Options (audit):
  --types <types>     Comma-separated asset types
  --fix               Delete unused asset files and regenerate

Options (organize):
  --types <types>     Comma-separated asset types
`.trim();

const parseFlagValue = (argv, flag) => {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith(`${flag}=`)) {
      return argv[i].slice(flag.length + 1);
    }

    if (argv[i] === flag && argv[i + 1]) {
      return argv[i + 1];
    }
  }

  return null;
};

const parseRootArg = (argv) => parseFlagValue(argv, '--root') ?? process.cwd();
const parseConfigArg = (argv) => parseFlagValue(argv, '--config');

const hasFlag = (argv, flag) => argv.includes(flag);

const resolveConfig = (projectRoot, configFilePath) => {
  if (configFilePath) {
    return mergeConfig(DEFAULT_CONFIG, require(path.resolve(configFilePath)));
  }

  return loadConfig(projectRoot);
};

const applyCliOverrides = (config, argv) => {
  const keyCase = parseFlagValue(argv, '--case');
  const onCollision = parseFlagValue(argv, '--on-collision');

  if (keyCase == null && onCollision == null) {
    return config;
  }

  return mergeConfig(config, {
    ...(keyCase != null ? { keyCase } : {}),
    ...(onCollision != null ? { onCollision } : {}),
  });
};

const readGeneratedManifest = (projectRoot, config) => {
  const manifestPath = path.join(
    projectRoot,
    config.outputDir,
    'assets.manifest.json',
  );

  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
};

const rewriteProjectSources = ({
  nextManifest,
  previousManifest,
  projectRoot,
  config,
}) => {
  let rewrittenFiles = 0;

  for (const filePath of listProjectSourceFiles(
    projectRoot,
    config.sourceRoots,
  )) {
    const absolutePath = path.join(projectRoot, filePath);
    const code = fs.readFileSync(absolutePath, 'utf8');
    const result = rewriteTypedAssetSource({
      code,
      filePath,
      nextManifest,
      previousManifest,
      projectRoot,
      config,
    });

    if (!result.changed) {
      continue;
    }

    fs.writeFileSync(absolutePath, result.code);
    rewrittenFiles += 1;
  }

  return rewrittenFiles;
};

const listFilesRecursively = (absoluteRoot) => {
  const files = [];

  const visit = (currentPath) => {
    if (
      !fs.existsSync(currentPath) ||
      !fs.statSync(currentPath).isDirectory()
    ) {
      return;
    }

    const dirents = fs
      .readdirSync(currentPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const dirent of dirents) {
      if (dirent.name.startsWith('.')) {
        continue;
      }

      const nextPath = path.join(currentPath, dirent.name);

      if (dirent.isDirectory()) {
        visit(nextPath);
        continue;
      }

      files.push(nextPath);
    }
  };

  visit(absoluteRoot);

  return files;
};

const detectAssetType = (filePath, config) => {
  const extension = path.extname(filePath).toLowerCase();

  for (const [type, typeConfig] of Object.entries(config.types)) {
    if (typeConfig.extensions.has(extension)) {
      return type;
    }
  }

  return null;
};

const CANONICAL_SUBDIR = {
  image: 'images',
  svg: 'svg',
  lottie: 'lottie',
};

const LEGACY_SUBDIRS = {
  image: ['images'],
  svg: ['svg', 'svgs'],
  lottie: ['lottie', 'lotties'],
};

const isNestedPath = (parentPath, childPath) => {
  const relativePath = path.relative(parentPath, childPath);

  return (
    Boolean(relativePath) &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
};

const resolveOrganizeDestinationRoot = ({
  assetsAbsoluteDir,
  projectRoot,
  config,
  type,
}) => {
  const typeRootDir = config.types[type]?.rootDir;

  if (typeRootDir) {
    const configuredRoot = path.resolve(projectRoot, typeRootDir);

    if (isNestedPath(assetsAbsoluteDir, configuredRoot)) {
      return configuredRoot;
    }
  }

  return path.join(assetsAbsoluteDir, CANONICAL_SUBDIR[type] || type);
};

const resolveOrganizeRelativePath = ({
  absoluteFilePath,
  assetsAbsoluteDir,
  destinationRoot,
  type,
}) => {
  if (absoluteFilePath.startsWith(`${destinationRoot}${path.sep}`)) {
    return null;
  }

  for (const legacySubdir of LEGACY_SUBDIRS[type] || []) {
    const legacyRoot = path.join(assetsAbsoluteDir, legacySubdir);

    if (absoluteFilePath.startsWith(`${legacyRoot}${path.sep}`)) {
      return path.relative(legacyRoot, absoluteFilePath);
    }
  }

  return path.relative(assetsAbsoluteDir, absoluteFilePath);
};

const toEntryData = (entries) =>
  entries.map((entry) => ({
    type: entry.type,
    keyPath: entry.keyPath,
    filePath: entry.filePath,
    modulePath: entry.modulePath,
  }));

const collisionTextLines = (collisions) =>
  collisions.map(
    (collision) =>
      `Collision: kept ${collision.kept}, dropped ${collision.dropped} (key ${collision.type}:${collision.keyPath})`,
  );

const runGenerate = (argv, projectRoot, config, output) => {
  const { types } = parseCliArgs(argv, config);
  const inplace = hasFlag(argv, '--inplace');
  const previousManifest = inplace
    ? readGeneratedManifest(projectRoot, config)
    : null;
  const { entries, manifest, collisions } = writeGeneratedAssets({
    projectRoot,
    types,
    config,
  });

  let rewrittenFiles = 0;

  if (inplace) {
    rewrittenFiles = rewriteProjectSources({
      nextManifest: manifest,
      previousManifest,
      projectRoot,
      config,
    });
  }

  emitSuccess({
    output,
    command: 'generate',
    data: {
      types,
      count: entries.length,
      rewrittenFiles,
      collisions,
      entries: toEntryData(entries),
    },
    textLines: [
      ...collisionTextLines(collisions),
      ...(rewrittenFiles > 0
        ? [`Rewrote ${rewrittenFiles} source file(s).`]
        : []),
      `Generated ${entries.length} asset bindings for types: ${types.join(', ')}`,
    ],
  });
};

const runAudit = (argv, projectRoot, config, output) => {
  const { main: auditMain } = require('./audit');
  const originalCwd = process.cwd;

  process.cwd = () => projectRoot;

  try {
    auditMain(argv, config, { output });
  } finally {
    process.cwd = originalCwd;
  }
};

const runOrganize = (argv, projectRoot, config, output) => {
  const typesArg = parseFlagValue(argv, '--types');
  const types = parseTypesArg(typesArg, config);
  const positionals = argv.filter(
    (arg) => !arg.startsWith('-') && arg !== typesArg,
  );
  const assetsDir = positionals[0];

  if (!assetsDir) {
    throw new Error('The organize command requires an assets directory.');
  }

  const previousManifest = generateAssetsManifest({
    entries: collectAssetEntries({ projectRoot, types, config }),
    types,
    config,
  });
  const assetsAbsoluteDir = path.join(projectRoot, assetsDir);
  const movedFiles = [];

  for (const absoluteFilePath of listFilesRecursively(assetsAbsoluteDir)) {
    const type = detectAssetType(absoluteFilePath, config);

    if (!type || !types.includes(type)) {
      continue;
    }

    const destinationRoot = resolveOrganizeDestinationRoot({
      assetsAbsoluteDir,
      projectRoot,
      config,
      type,
    });

    const relativePath = resolveOrganizeRelativePath({
      absoluteFilePath,
      assetsAbsoluteDir,
      destinationRoot,
      type,
    });

    if (!relativePath) {
      continue;
    }

    const destinationPath = path.join(destinationRoot, relativePath);

    if (destinationPath === absoluteFilePath) {
      continue;
    }

    if (fs.existsSync(destinationPath)) {
      throw new Error(
        `Organize destination already exists: ${path.relative(projectRoot, destinationPath)}`,
      );
    }

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.renameSync(absoluteFilePath, destinationPath);
    movedFiles.push(
      `${path.relative(projectRoot, absoluteFilePath).split(path.sep).join('/')} -> ${path
        .relative(projectRoot, destinationPath)
        .split(path.sep)
        .join('/')}`,
    );
  }

  const { entries, manifest, collisions } = writeGeneratedAssets({
    projectRoot,
    types,
    config,
  });
  const rewrittenFiles = rewriteProjectSources({
    nextManifest: manifest,
    previousManifest,
    projectRoot,
    config,
  });

  emitSuccess({
    output,
    command: 'organize',
    data: {
      types,
      count: entries.length,
      movedFiles,
      rewrittenFiles,
      collisions,
    },
    textLines: [
      ...movedFiles.map((value) => `Moved: ${value}`),
      ...collisionTextLines(collisions),
      ...(rewrittenFiles > 0
        ? [`Rewrote ${rewrittenFiles} source file(s).`]
        : []),
      `Generated ${entries.length} asset bindings for types: ${types.join(', ')}`,
    ],
  });
};

const KNOWN_COMMANDS = new Set(['generate', 'audit', 'organize']);

const main = () => {
  const [, , command, ...rest] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  let output = 'text';

  try {
    output = parseOutputArg(rest);
  } catch (error) {
    emitFailure({ output: 'text', command, message: error.message });
    process.exit(1);
  }

  if (!KNOWN_COMMANDS.has(command)) {
    emitFailure({ output, command, message: `Unknown command: ${command}` });

    if (output === 'text') {
      console.log(USAGE);
    }

    process.exit(1);
  }

  try {
    const projectRoot = path.resolve(parseRootArg(rest));
    const configFilePath = parseConfigArg(rest);
    const config = applyCliOverrides(
      resolveConfig(projectRoot, configFilePath),
      rest,
    );

    if (command === 'generate') {
      runGenerate(rest, projectRoot, config, output);
      return;
    }

    if (command === 'audit') {
      runAudit(rest, projectRoot, config, output);
      return;
    }

    runOrganize(rest, projectRoot, config, output);
  } catch (error) {
    emitFailure({ output, command, message: error.message });
    process.exit(1);
  }
};

main();
