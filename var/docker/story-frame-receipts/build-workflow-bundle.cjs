// Build-time only: never connect to Temporal or start a publisher.
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ENTRY = 'apps/orchestrator/src/workflows/index.js';
const BUNDLE = 'apps/orchestrator/src/workflow-bundle.js';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Same canonical root and sorted digest contract as workflow.bundle.ts.
function compiledWorkflowIdentity(entry) {
  const entryPath = path.resolve(entry);
  const rootPath = path.resolve(path.dirname(entryPath), '../../../..');
  if (entryPath !== path.join(rootPath, ENTRY) || !fs.lstatSync(rootPath).isDirectory() ||
      fs.lstatSync(rootPath).isSymbolicLink()) throw new Error('invalid compiled root');
  const compiledRoot = fs.realpathSync(rootPath);
  const codePath = path.join(compiledRoot, BUNDLE);
  const files = [];
  const visit = (directory) => {
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('symlink in compiled tree');
      if (stat.isDirectory()) visit(file);
      else if (!stat.isFile()) throw new Error('non-file in compiled tree');
      else if (/\.(?:js|cjs|mjs)$/.test(name) && file !== codePath) {
        files.push([path.relative(compiledRoot, file).split(path.sep).join('/'), digest(fs.readFileSync(file))]);
      }
    }
  };
  visit(compiledRoot);
  files.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const entryRecord = files.find(([file]) => file === ENTRY);
  if (!entryRecord) throw new Error('missing compiled entry');
  return { compiledRoot, codePath, entry_sha256: entryRecord[1],
    source_tree_sha256: digest(JSON.stringify(files)), source_tree_file_count: files.length };
}

function buildManifest(identity, code) {
  return { schema_version: 2, entry_sha256: identity.entry_sha256,
    source_tree_sha256: identity.source_tree_sha256,
    source_tree_file_count: identity.source_tree_file_count,
    bundle_sha256: digest(code), sdk_version: require('@temporalio/worker/package.json').version };
}

async function main() {
  const entry = path.resolve(process.argv[2] || 'apps/orchestrator/dist/apps/orchestrator/src/workflows/index.js');
  const identity = compiledWorkflowIdentity(entry);
  const { compiledRoot, codePath: output } = identity;
  const started = performance.now();
  // TypeScript preserves workspace aliases in emitted CommonJS. Resolve them
  // against this same compiled tree, never a sibling checkout/source revision.
  const { bundleWorkflowCode } = require('@temporalio/worker');
  const bundle = await bundleWorkflowCode({ workflowsPath: entry,
    webpackConfigHook(config) {
      config.resolve.alias = { ...config.resolve.alias,
        '@gitroom/orchestrator': path.join(compiledRoot, 'apps/orchestrator/src'),
        '@gitroom/helpers': path.join(compiledRoot, 'libraries/helpers/src'),
        '@gitroom/nestjs-libraries': path.join(compiledRoot, 'libraries/nestjs-libraries/src'),
      };
      return config;
    },
  });
  if (compiledWorkflowIdentity(entry).source_tree_sha256 !== identity.source_tree_sha256) {
    throw new Error('compiled tree changed while bundling');
  }
  fs.writeFileSync(output, bundle.code);
  fs.writeFileSync(`${output}.json`, JSON.stringify(buildManifest(identity, bundle.code)) + '\n');
  console.log(JSON.stringify({ event: 'workflow_bundle_built', elapsed_ms: Math.round(performance.now() - started), bytes: Buffer.byteLength(bundle.code) }));
}
module.exports = { compiledWorkflowIdentity, buildManifest };
if (require.main === module) {
  main().catch(() => { console.error('workflow_bundle_build_failed'); process.exitCode = 1; });
}
