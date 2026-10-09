'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { localDockerOptions, ownedContainer } = require('./local-drill-docker.cjs');
test('explicit local socket overrides and removes ambient remote targets', () => {
  const result = localDockerOptions({ DAPPGO_UPGRADE_DRILL_SOCKET: '/local/docker.sock',
    DOCKER_HOST: 'tcp://production:2375', DOCKER_CONTEXT: 'production',
    DOCKER_TLS_VERIFY: '1', DOCKER_CERT_PATH: '/credentials', PATH: '/bin' },
  () => ({ isSocket: () => true }));
  assert.deepEqual(result.args, ['--host', 'unix:///local/docker.sock']);
  assert.equal(result.env.PATH, '/bin');
  assert.equal(result.env.DOCKER_HOST, undefined);
  assert.equal(result.env.DOCKER_CONTEXT, undefined);
  assert.equal(result.env.DOCKER_CERT_PATH, undefined);
});
for (const path of ['tcp://production:2375', 'relative.sock', '/a\0b']) {
  test('reject invalid socket ' + JSON.stringify(path), () => {
    assert.throws(() => localDockerOptions({ DAPPGO_UPGRADE_DRILL_SOCKET: path },
      () => ({ isSocket: () => true })));
  });
}
test('reject regular files as docker endpoint', () => {
  assert.throws(() => localDockerOptions({}, () => ({ isSocket: () => false })));
});
test('cleanup requires exact name and per-invocation ownership', () => {
  const current = { Name: '/drill', Config: { Labels: { label: 'owner' } } };
  assert.equal(ownedContainer(current, 'drill', 'label', 'owner'), true);
  assert.equal(ownedContainer(current, 'other', 'label', 'owner'), false);
  assert.equal(ownedContainer(current, 'drill', 'label', 'another'), false);
  assert.equal(ownedContainer({}, 'drill', 'label', 'owner'), false);
});
