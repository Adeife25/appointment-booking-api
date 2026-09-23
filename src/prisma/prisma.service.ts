import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.get<string>('databaseUrl'),
      ...(config.get<number>('databaseMaxConnections')
        ? { max: config.get<number>('databaseMaxConnections') }
        : {}),
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
    this.logger.log('Prisma connection warmed up');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma client disconnected');
  }
}
