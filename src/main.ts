import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] });
  app.use(helmet());
  app.enableCors({
    origin: (() => {
      const origins = config.get<string[]>('corsOrigins') ?? [];
      return origins.includes('*') ? true : origins;
    })(),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: false,
    }),
  );
  app.enableShutdownHooks();
  (app as unknown as { set: (k: string, v: unknown) => void }).set(
    'trust proxy',
    1,
  );

  if (config.get<boolean>('swaggerEnabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Appointment & Service Booking API')
      .setDescription(
        'Backend API for discovering service providers, viewing services and availability, and booking appointments.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'bearer',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = config.get<number>('port') ?? 3001;
  await app.listen(port);
}

void bootstrap();
