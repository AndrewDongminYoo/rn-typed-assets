'use strict';

const fs = require('fs');
const path = require('path');

const {
  collectAssetEntries,
  generateAssetsManifest,
  parseCliArgs,
  writeGeneratedAssets,
} = require('./core');
const {
  buildSourceFile,
  extractPropertyChain,
  requireTypescript,
} = require('./ts-util');

const sortUnique = (values) =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const parseAuditCliArgs = (argv, config) => {
  const parsed = parseCliArgs(argv, config);
  const fix = argv.includes('--fix');

  return {
    ...parsed,
    fix,
  };
};

const buildGeneratedRoots = (config) =>
  Object.fromEntries(
    Object.entries(config.types).map(([type, tc]) => [tc.exportName, type]),
  );

const collectGeneratedAssetUsages = (code, filePath, config) => {
  const ts = requireTypescript();
  const generatedRoots = buildGeneratedRoots(config);
  const sourceFile = buildSourceFile(code, filePath);
  const collected = Object.fromEntries(
    Object.keys(generatedRoots).map((k) => [k, new Set()]),
  );

  const visit = (node) => {
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const chain = extractPropertyChain(node, generatedRoots);
      const parent = node.parent;
      const isNestedInLongerChain =
        (ts.isPropertyAccessExpression(parent) ||
          ts.isElementAccessExpression(parent)) &&
        parent.expression === node;

      if (chain && chain.segments.length > 0 && !isNestedInLongerChain) {
        collected[chain.root].add(chain.segments.join('.'));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return Object.fromEntries(
    Object.entries(collected).map(([root, set]) => [root, sortUnique(set)]),
  );
};

const collectRequireAssetPaths = ({ code, filePath, projectRoot }) => {
  const ts = requireTypescript();
  const sourceFile = buildSourceFile(code, filePath);
  const collected = new Set();
  const baseDir = path.join(projectRoot, path.dirname(filePath));

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const requestedPath = node.arguments[0].text;

      if (requestedPath.startsWith('.')) {
        const resolved = path.resolve(baseDir, requestedPath);
        const relativePath = path.relative(projectRoot, resolved);

        if (!relativePath.startsWith('..')) {
          collected.add(relativePath.split(path.sep).join('/'));
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return sortUnique(collected);
};

const auditAssetUsage = ({
  manifest,
  generatedUsages,
  requirePaths,
  config,
}) => {
  const requirePathSet = new Set(requirePaths);
  const generatedRoots = buildGeneratedRoots(config);
  const manifestEntries = [];
  const knownGeneratedKeys = new Map();

  for (const [rootName, type] of Object.entries(generatedRoots)) {
    for (const entry of manifest.types[type] || []) {
      knownGeneratedKeys.set(`${rootName}.${entry.keyPath}`, entry);
      manifestEntries.push({ type, ...entry });
    }
  }

  const unknownGeneratedUsages = [];
  const generatedUsageSet = new Set();

  for (const [rootName, keyPaths] of Object.entries(generatedUsages)) {
    for (const keyPath of keyPaths) {
      const fullKey = `${rootName}.${keyPath}`;

      if (!knownGeneratedKeys.has(fullKey)) {
        unknownGeneratedUsages.push(fullKey);
        continue;
      }

      generatedUsageSet.add(fullKey);
    }
  }

  const unusedEntries = manifestEntries
    .filter((entry) => {
      const rootName = config.types[entry.type]?.exportName;
      const fullKey = `${rootName}.${entry.keyPath}`;

      return (
        !generatedUsageSet.has(fullKey) && !requirePathSet.has(entry.filePath)
      );
    })
    .map((entry) => `${entry.type}:${entry.keyPath}`)
    .sort((left, right) => left.localeCompare(right));

  return {
    unknownGeneratedUsages: sortUnique(unknownGeneratedUsages),
    unusedEntries,
  };
};

const resolveUnusedManifestEntries = ({ manifest, unusedEntries }) => {
  const entriesByKey = new Map();

  for (const type of Object.keys(manifest.types || {})) {
    for (const entry of manifest.types[type] || []) {
      entriesByKey.set(`${type}:${entry.keyPath}`, {
        type,
        ...entry,
      });
    }
  }

  return unusedEntries.map((unusedEntry) => {
    const resolved = entriesByKey.get(unusedEntry);

    if (!resolved) {
      throw new Error(`Unable to resolve unused asset entry: ${unusedEntry}`);
    }

    return resolved;
  });
};

const applyAuditFix = ({ projectRoot, manifest, unusedEntries }) => {
  const resolvedEntries = resolveUnusedManifestEntries({
    manifest,
    unusedEntries,
  });
  const deletedFiles = [];

  for (const entry of resolvedEntries) {
    const absolutePath = path.join(projectRoot, entry.filePath);

    try {
      fs.unlinkSync(absolutePath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      continue;
    }

    deletedFiles.push(entry.filePath);
  }

  return deletedFiles.sort((left, right) => left.localeCompare(right));
};

const listProjectSourceFiles = (projectRoot, sourceRoots) => {
  const roots = sourceRoots.map((r) => path.join(projectRoot, r));
  const files = [];

  const visit = (currentPath) => {
    if (!fs.existsSync(currentPath)) {
      return;
    }

    const stat = fs.statSync(currentPath);

    if (stat.isFile()) {
      if (
        /\.(ts|tsx|js|jsx)$/.test(currentPath) &&
        !currentPath.includes(`${path.sep}generated${path.sep}`)
      ) {
        files.push(currentPath);
      }
      return;
    }

    const dirents = fs
      .readdirSync(currentPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const dirent of dirents) {
      if (dirent.name.startsWith('.')) {
        continue;
      }

      visit(path.join(currentPath, dirent.name));
    }
  };

  roots.forEach(visit);

  return files.map((filePath) =>
    path.relative(projectRoot, filePath).split(path.sep).join('/'),
  );
};

const compareManifestToFilesystem = ({
  projectRoot,
  manifest,
  types,
  config,
}) => {
  const discoveredEntries = collectAssetEntries({
    projectRoot,
    types,
    config,
  });
  const discoveredManifest = generateAssetsManifest({
    entries: discoveredEntries,
    types,
    config,
    generatedAt: manifest.generatedAt,
  });

  return (
    JSON.stringify(discoveredManifest.types) === JSON.stringify(manifest.types)
  );
};

const main = (argv, config) => {
  try {
    const { types, fix } = parseAuditCliArgs(argv, config);
    const projectRoot = process.cwd();
    const manifestPath = path.join(
      projectRoot,
      config.outputDir,
      'assets.manifest.json',
    );

    if (!fs.existsSync(manifestPath)) {
      throw new Error(
        `Missing generated manifest: ${path.join(config.outputDir, 'assets.manifest.json')}`,
      );
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const sourceFiles = listProjectSourceFiles(projectRoot, config.sourceRoots);
    const generatedRoots = buildGeneratedRoots(config);
    const generatedUsageSets = Object.fromEntries(
      Object.keys(generatedRoots).map((k) => [k, new Set()]),
    );
    const requirePaths = new Set();

    for (const filePath of sourceFiles) {
      const code = fs.readFileSync(path.join(projectRoot, filePath), 'utf8');
      const usages = collectGeneratedAssetUsages(code, filePath, config);

      Object.entries(usages).forEach(([rootName, keyPaths]) => {
        keyPaths.forEach((keyPath) =>
          generatedUsageSets[rootName].add(keyPath),
        );
      });

      collectRequireAssetPaths({
        code,
        filePath,
        projectRoot,
      }).forEach((assetPath) => requirePaths.add(assetPath));
    }

    const report = auditAssetUsage({
      manifest,
      generatedUsages: Object.fromEntries(
        Object.entries(generatedUsageSets).map(([root, set]) => [
          root,
          sortUnique(set),
        ]),
      ),
      requirePaths: sortUnique(requirePaths),
      config,
    });
    const manifestMatchesFilesystem = compareManifestToFilesystem({
      projectRoot,
      manifest,
      types,
      config,
    });

    if (!manifestMatchesFilesystem) {
      console.error(
        'Generated manifest is stale relative to the current asset filesystem.',
      );
      process.exit(1);
    }

    if (report.unknownGeneratedUsages.length > 0) {
      console.error('Unknown generated asset usages detected:');
      report.unknownGeneratedUsages.forEach((value) =>
        console.error(`- ${value}`),
      );
      process.exit(1);
    }

    if (fix) {
      if (report.unusedEntries.length === 0) {
        console.log('No unused generated assets detected.');
        return;
      }

      const deletedFiles = applyAuditFix({
        projectRoot,
        manifest,
        unusedEntries: report.unusedEntries,
      });

      writeGeneratedAssets({
        projectRoot,
        types,
        config,
      });

      console.log('Deleted unused generated assets:');
      deletedFiles.forEach((value) => console.log(`- ${value}`));
      return;
    }

    if (report.unusedEntries.length > 0) {
      console.log('Unused generated assets:');
      report.unusedEntries.forEach((value) => console.log(`- ${value}`));
    } else {
      console.log('No unused generated assets detected.');
    }
  } catch (error) {
    console.error(`Failed to audit assets: ${error.message}`);
    process.exit(1);
  }
};

module.exports = {
  applyAuditFix,
  auditAssetUsage,
  buildGeneratedRoots,
  collectGeneratedAssetUsages,
  collectRequireAssetPaths,
  compareManifestToFilesystem,
  listProjectSourceFiles,
  parseAuditCliArgs,
  resolveUnusedManifestEntries,
  main,
};
