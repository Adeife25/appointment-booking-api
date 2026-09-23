export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  databaseUrl: process.env.DATABASE_URL,
  databaseMaxConnections: process.env.DATABASE_MAX_CONNECTIONS
    ? parseInt(process.env.DATABASE_MAX_CONNECTIONS, 10)
    : undefined,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  cancelWindowHours: parseInt(process.env.CANCEL_WINDOW_HOURS ?? '24', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '60', 10),
  },
  swaggerEnabled: process.env.SWAGGER_ENABLED === 'true',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001',
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL ??
    'http://localhost:3001/api/v1/auth/google/callback',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  resendFrom:
    process.env.RESEND_FROM ?? 'Appointment Booking <onboarding@resend.dev>',
  returnResetToken: process.env.RETURN_RESET_TOKEN === 'true',
  reminderLeadHours: parseInt(process.env.REMINDER_LEAD_HOURS ?? '24', 10),
  redisUrl: process.env.REDIS_URL,
});
