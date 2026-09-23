import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3001),
  DATABASE_URL: Joi.string().required(),
  DATABASE_MAX_CONNECTIONS: Joi.number().integer().min(1).max(100).optional(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  CANCEL_WINDOW_HOURS: Joi.number().default(24),
  CORS_ORIGINS: Joi.string().default('http://localhost:3001'),
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(60),
  THROTTLE_AUTH_TTL: Joi.number().default(60),
  THROTTLE_AUTH_LIMIT: Joi.number().default(5),
  THROTTLE_PUBLIC_TTL: Joi.number().default(60),
  THROTTLE_PUBLIC_LIMIT: Joi.number().default(120),
  REMINDER_LEAD_HOURS: Joi.number().integer().min(1).default(24),
  REDIS_URL: Joi.string().optional(),
  SEED_ADMIN_EMAIL: Joi.string().email().optional(),
  SEED_ADMIN_PASSWORD: Joi.string().min(8).optional(),
  SEED_ADMIN_NAME: Joi.string().optional(),
  SWAGGER_ENABLED: Joi.boolean().default(true),
  GOOGLE_CLIENT_ID: Joi.string().optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().optional(),
  GOOGLE_CALLBACK_URL: Joi.string().uri().optional(),
  RESEND_API_KEY: Joi.string().allow('').optional(),
  RESEND_FROM: Joi.string().allow('').optional(),
  RETURN_RESET_TOKEN: Joi.boolean().default(false),
});
