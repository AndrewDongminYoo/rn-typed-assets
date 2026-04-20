'use strict';

const path = require('path');

const { toPosixPath } = require('./core');
const { buildGeneratedRoots } = require('./audit');
const {
  buildSourceFile,
  extractPropertyChain,
  requireTypescript,
} = require('./ts-util');

const rootNameForType = (config, type) => config.types[type].exportName;

const buildFullSymbol = (config, type, keyPath) =>
  `${rootNameForType(config, type)}.${keyPath}`;

const getEntryLeafName = (entry) => {
  const segments = String(entry.keyPath || '')
    .split('.')
    .filter(Boolean);

  return segments[segments.length - 1] || '';
};

const getFileBasename = (filePath) => path.basename(filePath || '');

const selectMovedEntryCandidate = ({ previousEntry, nextCandidates }) => {
  if (nextCandidates.length <= 1) {
    return nextCandidates[0] || null;
  }

  const sameBasename = nextCandidates.filter(
    (candidate) =>
      getFileBasename(candidate.filePath) ===
      getFileBasename(previousEntry.filePath),
  );

  if (sameBasename.length === 1) {
    return sameBasename[0];
  }

  const sameLeafName = nextCandidates.filter(
    (candidate) =>
      getEntryLeafName(candidate) === getEntryLeafName(previousEntry),
  );

  if (sameLeafName.length === 1) {
    return sameLeafName[0];
  }

  throw new Error(
    `Ambiguous manifest diff for moved asset: ${previousEntry.filePath}`,
  );
};

const flattenManifestEntries = (manifest) => {
  const flattened = [];

  for (const [type, entries] of Object.entries(manifest?.types || {})) {
    for (const entry of entries || []) {
      flattened.push({ type, ...entry });
    }
  }

  return flattened;
};

const diffAssetManifests = ({ previousManifest, nextManifest, config }) => {
  const previousEntries = flattenManifestEntries(previousManifest);
  const nextEntries = flattenManifestEntries(nextManifest);
  const nextByContentHash = new Map();
  const currentSymbolsByFilePath = {};
  const renamedSymbols = {};

  for (const entry of nextEntries) {
    const fullSymbol = buildFullSymbol(config, entry.type, entry.keyPath);

    currentSymbolsByFilePath[entry.filePath] = fullSymbol;

    const contentKey = `${entry.type}:${entry.contentHash || ''}`;

    if (!nextByContentHash.has(contentKey)) {
      nextByContentHash.set(contentKey, []);
    }

    nextByContentHash.get(contentKey).push(entry);
  }

  for (const previousEntry of previousEntries) {
    const fullPreviousSymbol = buildFullSymbol(
      config,
      previousEntry.type,
      previousEntry.keyPath,
    );
    const candidates =
      nextByContentHash.get(
        `${previousEntry.type}:${previousEntry.contentHash || ''}`,
      ) || [];
    const matchedEntry =
      selectMovedEntryCandidate({
        nextCandidates: candidates,
        previousEntry,
      }) ||
      nextEntries.find(
        (entry) =>
          entry.type === previousEntry.type &&
          entry.keyPath === previousEntry.keyPath,
      );

    if (!matchedEntry) {
      continue;
    }

    const fullCurrentSymbol = buildFullSymbol(
      config,
      matchedEntry.type,
      matchedEntry.keyPath,
    );

    currentSymbolsByFilePath[previousEntry.filePath] = fullCurrentSymbol;

    if (fullPreviousSymbol !== fullCurrentSymbol) {
      renamedSymbols[fullPreviousSymbol] = fullCurrentSymbol;
    }
  }

  return { currentSymbolsByFilePath, renamedSymbols };
};

const applyReplacements = (code, replacements) => {
  if (replacements.length === 0) {
    return code;
  }

  return [...replacements]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (result, replacement) =>
        result.slice(0, replacement.start) +
        replacement.text +
        result.slice(replacement.end),
      code,
    );
};

const addGeneratedAssetImport = ({
  code,
  filePath,
  projectRoot,
  config,
  neededRoots,
}) => {
  if (neededRoots.size === 0) {
    return code;
  }

  const ts = requireTypescript();
  const sourceFile = buildSourceFile(code, filePath);
  const generatedModulePath = toPosixPath(
    path.relative(
      path.dirname(path.join(projectRoot, filePath)),
      path.join(projectRoot, config.outputDir, 'assets.gen'),
    ),
  );
  const normalizedModulePath = generatedModulePath.startsWith('.')
    ? generatedModulePath
    : `./${generatedModulePath}`;
  const importDeclarations = sourceFile.statements.filter((statement) =>
    ts.isImportDeclaration(statement),
  );
  const existingImport = importDeclarations.find(
    (statement) => statement.moduleSpecifier.text === normalizedModulePath,
  );

  if (existingImport) {
    const currentSpecifiers = new Set();
    const namedBindings = existingImport.importClause?.namedBindings;

    if (namedBindings && ts.isNamedImports(namedBindings)) {
      namedBindings.elements.forEach((element) =>
        currentSpecifiers.add(element.name.text),
      );
    }

    const nextSpecifiers = [
      ...new Set([...currentSpecifiers, ...neededRoots]),
    ].sort((left, right) => left.localeCompare(right));

    if (nextSpecifiers.length === currentSpecifiers.size) {
      return code;
    }

    const replacement = `import { ${nextSpecifiers.join(', ')} } from '${normalizedModulePath}';`;

    return applyReplacements(code, [
      {
        end: existingImport.getEnd(),
        start: existingImport.getStart(sourceFile),
        text: replacement,
      },
    ]);
  }

  const importText = `import { ${[...neededRoots]
    .sort((left, right) => left.localeCompare(right))
    .join(', ')} } from '${normalizedModulePath}';\n`;
  const insertAt =
    importDeclarations.length > 0
      ? importDeclarations[importDeclarations.length - 1].getEnd() + 1
      : 0;

  return code.slice(0, insertAt) + importText + code.slice(insertAt);
};

const rewriteTypedAssetSource = ({
  code,
  filePath,
  previousManifest,
  nextManifest,
  projectRoot,
  config,
}) => {
  const ts = requireTypescript();
  const generatedRoots = buildGeneratedRoots(config);
  const sourceFile = buildSourceFile(code, filePath);
  const { currentSymbolsByFilePath, renamedSymbols } = diffAssetManifests({
    nextManifest,
    previousManifest,
    config,
  });
  const replacements = [];
  const neededRoots = new Set();

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text.startsWith('.')
    ) {
      const resolved = path.resolve(
        path.join(projectRoot, path.dirname(filePath)),
        node.arguments[0].text,
      );
      const relativeFilePath = toPosixPath(
        path.relative(projectRoot, resolved),
      );
      const nextSymbol = currentSymbolsByFilePath[relativeFilePath];

      if (nextSymbol) {
        replacements.push({
          end: node.getEnd(),
          start: node.getStart(sourceFile),
          text: nextSymbol,
        });
        neededRoots.add(nextSymbol.split('.')[0]);
      }
    }

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
        const currentSymbol = `${chain.root}.${chain.segments.join('.')}`;
        const nextSymbol = renamedSymbols[currentSymbol];

        if (nextSymbol) {
          replacements.push({
            end: node.getEnd(),
            start: node.getStart(sourceFile),
            text: nextSymbol,
          });
          neededRoots.add(nextSymbol.split('.')[0]);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  const rewrittenCode = applyReplacements(code, replacements);
  const codeWithImports = addGeneratedAssetImport({
    code: rewrittenCode,
    filePath,
    neededRoots,
    projectRoot,
    config,
  });

  return {
    changed: codeWithImports !== code,
    code: codeWithImports,
  };
};

module.exports = {
  diffAssetManifests,
  flattenManifestEntries,
  rewriteTypedAssetSource,
};
