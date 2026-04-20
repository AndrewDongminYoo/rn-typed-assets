'use strict';

const { getScriptKind } = require('./core');

let _ts = null;

const requireTypescript = () => {
  if (_ts) {
    return _ts;
  }

  try {
    _ts = require('typescript');
    return _ts;
  } catch {
    throw new Error(
      '[rn-typed-assets] "typescript" package is required for this operation.\n' +
        'Install it: npm install --save-dev typescript',
    );
  }
};

const buildSourceFile = (code, filePath) => {
  const ts = requireTypescript();
  const scriptKind = getScriptKind(filePath);

  return ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true,
    scriptKind === 'tsx'
      ? ts.ScriptKind.TSX
      : scriptKind === 'ts'
        ? ts.ScriptKind.TS
        : scriptKind === 'jsx'
          ? ts.ScriptKind.JSX
          : ts.ScriptKind.JS,
  );
};

const extractPropertyChain = (node, generatedRoots) => {
  const ts = requireTypescript();

  if (ts.isIdentifier(node) && generatedRoots[node.text]) {
    return { root: node.text, segments: [] };
  }

  if (ts.isPropertyAccessExpression(node)) {
    const base = extractPropertyChain(node.expression, generatedRoots);

    if (!base) {
      return null;
    }

    return { root: base.root, segments: [...base.segments, node.name.text] };
  }

  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteral(node.argumentExpression)
  ) {
    const base = extractPropertyChain(node.expression, generatedRoots);

    if (!base) {
      return null;
    }

    return {
      root: base.root,
      segments: [...base.segments, node.argumentExpression.text],
    };
  }

  return null;
};

module.exports = {
  buildSourceFile,
  extractPropertyChain,
  requireTypescript,
};
