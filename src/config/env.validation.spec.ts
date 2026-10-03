import { validationSchema } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

const validate = (overrides: Record<string, unknown>) =>
  validationSchema.validate({ ...base, ...overrides });

describe('validationSchema', () => {
  it('accepts a minimal valid environment', () => {
    const { error } = validate({});
    expect(error).toBeUndefined();
  });

  it('requires DATABASE_URL and 32+ char JWT secrets', () => {
    expect(validate({ DATABASE_URL: undefined }).error).toBeDefined();
    expect(validate({ JWT_ACCESS_SECRET: 'short' }).error).toBeDefined();
    expect(validate({ JWT_REFRESH_SECRET: 'short' }).error).toBeDefined();
  });

  describe('SWAGGER_ENABLED', () => {
    it('defaults to true outside production', () => {
      const { error, value } = validate({ NODE_ENV: 'development' });
      expect(error).toBeUndefined();
      expect(value.SWAGGER_ENABLED).toBe(true);
    });

    it('defaults to false in production', () => {
      const { error, value } = validate({ NODE_ENV: 'production' });
      expect(error).toBeUndefined();
      expect(value.SWAGGER_ENABLED).toBe(false);
    });

    it('can still be opted into explicitly in production', () => {
      const { error, value } = validate({
        NODE_ENV: 'production',
        SWAGGER_ENABLED: 'true',
      });
      expect(error).toBeUndefined();
      expect(value.SWAGGER_ENABLED).toBe(true);
    });
  });

  describe('RETURN_RESET_TOKEN', () => {
    it('defaults to false everywhere', () => {
      expect(validate({}).value.RETURN_RESET_TOKEN).toBe(false);
      expect(
        validate({ NODE_ENV: 'production' }).value.RETURN_RESET_TOKEN,
      ).toBe(false);
    });

    it('is allowed in development', () => {
      const { error } = validate({
        NODE_ENV: 'development',
        RETURN_RESET_TOKEN: 'true',
      });
      expect(error).toBeUndefined();
    });

    it('is rejected in production so reset tokens cannot leak', () => {
      const { error } = validate({
        NODE_ENV: 'production',
        RETURN_RESET_TOKEN: 'true',
      });
      expect(error).toBeDefined();
    });
  });

  describe('METRICS_ENABLED', () => {
    it('defaults to false so /metrics is not exposed by accident', () => {
      expect(validate({ NODE_ENV: 'development' }).value.METRICS_ENABLED).toBe(
        false,
      );
      expect(validate({ NODE_ENV: 'production' }).value.METRICS_ENABLED).toBe(
        false,
      );
    });

    it('defaults to true in test environment', () => {
      const { error, value } = validate({ NODE_ENV: 'test' });
      expect(error).toBeUndefined();
      expect(value.METRICS_ENABLED).toBe(true);
    });

    it('can be enabled explicitly', () => {
      const { error, value } = validate({ METRICS_ENABLED: 'true' });
      expect(error).toBeUndefined();
      expect(value.METRICS_ENABLED).toBe(true);
    });
  });

  describe('TRUST_PROXY', () => {
    it('defaults to 1 (single reverse proxy hop)', () => {
      expect(validate({}).value.TRUST_PROXY).toBe(1);
    });

    it('rejects values outside 0-10', () => {
      expect(validate({ TRUST_PROXY: -1 }).error).toBeDefined();
      expect(validate({ TRUST_PROXY: 11 }).error).toBeDefined();
      expect(validate({ TRUST_PROXY: 'abc' }).error).toBeDefined();
    });
  });
});
