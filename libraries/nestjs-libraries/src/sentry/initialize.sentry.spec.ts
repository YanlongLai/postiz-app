describe('optional native Sentry profiler startup', () => {
  const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const originalEnvironment = process.env.NODE_ENV;
  const init = jest.fn();
  const profiling = jest.fn(() => ({ name: 'Profiling' }));
  let profilerLoads = 0;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    profilerLoads = 0;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    process.env.NODE_ENV = 'production';
    jest.doMock('@sentry/nestjs', () => ({
      init,
      consoleLoggingIntegration: () => ({ name: 'Console' }),
      openAIIntegration: () => ({ name: 'OpenAI' }),
    }));
    jest.doMock('@sentry/profiling-node', () => {
      profilerLoads++;
      return { nodeProfilingIntegration: profiling };
    });
  });

  afterAll(() => {
    if (originalDsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    jest.resetModules();
  });

  it.each([undefined, ''])('never loads the native profiler with DSN %s', (dsn) => {
    if (dsn !== undefined) process.env.NEXT_PUBLIC_SENTRY_DSN = dsn;
    const { initializeSentry } = require('./initialize.sentry');
    expect(profilerLoads).toBe(0);
    expect(initializeSentry('orchestrator', true)).toBeNull();
    expect(profilerLoads).toBe(0);
    expect(profiling).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
  });

  it('preserves integrations and sampling when telemetry is explicitly enabled', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://example@telemetry.invalid/1';
    const { initializeSentry } = require('./initialize.sentry');
    expect(profilerLoads).toBe(0);
    expect(initializeSentry('orchestrator', true)).toBe(true);
    expect(profilerLoads).toBe(1);
    expect(profiling).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(expect.objectContaining({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      initialScope: expect.objectContaining({
        tags: { service: 'orchestrator', component: 'nestjs' },
      }),
      integrations: [{ name: 'Profiling' }, { name: 'Console' }, { name: 'OpenAI' }],
      tracesSampler: expect.any(Function),
      profileSessionSampleRate: 0.2,
      profileLifecycle: 'trace',
    }));
    const sampler = init.mock.calls[0][0].tracesSampler;
    const inheritOrSampleWith = jest.fn((rate) => rate);
    expect(sampler({ normalizedRequest: { method: 'GET', url: '/mcp' }, inheritOrSampleWith })).toBe(0);
    expect(inheritOrSampleWith).not.toHaveBeenCalled();
    expect(sampler({ normalizedRequest: { method: 'GET', url: '/public/v1/analytics/test' }, inheritOrSampleWith })).toBe(0.01);
    expect(sampler({ name: 'ordinary-request', inheritOrSampleWith })).toBe(0.1);
  });

  it('keeps a native-module load exception inside the existing telemetry error boundary', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://example@telemetry.invalid/1';
    jest.doMock('@sentry/profiling-node', () => { throw new Error('synthetic native load failure'); });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { initializeSentry } = require('./initialize.sentry');
      expect(() => initializeSentry('orchestrator', true)).not.toThrow();
      expect(init).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
});
