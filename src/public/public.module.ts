import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { ServicesModule } from '../services/services.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [ProvidersModule, ServicesModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
