#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RESERVED_WORDS = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

const toPosixPath = (value) => value.split(path.sep).join('/');

const hashFileContent = (absoluteFilePath) =>
  crypto
    .createHash('sha1')
    .update(fs.readFileSync(absoluteFilePath))
    .digest('hex');

const parseTypesArg = (rawTypes, config) => {
  const validTypes = Object.keys(config.types);

  if (!rawTypes) {
    return validTypes;
  }

  const uniqueTypes = new Set(
    (Array.isArray(rawTypes) ? rawTypes : String(rawTypes).split(','))
      .map((value) => value.trim())
      .filter(Boolean),
  );

  for (const type of uniqueTypes) {
    if (!validTypes.includes(type)) {
      throw new Error(`Unsupported asset type: ${type}`);
    }
  }

  return validTypes.filter((type) => uniqueTypes.has(type));
};

const parseCliArgs = (argv, config) => {
  let rawTypes;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg.startsWith('--types=')) {
      rawTypes = arg.slice('--types='.length);
      break;
    }

    if (arg === '--types') {
      rawTypes = argv[index + 1];
      break;
    }
  }

  return {
    types: parseTypesArg(rawTypes, config),
  };
};

const getScriptKind = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.tsx') {
    return 'tsx';
  }

  if (extension === '.ts') {
    return 'ts';
  }

  if (extension === '.jsx') {
    return 'jsx';
  }

  return 'js';
};

const normalizeAssetName = (value) => {
  const sanitized = String(value)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim();

  if (!sanitized) {
    throw new Error(`Unable to normalize asset name: "${value}"`);
  }

  const tokens = sanitized
    .split(/\s+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error(`Unable to normalize asset name: "${value}"`);
  }

  const [first, ...rest] = tokens;
  let normalized =
    first +
    rest.map((token) => token[0].toUpperCase() + token.slice(1)).join('');

  if (/^\d/.test(normalized)) {
    normalized = `n${normalized}`;
  }

  if (!/^[A-Za-z_$]/.test(normalized)) {
    normalized = `asset${normalized[0].toUpperCase()}${normalized.slice(1)}`;
  }

  if (RESERVED_WORDS.has(normalized)) {
    normalized = `asset${normalized[0].toUpperCase()}${normalized.slice(1)}`;
  }

  return normalized;
};

const listFilesRecursively = (absoluteRoot) => {
  const files = [];

  const visit = (currentPath) => {
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

const buildRegistryTree = (entries) => {
  const root = { kind: 'branch', children: new Map() };

  const getCollisionKey = (cursor, segment) => {
    let candidate = segment.endsWith('Asset')
      ? `${segment}File`
      : `${segment}Asset`;

    while (cursor.children.has(candidate)) {
      candidate = `${candidate}File`;
    }

    return candidate;
  };

  const rewriteEntrySegment = (entry, segmentIndex, nextSegment) => {
    entry.keySegments = [...entry.keySegments];
    entry.keySegments[segmentIndex] = nextSegment;
    entry.keyPath = entry.keySegments.join('.');
  };

  for (const entry of entries) {
    let cursor = root;

    entry.keySegments.forEach((segment, index) => {
      const isLeaf = index === entry.keySegments.length - 1;
      let existingNode = cursor.children.get(segment);

      if (isLeaf) {
        if (existingNode) {
          if (existingNode.kind === 'branch') {
            const resolvedLeafSegment = getCollisionKey(cursor, segment);

            rewriteEntrySegment(entry, index, resolvedLeafSegment);
            cursor.children.set(resolvedLeafSegment, { kind: 'leaf', entry });
            return;
          }

          const existingPath =
            existingNode.kind === 'leaf'
              ? existingNode.entry.filePath
              : `${entry.keyPath}/*`;

          throw new Error(
            `Duplicate generated asset key "${entry.keyPath}" for "${entry.filePath}" and "${existingPath}"`,
          );
        }

        cursor.children.set(segment, { kind: 'leaf', entry });
        return;
      }

      if (existingNode && existingNode.kind === 'leaf') {
        const resolvedLeafSegment = getCollisionKey(cursor, segment);

        rewriteEntrySegment(existingNode.entry, index, resolvedLeafSegment);
        cursor.children.delete(segment);
        cursor.children.set(resolvedLeafSegment, existingNode);
        existingNode = undefined;
      }

      if (!existingNode) {
        cursor.children.set(segment, { kind: 'branch', children: new Map() });
      }

      cursor = cursor.children.get(segment);
    });
  }

  return root;
};

const collectAssetEntries = ({ projectRoot, types, config }) => {
  const selectedTypes = parseTypesArg(types, config);
  const entries = [];
  const outputAbsDir = path.join(projectRoot, config.outputDir);

  for (const type of selectedTypes) {
    const typeConfig = config.types[type];
    const absoluteRoot = path.join(projectRoot, typeConfig.rootDir);

    if (
      !fs.existsSync(absoluteRoot) ||
      !fs.statSync(absoluteRoot).isDirectory()
    ) {
      throw new Error(
        `Asset root not found for type "${type}": ${typeConfig.rootDir}`,
      );
    }

    const files = listFilesRecursively(absoluteRoot);

    for (const absoluteFilePath of files) {
      const extension = path.extname(absoluteFilePath).toLowerCase();

      if (!typeConfig.extensions.has(extension)) {
        continue;
      }

      const relativeFilePath = toPosixPath(
        path.relative(projectRoot, absoluteFilePath),
      );
      const relativeToRoot = path.relative(absoluteRoot, absoluteFilePath);
      const parsed = path.parse(relativeToRoot);
      const dirSegments = parsed.dir
        ? parsed.dir.split(path.sep).filter(Boolean)
        : [];
      const keySegments = [
        ...dirSegments.map(normalizeAssetName),
        normalizeAssetName(parsed.name),
      ];

      entries.push({
        type,
        keyPath: keySegments.join('.'),
        keySegments,
        filePath: relativeFilePath,
        modulePath: toPosixPath(path.relative(outputAbsDir, absoluteFilePath)),
        contentHash: hashFileContent(absoluteFilePath),
      });
    }
  }

  entries.sort((left, right) => left.filePath.localeCompare(right.filePath));

  for (const type of selectedTypes) {
    buildRegistryTree(entries.filter((entry) => entry.type === type));
  }

  return entries;
};

const renderTreeNode = (node, valueType, indentLevel) => {
  const indent = '  '.repeat(indentLevel);
  const children = [...node.children.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );

  if (children.length === 0) {
    return '{}';
  }

  const lines = ['{'];

  for (const [key, child] of children) {
    if (child.kind === 'leaf') {
      lines.push(
        `${indent}  ${key}: require('${child.entry.modulePath}') as ${valueType},`,
      );
      continue;
    }

    lines.push(
      `${indent}  ${key}: ${renderTreeNode(child, valueType, indentLevel + 1)},`,
    );
  }

  lines.push(`${indent}}`);

  return lines.join('\n');
};

const generateAssetsModule = ({ entries, types, config }) => {
  const selectedTypes = parseTypesArg(types, config);
  const allTypes = Object.keys(config.types);
  const lines = [
    '/* eslint-disable @typescript-eslint/no-require-imports -- require() is intentional for React Native static asset bundling */',
    '// Auto-generated by rn-typed-assets. Do not edit manually.',
    '',
  ];

  // Collect type imports (deduplicated by module)
  const seenImports = new Map();

  for (const type of selectedTypes) {
    const typeConfig = config.types[type];

    if (typeConfig.typeImport) {
      const { typeName, from } = typeConfig.typeImport;

      if (!seenImports.has(from)) {
        seenImports.set(from, new Set());
      }

      seenImports.get(from).add(typeName);
    }
  }

  for (const [from, typeNames] of seenImports) {
    lines.push(
      `import type { ${[...typeNames].sort().join(', ')} } from '${from}';`,
    );
  }

  // Inline type aliases (e.g. SvgAssetSource = unknown)
  for (const type of selectedTypes) {
    const typeConfig = config.types[type];

    if (typeConfig.inlineType) {
      const inlineTypeName =
        typeConfig.inlineTypeName ?? `${typeConfig.exportName}AssetSource`;

      lines.push(`export type ${inlineTypeName} = ${typeConfig.inlineType};`);
    }
  }

  if (lines[lines.length - 1] !== '') {
    lines.push('');
  }

  for (const type of allTypes) {
    const typeConfig = config.types[type];
    const typeEntries = entries.filter((entry) => entry.type === type);
    const shouldEmit = selectedTypes.includes(type);

    if (!shouldEmit || typeEntries.length === 0) {
      lines.push(`export const ${typeConfig.exportName} = {} as const;`, '');
      continue;
    }

    const valueType =
      typeConfig.typeImport?.typeName ??
      typeConfig.inlineTypeName ??
      `${typeConfig.exportName}AssetSource`;
    const tree = buildRegistryTree(typeEntries);
    const objectLiteral = renderTreeNode(tree, valueType, 0);

    lines.push(
      `export const ${typeConfig.exportName} = ${objectLiteral} as const;`,
      '',
    );
  }

  return lines.join('\n').trimEnd() + '\n';
};

const generateAssetsManifest = ({
  entries,
  types,
  config,
  generatedAt = new Date().toISOString(),
}) => {
  const selectedTypes = parseTypesArg(types, config);
  const manifest = {
    generatedAt,
    selectedTypes,
    types: {},
  };

  for (const type of Object.keys(config.types)) {
    manifest.types[type] = entries
      .filter((entry) => entry.type === type)
      .map((entry) => ({
        contentHash: entry.contentHash,
        keyPath: entry.keyPath,
        filePath: entry.filePath,
        modulePath: entry.modulePath,
      }));
  }

  return manifest;
};

const writeGeneratedAssets = ({ projectRoot, types, config }) => {
  const selectedTypes = parseTypesArg(types, config);
  const entries = collectAssetEntries({
    projectRoot,
    types: selectedTypes,
    config,
  });
  const outputDir = path.join(projectRoot, config.outputDir);
  const moduleContent = generateAssetsModule({
    entries,
    types: selectedTypes,
    config,
  });
  const manifest = generateAssetsManifest({
    entries,
    types: selectedTypes,
    config,
  });

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'assets.gen.ts'), moduleContent);
  fs.writeFileSync(
    path.join(outputDir, 'assets.manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );

  return {
    entries,
    moduleContent,
    manifest,
  };
};

module.exports = {
  buildRegistryTree,
  collectAssetEntries,
  generateAssetsManifest,
  generateAssetsModule,
  getScriptKind,
  hashFileContent,
  normalizeAssetName,
  parseCliArgs,
  parseTypesArg,
  toPosixPath,
  writeGeneratedAssets,
};
