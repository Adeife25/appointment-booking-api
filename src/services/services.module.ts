import { Module } from '@nestjs/common';
import { CacheService } from '../common/services/cache.service';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  controllers: [ServicesController],
  providers: [ServicesService, CacheService],
  exports: [ServicesService],
})
export class ServicesModule {}
