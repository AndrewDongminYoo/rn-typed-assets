#!/usr/bin/env node
'use strict';

const path = require('path');

const { DEFAULT_CONFIG, loadConfig, mergeConfig } = require('./config');
const { parseCliArgs, writeGeneratedAssets } = require('./core');
const { main: auditMain } = require('./audit');

const USAGE = `
Usage: rn-typed-assets <command> [options]

Commands:
  generate    Generate typed asset registry (assets.gen.ts + assets.manifest.json)
  audit       Audit asset usage against generated manifest

Options (generate):
  --types <types>     Comma-separated asset types (e.g. image,lottie)
  --root <path>       Project root directory (default: cwd)
  --config <path>     Path to config file (default: ./rn-typed-assets.config.js)

Options (audit):
  --types <types>     Comma-separated asset types
  --fix               Delete unused asset files and regenerate
  --root <path>       Project root directory (default: cwd)
  --config <path>     Path to config file (default: ./rn-typed-assets.config.js)
`.trim();

const parseRootArg = argv => {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--root=')) {
      return argv[i].slice('--root='.length);
    }

    if (argv[i] === '--root' && argv[i + 1]) {
      return argv[i + 1];
    }
  }

  return process.cwd();
};

const parseConfigArg = argv => {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--config=')) {
      return argv[i].slice('--config='.length);
    }

    if (argv[i] === '--config' && argv[i + 1]) {
      return argv[i + 1];
    }
  }

  return null;
};

const resolveConfig = (projectRoot, configFilePath) => {
  if (configFilePath) {
    return mergeConfig(DEFAULT_CONFIG, require(path.resolve(configFilePath)));
  }

  return loadConfig(projectRoot);
};

const runGenerate = (argv, projectRoot, config) => {
  try {
    const { types } = parseCliArgs(argv, config);
    const { entries } = writeGeneratedAssets({
      projectRoot,
      types,
      config,
    });

    console.log(`Generated ${entries.length} asset bindings for types: ${types.join(', ')}`);
  } catch (error) {
    console.error(`Failed to generate assets: ${error.message}`);
    process.exit(1);
  }
};

const runAudit = (argv, projectRoot, config) => {
  const originalCwd = process.cwd;

  process.cwd = () => projectRoot;

  try {
    auditMain(argv, config);
  } finally {
    process.cwd = originalCwd;
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

  console.error(`Unknown command: ${command}\n`);
  console.log(USAGE);
  process.exit(1);
};

main();
