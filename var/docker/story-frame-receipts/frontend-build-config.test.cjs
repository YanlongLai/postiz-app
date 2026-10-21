'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = readFileSync(path.join(__dirname, '../../../apps/frontend/next.config.js'), 'utf8')
  .replace("import { withSentryConfig } from '@sentry/nextjs';", '')
  .replace('export default', 'result =');
function load(env) {
  const context = { process: { env }, withSentryConfig: (config, options) => ({ config, options }), result: null };
  vm.runInNewContext(source, context);
  return context.result;
}
test('disabled telemetry builds no upload hook or browser sourcemaps', () => {
  const result = load({});
  assert.equal(result.experimental.cpus, 2);
  assert.equal(result.experimental.webpackBuildWorker, true);
  assert.equal(result.experimental.webpackMemoryOptimizations, true);
  assert.deepEqual(Array.from(result.serverExternalPackages), ['isomorphic-dompurify', 'jsdom']);
  assert.equal(result.productionBrowserSourceMaps, false);
  assert.equal(result.options, undefined);
  const webpack = { devtool: false };
  result.webpack(webpack, { dev: false, isServer: true });
  assert.equal(webpack.devtool, false);
});
test('canonical release explicitly uses the bounded webpack compiler', () => {
  const dockerfile = readFileSync(path.join(__dirname, '../../../Dockerfile.service-release'), 'utf8');
  assert.match(dockerfile, /pnpm --filter \.\/apps\/frontend run build --webpack/);
  assert.match(dockerfile, /NODE_OPTIONS=--max-old-space-size=3072/);
});
test('runtime DSN retains instrumentation but cannot upload without token', () => {
  const result = load({ NEXT_PUBLIC_SENTRY_DSN: 'synthetic' });
  assert.equal(result.options.sourcemaps.disable, true);
  assert.equal(result.options.release.create, false);
});
test('external Node sanitizer retains readable text without executable markup', () => {
  const sanitizer = require('isomorphic-dompurify');
  const value = '<p>Market news</p><script>alert(1)</script>' +
    '<img src=x onerror=alert(1)><a href="javascript:alert(1)">click</a>';
  const clean = sanitizer.sanitize(value, {
    ALLOWED_TAGS: ['p', 'a'], ALLOWED_ATTR: ['href'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
  });
  assert.match(clean, /Market news/);
  assert.doesNotMatch(clean, /script|onerror|javascript:/i);
});
test('explicit upload token retains sourcemaps and release integration', () => {
  const result = load({ SENTRY_AUTH_TOKEN: 'synthetic' });
  assert.equal(result.config.productionBrowserSourceMaps, true);
  assert.equal(result.options.sourcemaps.disable, false);
  assert.equal(result.options.release.create, true);
  const webpack = { devtool: false };
  result.config.webpack(webpack, { dev: false, isServer: true });
  assert.equal(webpack.devtool, 'source-map');
});
