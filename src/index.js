'use strict';

const { DEFAULT_CONFIG, loadConfig, mergeConfig } = require('./config');
const {
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
} = require('./core');
const {
  applyAuditFix,
  auditAssetUsage,
  buildGeneratedRoots,
  collectGeneratedAssetUsages,
  collectRequireAssetPaths,
  compareManifestToFilesystem,
  listProjectSourceFiles,
  parseAuditCliArgs,
  resolveUnusedManifestEntries,
} = require('./audit');
const {
  collectAssetImportBindings,
  diffAssetManifests,
  flattenManifestEntries,
  rewriteTypedAssetSource,
} = require('./codemod');

module.exports = {
  // Config
  DEFAULT_CONFIG,
  loadConfig,
  mergeConfig,

  // Core (generation)
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

  // Audit
  applyAuditFix,
  auditAssetUsage,
  buildGeneratedRoots,
  collectGeneratedAssetUsages,
  collectRequireAssetPaths,
  compareManifestToFilesystem,
  listProjectSourceFiles,
  parseAuditCliArgs,
  resolveUnusedManifestEntries,

  // Codemod
  collectAssetImportBindings,
  diffAssetManifests,
  flattenManifestEntries,
  rewriteTypedAssetSource,
};
