import { Module } from '@nestjs/common';
import { CacheService } from '../common/services/cache.service';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';

@Module({
  controllers: [AvailabilityController],
  providers: [AvailabilityService, CacheService],
})
export class AvailabilityModule {}
