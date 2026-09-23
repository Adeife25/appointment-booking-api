import { Module } from '@nestjs/common';
import { CacheService } from '../common/services/cache.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, CacheService],
  exports: [UsersService],
})
export class UsersModule {}
