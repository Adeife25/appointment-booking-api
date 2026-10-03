export function isMetricsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.METRICS_ENABLED?.trim().toLowerCase();
  if (raw !== undefined && raw !== '') {
    return raw === 'true' || raw === '1';
  }
  return env.NODE_ENV === 'test';
}
