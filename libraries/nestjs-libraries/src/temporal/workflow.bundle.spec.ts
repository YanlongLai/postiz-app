import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compiledWorkflowIdentity, workflowSource } from './workflow.bundle';

const builder = require('../../../../var/docker/story-frame-receipts/build-workflow-bundle.cjs');

describe('prebuilt workflow identity', () => {
  let root: string;
  const original = process.env.POSTIZ_PREBUILT_WORKFLOWS;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'postiz-bundle-')); });
  afterEach(() => {
    rmSync(root, { recursive: true });
    if (original === undefined) delete process.env.POSTIZ_PREBUILT_WORKFLOWS;
    else process.env.POSTIZ_PREBUILT_WORKFLOWS = original;
  });
  const fixture = () => {
    const compiledRoot = join(root, 'apps/orchestrator/dist');
    const workflows = join(compiledRoot, 'apps/orchestrator/src/workflows');
    const helpers = join(compiledRoot, 'libraries/helpers/src');
    mkdirSync(workflows, { recursive: true });
    mkdirSync(helpers, { recursive: true });
    const entry = join(workflows, 'index.js');
    const sibling = join(workflows, 'post.workflow.js');
    const helper = join(helpers, 'shared.js');
    writeFileSync(entry, 'exports.entry = 1;');
    writeFileSync(sibling, 'exports.workflow = 1;');
    writeFileSync(helper, 'exports.helper = 1;');
    const identity = builder.compiledWorkflowIdentity(entry);
    const { codePath } = identity;
    writeFileSync(codePath, 'bundle');
    const manifestPath = `${codePath}.json`;
    const manifest = builder.buildManifest(identity, 'bundle');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    return { entry, sibling, helper, compiledRoot, codePath, manifestPath, manifest };
  };
  it('keeps development source bundling without reading an artifact', () => {
    delete process.env.POSTIZ_PREBUILT_WORKFLOWS;
    expect(workflowSource('not-installed')).toEqual({ workflowsPath: 'not-installed' });
  });
  it('selects a valid bundle instead of workflowsPath', () => {
    process.env.POSTIZ_PREBUILT_WORKFLOWS = 'true';
    const { entry, codePath } = fixture();
    expect(workflowSource(entry)).toEqual({ workflowBundle: { codePath } });
  });
  it.each(['entry', 'sibling', 'helper', 'codePath', 'manifestPath'] as const)(
    'rejects corrupted %s without fallback', (part) => {
    process.env.POSTIZ_PREBUILT_WORKFLOWS = 'true';
    const files = fixture();
    writeFileSync(files[part], 'corrupt');
    expect(() => workflowSource(files.entry)).toThrow('postiz_workflow_bundle_identity_invalid');
  });
  it('rejects a missing configured bundle', () => {
    process.env.POSTIZ_PREBUILT_WORKFLOWS = 'true';
    const { entry, codePath } = fixture();
    rmSync(codePath);
    expect(() => workflowSource(entry)).toThrow('postiz_workflow_bundle_identity_invalid');
  });

  it.each(['schema_version', 'sdk_version', 'entry_sha256', 'bundle_sha256',
    'source_tree_sha256', 'source_tree_file_count'])('rejects missing metadata %s', (field) => {
    process.env.POSTIZ_PREBUILT_WORKFLOWS = 'true';
    const { entry, manifestPath, manifest } = fixture();
    delete manifest[field];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => workflowSource(entry)).toThrow('postiz_workflow_bundle_identity_invalid');
  });

  it.each([
    ['schema_version', 1], ['sdk_version', 'unexpected-sdk'],
    ['source_tree_sha256', 'a'.repeat(64)], ['source_tree_file_count', 99],
    ['source_tree_file_count', '3'], ['unexpected', true], ['source_root', '../sibling'],
  ])('rejects mismatched or unexpected metadata %s=%s', (field, value) => {
    process.env.POSTIZ_PREBUILT_WORKFLOWS = 'true';
    const { entry, manifestPath, manifest } = fixture();
    manifest[field as string] = value;
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => workflowSource(entry)).toThrow('postiz_workflow_bundle_identity_invalid');
  });

  it.each(['null', '[]', '"metadata"'])('rejects non-object metadata %s', (value) => {
    process.env.POSTIZ_PREBUILT_WORKFLOWS = 'true';
    const { entry, manifestPath } = fixture();
    writeFileSync(manifestPath, value);
    expect(() => workflowSource(entry)).toThrow('postiz_workflow_bundle_identity_invalid');
  });

  it.each(['entry', 'sibling', 'helper', 'manifestPath'] as const)('rejects a missing %s', (part) => {
    process.env.POSTIZ_PREBUILT_WORKFLOWS = 'true';
    const files = fixture();
    rmSync(files[part]);
    expect(() => workflowSource(files.entry)).toThrow('postiz_workflow_bundle_identity_invalid');
  });

  it('uses identical full-tree identity in builder and runtime', () => {
    const { entry, compiledRoot } = fixture();
    expect(compiledWorkflowIdentity(entry)).toEqual(builder.compiledWorkflowIdentity(entry));
    expect(compiledWorkflowIdentity(entry).compiledRoot).toBe(realpathSync(compiledRoot));
    expect(compiledWorkflowIdentity(entry).source_tree_file_count).toBe(3);
  });

  it('sorts paths independently of creation order and machine root', () => {
    const first = fixture();
    const firstIdentity = compiledWorkflowIdentity(first.entry);
    const secondRoot = join(root, 'second');
    const secondTree = join(secondRoot, 'apps/orchestrator/dist');
    for (const file of [first.helper, first.sibling, first.entry]) {
      const destination = file.replace(first.compiledRoot, secondTree);
      mkdirSync(join(destination, '..'), { recursive: true });
      writeFileSync(destination, readFileSync(file));
    }
    const second = compiledWorkflowIdentity(first.entry.replace(first.compiledRoot, secondTree));
    expect(second.source_tree_sha256).toBe(firstIdentity.source_tree_sha256);
    expect(second.source_tree_file_count).toBe(firstIdentity.source_tree_file_count);
  });

  it('excludes exactly the bundle artifact and ignores non-JS files', () => {
    const { entry, codePath, compiledRoot } = fixture();
    const before = compiledWorkflowIdentity(entry);
    writeFileSync(codePath, 'new bundle');
    writeFileSync(`${codePath}.json`, 'changed metadata');
    writeFileSync(join(compiledRoot, 'debug.js.map'), 'map');
    expect(compiledWorkflowIdentity(entry)).toEqual(before);
    writeFileSync(join(compiledRoot, 'workflow-bundle.js'), 'other JS named like bundle');
    expect(compiledWorkflowIdentity(entry).source_tree_sha256).not.toBe(before.source_tree_sha256);
  });

  it.each(['js', 'cjs', 'mjs'])('rejects added compiled dependency .%s', (extension) => {
    process.env.POSTIZ_PREBUILT_WORKFLOWS = 'true';
    const { entry, compiledRoot } = fixture();
    writeFileSync(join(compiledRoot, `added.${extension}`), 'exports.added = 1;');
    expect(() => workflowSource(entry)).toThrow('postiz_workflow_bundle_identity_invalid');
  });

  it('detects a rename even when the file contents are unchanged', () => {
    process.env.POSTIZ_PREBUILT_WORKFLOWS = 'true';
    const { entry, helper } = fixture();
    renameSync(helper, `${helper}.js`);
    expect(() => workflowSource(entry)).toThrow('postiz_workflow_bundle_identity_invalid');
  });

  it('does not hash a sibling compiled checkout', () => {
    process.env.POSTIZ_PREBUILT_WORKFLOWS = 'true';
    const { entry, codePath } = fixture();
    mkdirSync(join(root, 'sibling'), { recursive: true });
    writeFileSync(join(root, 'sibling/helper.js'), 'corrupt unrelated checkout');
    expect(workflowSource(entry)).toEqual({ workflowBundle: { codePath } });
    expect(() => compiledWorkflowIdentity(join(root, 'workflows/index.js'))).toThrow();
    expect(() => builder.compiledWorkflowIdentity(join(root, 'workflows/index.js'))).toThrow();
  });

  it.each(['entry', 'helper', 'codePath', 'manifestPath', 'directory', 'root', 'non-JS'] as const) (
    'rejects symlinked %s in both identity implementations', (part) => {
      process.env.POSTIZ_PREBUILT_WORKFLOWS = 'true';
      const files = fixture();
      const target = join(root, 'external');
      if (part === 'root' || part === 'directory') {
        const original = part === 'root' ? files.compiledRoot : join(files.compiledRoot, 'libraries');
        renameSync(original, target);
        symlinkSync(target, original);
      } else {
        writeFileSync(target, 'external bytes');
        const file = part === 'non-JS' ? join(files.compiledRoot, 'ignored.map') : files[part];
        rmSync(file, { force: true });
        symlinkSync(target, file);
      }
      expect(() => workflowSource(files.entry)).toThrow('postiz_workflow_bundle_identity_invalid');
      expect(() => builder.compiledWorkflowIdentity(files.entry)).toThrow();
    });
});
