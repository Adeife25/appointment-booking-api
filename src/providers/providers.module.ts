import { Module } from '@nestjs/common';
import { CacheService } from '../common/services/cache.service';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

@Module({
  controllers: [ProvidersController],
  providers: [ProvidersService, CacheService],
  exports: [ProvidersService],
})
export class ProvidersModule {}
