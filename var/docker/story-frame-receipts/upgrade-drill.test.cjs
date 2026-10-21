'use strict';
// Execute the real CLI and local-target helper in a VM with closed mocks.
// No real child process, socket stat, database, Docker call or sleep is allowed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join, basename } = require('node:path');
const { createHash } = require('node:crypto');
const { runInNewContext } = require('node:vm');
const { CATALOG_SQL } = require('./apply-upgrade.cjs');

const scriptPath = join(__dirname, 'upgrade-drill.cjs');
const script = readFileSync(scriptPath, 'utf8');
const helper = readFileSync(join(__dirname, 'local-drill-docker.cjs'), 'utf8');
const IMAGE = 'postgres@sha256:' + 'a'.repeat(64);
const SOCKET = '/mock/local/docker.sock';
const LABEL = 'org.dappgo.upgrade-drill';

function simulate(options = {}) {
  const calls = [];
  const sleeps = [];
  const stats = [];
  const cleanupOutput = [];
  const state = { calls, sleeps, stats, cleanupOutput, stdout: '', stderr: '', thrown: undefined };
  const environment = {
    PATH: '/mock/bin', DAPPGO_UPGRADE_DRILL_SOCKET: SOCKET,
    DAPPGO_UPGRADE_DRILL_IMAGE: IMAGE, DOCKER_HOST: 'tcp://production:2375',
    DOCKER_CONTEXT: 'production', DOCKER_TLS: '1', DOCKER_TLS_VERIFY: '1',
    DOCKER_CERT_PATH: '/production/certs', ...options.env,
  };
  const process = { env: environment, exitCode: undefined,
    stdout: { write: (text) => { state.stdout += text; } },
    stderr: { write: (text) => { state.stderr += text; } } };
  state.process = process;
  const fs = {
    statSync(file) {
      stats.push(file);
      return { isSocket: () => options.socket !== false };
    },
    readFileSync(file) {
      assert.equal(join(file, '..'), __dirname);
      switch (basename(file)) {
        case 'baseline-v225.sql': return 'CREATE TABLE synthetic_baseline (id integer);';
        case 'upgrade-v225.sql': return 'ALTER TABLE synthetic_baseline ADD COLUMN ready boolean;';
        default: throw new Error('unmocked file read');
      }
    },
  };
  let uuid = 0;
  let pidReads = 0;
  let tcpReads = 0;
  let catalogReads = 0;
  const execFileSync = (binary, argv, settings) => {
    assert.equal(binary, 'docker');
    assert.equal(argv[0], '--host');
    assert.equal(argv[1], 'unix://' + environment.DAPPGO_UPGRADE_DRILL_SOCKET);
    assert.equal(settings.timeout, 90000);
    for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) {
      assert.equal(settings.env[key], undefined);
    }
    // VM arrays have another prototype; normalize at the mocked process boundary.
    const args = Array.from(argv).slice(2);
    calls.push({ args, settings });
    if (args[0] === 'image' && args[1] === 'inspect') {
      return JSON.stringify([{ RepoDigests: options.digestMismatch ? [] : [IMAGE], Architecture: 'arm64' }]);
    }
    if (args[0] === 'create') {
      state.name = args[args.indexOf('--name') + 1];
      const label = args[args.indexOf('--label') + 1];
      assert.equal(label.split('=')[0], LABEL);
      state.owner = label.split('=')[1];
      if (options.createTimeout) {
        const error = new Error('private ambiguous create diagnostic');
        error.code = 'ETIMEDOUT';
        throw error;
      }
      return 'mock-container-id';
    }
    if (args[0] === 'start') return '';
    if (args[0] === 'container' && args[1] === 'inspect') {
      cleanupOutput.push(state.stdout);
      assert.equal(args[2], state.name);
      if (options.inspectFailure) throw new Error('private inspect diagnostic');
      if (options.inspectEmpty) return '[]';
      if (options.inspectMalformed) return options.inspectMalformed;
      return JSON.stringify([{ Name: options.wrongName ? '/other-container' : '/' + state.name,
        Config: { Labels: options.missingOwner ? {} : { [LABEL]: options.wrongOwner ? 'other-owner' : state.owner } } }]);
    }
    if (args[0] === 'rm') {
      cleanupOutput.push(state.stdout);
      assert.deepEqual(args, ['rm', '-f', state.name]);
      if (options.removeFailure) throw new Error('private Docker removal diagnostic');
      return '';
    }
    if (args[0] === 'exec' && args[2] === 'cat') {
      assert.equal(args[3], '/proc/1/comm');
      state.pidReads = ++pidReads;
      return (options.pid1 || ['postgres'])[Math.min(pidReads - 1, (options.pid1 || ['postgres']).length - 1)] + '\n';
    }
    if (args[0] === 'exec' && args[2] === 'pg_isready') {
      assert.deepEqual(args.slice(2), ['pg_isready', '-h', '127.0.0.1', '-U', 'drill', '-d', 'postgres']);
      tcpReads++;
      if (options.tcpAlwaysFails || tcpReads <= (options.tcpFailures || 0)) {
        throw new Error('private temporary initialization server diagnostic');
      }
      return '';
    }
    if (args[0] === 'exec' && args.includes('psql')) {
      assert.equal(args[1], '-i');
      assert.equal(args[2], state.name);
      assert.ok(args.includes('--single-transaction'));
      const text = settings.input;
      assert.equal(typeof text, 'string');
      if (text.includes('negativeControl')) throw new Error('private SQL error with row data');
      if (text === CATALOG_SQL + ';') return JSON.stringify({ catalog: ++catalogReads === 1 ? 'before' : 'after' });
      if (text.includes("WHERE status='ready'")) return '1|1|1\n';
      return '';
    }
    throw new Error('unmocked Docker operation: ' + args[0]);
  };
  const modules = {
    'node:fs': fs, 'node:path': require('node:path'),
    'node:crypto': { createHash, randomUUID: () => 'mock-uuid-' + ++uuid },
    'node:child_process': { execFileSync }, './apply-upgrade.cjs': { CATALOG_SQL },
  };
  const load = (name) => {
    assert.ok(Object.hasOwn(modules, name), 'unmocked require: ' + name);
    return modules[name];
  };
  const module = { exports: {} };
  runInNewContext(helper, { require: load, module, process }, { filename: 'local-drill-docker.cjs', timeout: 1000 });
  modules['./local-drill-docker.cjs'] = module.exports;
  try {
    runInNewContext(script, { require: load, process, __dirname,
      Atomics: { wait: (...args) => { sleeps.push(args[3]); } } },
    { filename: scriptPath, timeout: 1000 });
  } catch (error) {
    state.thrown = error;
  }
  return state;
}

const commands = (state, command) => state.calls.filter(({ args }) => args[0] === command);
const sqlCalls = (state) => state.calls.filter(({ args }) => args.includes('psql'));

function assertFailureDiagnostic(result, phase, cleanupFailed = false) {
  const lines = result.stderr.trimEnd().split('\n');
  assert.equal(lines.length, cleanupFailed ? 3 : 2);
  assert.equal(lines[0], 'postiz_isolated_upgrade_drill_failed');
  assert.deepEqual(JSON.parse(lines[1]), { event: 'drill_failure', phase });
  if (cleanupFailed) assert.equal(lines[2], 'upgrade_drill_cleanup_unverified');
  // Exact JSON shape/static phase forbids additional error, SQL, row or env fields.
  for (const value of ['private', 'production', SOCKET, IMAGE, 'mock-uuid-', 'SELECT ', 'INSERT ']) {
    assert.ok(!result.stderr.includes(value), 'raw diagnostic escaped: ' + value);
  }
}

test('script targets only the validated Unix socket with sanitized Docker routing env', () => {
  const result = simulate();
  assert.equal(result.thrown, undefined);
  assert.equal(result.process.exitCode, undefined);
  assert.equal(JSON.parse(result.stdout).status, 'passed');
  assert.deepEqual(result.stats, [SOCKET]);
  assert.equal(commands(result, 'rm').length, 1);
  assert.deepEqual(result.cleanupOutput, ['', ''], 'success must remain unpublished throughout cleanup');
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes('private'));
});

for (const socket of ['tcp://production:2375', 'relative.sock', '/bad\0socket']) {
  test('invalid socket never reaches Docker: ' + JSON.stringify(socket), () => {
    const result = simulate({ env: { DAPPGO_UPGRADE_DRILL_SOCKET: socket } });
    assert.match(result.thrown.message, /local_docker_socket_required/);
    assert.equal(result.calls.length, 0);
  });
}

test('a non-socket endpoint never reaches Docker', () => {
  const result = simulate({ socket: false });
  assert.match(result.thrown.message, /local_docker_socket_required/);
  assert.equal(result.calls.length, 0);
});

test('ambiguous create timeout still inspects and removes only the exact labeled target', () => {
  const result = simulate({ createTimeout: true });
  assert.equal(result.thrown, undefined);
  assert.equal(result.process.exitCode, 1);
  assert.deepEqual(result.calls.map(({ args }) => args[0]), ['image', 'create', 'container', 'rm']);
  assert.equal(commands(result, 'start').length, 0);
  assert.equal(sqlCalls(result).length, 0);
  assert.equal(result.stdout, '');
  assertFailureDiagnostic(result, 'isolated-container-create');
});

for (const identity of ['wrongOwner', 'wrongName']) {
  test('ambiguous create cleanup refuses ' + identity, () => {
    const result = simulate({ createTimeout: true, [identity]: true });
    assert.equal(result.thrown, undefined);
    assert.equal(commands(result, 'rm').length, 0);
    assert.equal(result.process.exitCode, 1);
    assert.equal(sqlCalls(result).length, 0);
    assert.equal(result.stdout, '');
    assertFailureDiagnostic(result, 'isolated-container-create', true);
  });
}

test('unverifiable cleanup does not remove a target or leak raw inspect errors', () => {
  const result = simulate({ createTimeout: true, inspectFailure: true });
  assert.equal(result.thrown, undefined);
  assert.equal(commands(result, 'rm').length, 0);
  assert.equal(result.process.exitCode, 1);
  assertFailureDiagnostic(result, 'isolated-container-create', true);
  assert.ok(!result.stderr.includes('private'));
});

test('digest mismatch before create has no cleanup mutation', () => {
  const result = simulate({ digestMismatch: true });
  assert.equal(result.process.exitCode, 1);
  assert.deepEqual(result.calls.map(({ args }) => args[0]), ['image']);
});

test('temporary init entrypoint never reaches TCP readiness or SQL', () => {
  const result = simulate({ pid1: ['docker-entrypoint.sh'] });
  assert.equal(result.thrown, undefined);
  assert.equal(result.process.exitCode, 1);
  assert.equal(result.pidReads, 60);
  assert.equal(result.sleeps.length, 60);
  assert.ok(result.sleeps.every((delay) => delay === 250));
  assert.equal(result.calls.filter(({ args }) => args.includes('pg_isready')).length, 0);
  assert.equal(sqlCalls(result).length, 0);
  assert.equal(commands(result, 'rm').length, 1);
  assert.equal(result.stdout, '');
});

test('postgres PID alone cannot accept an init server without TCP readiness', () => {
  const result = simulate({ tcpAlwaysFails: true });
  assert.equal(result.process.exitCode, 1);
  assert.equal(result.calls.filter(({ args }) => args.includes('pg_isready')).length, 60);
  assert.equal(sqlCalls(result).length, 0);
  assert.equal(commands(result, 'rm').length, 1);
  assert.equal(result.stdout, '');
  assert.ok(!result.stderr.includes('private'));
});

test('SQL begins only after both final postgres PID and TCP readiness succeed', () => {
  const result = simulate({ pid1: ['bash', 'postgres'], tcpFailures: 1 });
  assert.equal(result.thrown, undefined);
  assert.equal(JSON.parse(result.stdout).status, 'passed');
  assert.equal(result.pidReads, 3);
  assert.equal(result.sleeps.length, 2);
  const firstSql = result.calls.findIndex(({ args }) => args.includes('psql'));
  assert.ok(firstSql > 0);
  assert.equal(result.calls[firstSql - 1].args[2], 'pg_isready');
  assert.equal(commands(result, 'rm').length, 1);
});

test('cleanup removal errors are sanitized and success waits for cleanup', () => {
  const result = simulate({ removeFailure: true });
  assert.equal(result.thrown, undefined, 'raw child-process removal exception escaped');
  assert.equal(result.process.exitCode, 1);
  assert.equal(result.stdout, '', 'passed evidence must wait for owned cleanup');
  assert.deepEqual(result.cleanupOutput, ['', '']);
  assert.equal(result.stderr, 'upgrade_drill_cleanup_unverified\n');
  assert.ok(!result.stderr.includes('private'));
});

test('empty cleanup inspection fails closed and cannot emit passed evidence', () => {
  const result = simulate({ inspectEmpty: true });
  assert.equal(result.thrown, undefined);
  assert.equal(result.process.exitCode, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'upgrade_drill_cleanup_unverified\n');
  assert.equal(commands(result, 'rm').length, 0);
});

for (const failure of ['inspectFailure', 'wrongOwner', 'wrongName', 'missingOwner']) {
  test('successful SQL cannot publish success after cleanup ' + failure, () => {
    const result = simulate({ [failure]: true });
    assert.equal(result.thrown, undefined);
    assert.equal(result.process.exitCode, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'upgrade_drill_cleanup_unverified\n');
    assert.deepEqual(result.cleanupOutput, ['']);
    assert.equal(commands(result, 'rm').length, 0);
  });
}

for (const metadata of ['not-json', 'null', '[null]', '{}']) {
  test('malformed cleanup inspection fails closed: ' + metadata, () => {
    const result = simulate({ inspectMalformed: metadata });
    assert.equal(result.thrown, undefined);
    assert.equal(result.process.exitCode, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'upgrade_drill_cleanup_unverified\n');
    assert.equal(commands(result, 'rm').length, 0);
  });
}
