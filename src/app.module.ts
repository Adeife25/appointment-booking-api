import { Logger, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CacheModule, CacheModuleOptions } from '@nestjs/cache-manager';
import { createKeyv } from '@keyv/redis';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { SharedThrottlerStorage } from './common/services/throttler-storage.service';
import configuration from './config/configuration';
import { validationSchema } from './config/env.validation';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProvidersModule } from './providers/providers.module';
import { PublicModule } from './public/public.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ServicesModule } from './services/services.module';
import { AvailabilityModule } from './availability/availability.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level:
            config.get<string>('nodeEnv') === 'production' ? 'info' : 'debug',
          transport:
            config.get<string>('nodeEnv') !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, colorize: true },
                }
              : undefined,
          autoLogging: true,
          quietReqLogger: false,
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const throttlers = [
          {
            ttl: config.get<number>('throttle.ttl') ?? 60,
            limit: config.get<number>('throttle.limit') ?? 60,
          },
        ];

        const redisUrl = config.get<string>('redisUrl');
        if (!redisUrl) {
          return { throttlers };
        }

        const logger = new Logger('ThrottlerModule');
        logger.log(`Redis throttler storage configured: ${redisUrl}`);
        return {
          throttlers,
          storage: new SharedThrottlerStorage({ redisUrl }),
        };
      },
    }),
    ScheduleModule.forRoot(),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService): CacheModuleOptions => {
        const logger = new Logger('CacheModule');
        const ttl = 60_000;
        const redisUrl = config.get<string>('redisUrl');
        if (!redisUrl) {
          logger.log('Redis not configured - using in-memory cache store');
          return { ttl, isGlobal: true };
        }
        const store = createKeyv(
          {
            url: redisUrl,
            socket: { connectTimeout: 1000, reconnectStrategy: false },
          },
          { throwOnConnectError: false },
        );
        store.on('error', (err: Error) =>
          logger.warn(
            `Redis cache error: ${err?.message?.trim() || 'unavailable'}`,
          ),
        );
        logger.log(`Redis cache store configured: ${redisUrl}`);
        return { stores: [store], ttl, isGlobal: true };
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProvidersModule,
    PublicModule,
    ServicesModule,
    AvailabilityModule,
    AppointmentsModule,
    ReviewsModule,
    NotificationsModule,
    DashboardModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
