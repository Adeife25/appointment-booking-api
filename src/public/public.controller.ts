import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { BROWSE_THROTTLE } from '../common/constants/throttle.constants';
import { PublicService } from './public.service';

@ApiTags('public')
@Public()
@Throttle(BROWSE_THROTTLE)
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('providers/:slug')
  @ApiParam({
    name: 'slug',
    description: 'Provider profile slug or id (shareable link)',
  })
  @ApiOperation({
    summary: 'Get a provider public page by slug or id (shareable link)',
  })
  getProvider(@Param('slug') slugOrId: string) {
    return this.publicService.getProviderByIdentifier(slugOrId);
  }

  @Get('services/:slug')
  @ApiParam({ name: 'slug', description: 'Service slug or id' })
  @ApiOperation({ summary: 'Get a single service public page by slug or id' })
  getService(@Param('slug') slugOrId: string) {
    return this.publicService.getServiceByIdentifier(slugOrId);
  }
}
