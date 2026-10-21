import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ENTRY = 'apps/orchestrator/src/workflows/index.js';
const BUNDLE = 'apps/orchestrator/src/workflow-bundle.js';
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

// Keep this contract identical to the build-time CJS helper. Tests compare both
// against the same nested fixtures; no dependency outside this tree is scanned.
export const compiledWorkflowIdentity = (entry: string) => {
  const entryPath = resolve(entry);
  const rootPath = resolve(dirname(entryPath), '../../../..');
  if (entryPath !== join(rootPath, ENTRY) || !lstatSync(rootPath).isDirectory() ||
      lstatSync(rootPath).isSymbolicLink()) throw new Error('invalid compiled root');
  const compiledRoot = realpathSync(rootPath);
  const codePath = join(compiledRoot, BUNDLE);
  const files: Array<[string, string]> = [];
  const visit = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const file = join(directory, name);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('symlink in compiled tree');
      if (stat.isDirectory()) visit(file);
      else if (!stat.isFile()) throw new Error('non-file in compiled tree');
      else if (/\.(?:js|cjs|mjs)$/.test(name) && file !== codePath) {
        files.push([relative(compiledRoot, file).split(sep).join('/'), digest(readFileSync(file))]);
      }
    }
  };
  visit(compiledRoot);
  files.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const entryRecord = files.find(([file]) => file === ENTRY);
  if (!entryRecord) throw new Error('missing compiled entry');
  return { compiledRoot, codePath, entry_sha256: entryRecord[1],
    source_tree_sha256: digest(JSON.stringify(files)), source_tree_file_count: files.length };
};

// Production opt-in is explicit. Development retains the SDK's normal bundler.
// An enabled but corrupt artifact must not silently rebuild on every startup.
export const workflowSource = (entry: string) => {
  if (process.env.POSTIZ_PREBUILT_WORKFLOWS !== 'true') {
    return { workflowsPath: entry };
  }
  try {
    const identity = compiledWorkflowIdentity(entry);
    const { codePath } = identity;
    const manifest = JSON.parse(readFileSync(`${codePath}.json`, 'utf8'));
    const fields = ['schema_version', 'sdk_version', 'entry_sha256', 'bundle_sha256',
      'source_tree_sha256', 'source_tree_file_count'];
    if (!manifest || Array.isArray(manifest) ||
        Object.keys(manifest).sort().join(',') !== fields.sort().join(',') ||
        manifest.schema_version !== 2 ||
        manifest.sdk_version !== require('@temporalio/worker/package.json').version ||
        manifest.entry_sha256 !== identity.entry_sha256 ||
        manifest.source_tree_sha256 !== identity.source_tree_sha256 ||
        manifest.source_tree_file_count !== identity.source_tree_file_count ||
        manifest.bundle_sha256 !== digest(readFileSync(codePath))) {
      throw new Error('identity mismatch');
    }
    return { workflowBundle: { codePath } };
  } catch {
    throw new Error('postiz_workflow_bundle_identity_invalid');
  }
};
