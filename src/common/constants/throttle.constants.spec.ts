const ORIGINAL_LIMIT = process.env.THROTTLE_PUBLIC_LIMIT;
const ORIGINAL_TTL = process.env.THROTTLE_PUBLIC_TTL;

function loadWithEnv(params: { limit?: string; ttl?: string }) {
  if (params.limit === undefined) delete process.env.THROTTLE_PUBLIC_LIMIT;
  else process.env.THROTTLE_PUBLIC_LIMIT = params.limit;
  if (params.ttl === undefined) delete process.env.THROTTLE_PUBLIC_TTL;
  else process.env.THROTTLE_PUBLIC_TTL = params.ttl;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./throttle.constants') as typeof import('./throttle.constants');
}

describe('BROWSE_THROTTLE', () => {
  afterEach(() => {
    if (ORIGINAL_LIMIT === undefined) delete process.env.THROTTLE_PUBLIC_LIMIT;
    else process.env.THROTTLE_PUBLIC_LIMIT = ORIGINAL_LIMIT;
    if (ORIGINAL_TTL === undefined) delete process.env.THROTTLE_PUBLIC_TTL;
    else process.env.THROTTLE_PUBLIC_TTL = ORIGINAL_TTL;
  });

  it('defaults to 120 requests per 60 seconds', () => {
    expect(loadWithEnv({}).BROWSE_THROTTLE.default).toEqual({
      limit: 120,
      ttl: 60_000,
    });
  });

  it('reads overrides from the environment', () => {
    expect(
      loadWithEnv({ limit: '50', ttl: '120' }).BROWSE_THROTTLE.default,
    ).toEqual({
      limit: 50,
      ttl: 120_000,
    });
  });
});
