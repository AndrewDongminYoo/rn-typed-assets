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

const USAGE = `
Usage: rn-typed-assets <command> [options]

Commands:
  generate              Generate typed asset registry (assets.gen.ts + assets.manifest.json)
  audit                 Audit asset usage against generated manifest
  organize <assetsDir>  Move assets into canonical subdirs and regenerate

Options (generate):
  --types <types>     Comma-separated asset types (e.g. image,lottie)
  --inplace           Rewrite source files to update asset references
  --root <path>       Project root directory (default: cwd)
  --config <path>     Path to config file (default: ./rn-typed-assets.config.js)

Options (audit):
  --types <types>     Comma-separated asset types
  --fix               Delete unused asset files and regenerate
  --root <path>       Project root directory (default: cwd)
  --config <path>     Path to config file (default: ./rn-typed-assets.config.js)

Options (organize):
  --types <types>     Comma-separated asset types
  --root <path>       Project root directory (default: cwd)
  --config <path>     Path to config file (default: ./rn-typed-assets.config.js)
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

const runGenerate = (argv, projectRoot, config) => {
  try {
    const { types } = parseCliArgs(argv, config);
    const inplace = hasFlag(argv, '--inplace');
    const previousManifest = inplace
      ? readGeneratedManifest(projectRoot, config)
      : null;
    const { entries, manifest } = writeGeneratedAssets({
      projectRoot,
      types,
      config,
    });

    if (inplace) {
      const rewrittenFiles = rewriteProjectSources({
        nextManifest: manifest,
        previousManifest,
        projectRoot,
        config,
      });

      if (rewrittenFiles > 0) {
        console.log(`Rewrote ${rewrittenFiles} source file(s).`);
      }
    }

    console.log(
      `Generated ${entries.length} asset bindings for types: ${types.join(', ')}`,
    );
  } catch (error) {
    console.error(`Failed to generate assets: ${error.message}`);
    process.exit(1);
  }
};

const runAudit = (argv, projectRoot, config) => {
  const { main: auditMain } = require('./audit');
  const originalCwd = process.cwd;

  process.cwd = () => projectRoot;

  try {
    auditMain(argv, config);
  } finally {
    process.cwd = originalCwd;
  }
};

const runOrganize = (argv, projectRoot, config) => {
  try {
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

    const { entries, manifest } = writeGeneratedAssets({
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

    movedFiles.forEach((value) => console.log(`Moved: ${value}`));

    if (rewrittenFiles > 0) {
      console.log(`Rewrote ${rewrittenFiles} source file(s).`);
    }

    console.log(
      `Generated ${entries.length} asset bindings for types: ${types.join(', ')}`,
    );
  } catch (error) {
    console.error(`Failed to organize assets: ${error.message}`);
    process.exit(1);
  }
};

const main = () => {
  const [, , command, ...rest] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  const projectRoot = path.resolve(parseRootArg(rest));
  const configFilePath = parseConfigArg(rest);
  const config = resolveConfig(projectRoot, configFilePath);

  if (command === 'generate') {
    runGenerate(rest, projectRoot, config);
    return;
  }

  if (command === 'audit') {
    runAudit(rest, projectRoot, config);
    return;
  }

  if (command === 'organize') {
    runOrganize(rest, projectRoot, config);
    return;
  }

  console.error(`Unknown command: ${command}\n`);
  console.log(USAGE);
  process.exit(1);
};

main();
