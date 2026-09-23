import {
  Body,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '../generated/prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Public } from '../common/decorators/public.decorator';
import { BROWSE_THROTTLE } from '../common/constants/throttle.constants';
import { AuthUser } from '../common/types/auth-user';
import { CacheService } from '../common/services/cache.service';
import { AvailabilityService } from './availability.service';
import {
  CreateAvailabilityDto,
  UpdateAvailabilityDto,
} from './dto/availability.dto';
import { SlotsQueryDto } from './dto/slots-query.dto';

@ApiTags('availability')
@Controller('availability')
export class AvailabilityController {
  constructor(
    private readonly availabilityService: AvailabilityService,
    private readonly cacheService: CacheService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add an availability slot (provider only)' })
  async create(
    @Req() req: { user: AuthUser },
    @Body() dto: CreateAvailabilityDto,
  ) {
    const result = await this.availabilityService.create(
      req.user.id,
      req.user.providerProfileId ?? null,
      dto,
    );
    if (req.user.providerProfileId) {
      await this.cacheService.del(`availability/${req.user.providerProfileId}`);
    }
    return result;
  }

  @Get('providers/:providerId/availability')
  @ApiBearerAuth()
  @Throttle(BROWSE_THROTTLE)
  @UseInterceptors(CacheInterceptor)
  @CacheKey((ctx: ExecutionContext) => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ params: { providerId: string } }>();
    return `availability/${req.params.providerId}`;
  })
  @CacheTTL(120_000)
  @ApiParam({ name: 'providerId', description: 'Provider profile ID' })
  @ApiOperation({ summary: 'List a provider availability slots (public)' })
  findAllForProvider(@Param('providerId') providerId: string) {
    return this.availabilityService.findAllForProvider(providerId);
  }

  @Public()
  @Throttle(BROWSE_THROTTLE)
  @UseInterceptors(CacheInterceptor)
  @CacheKey((ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{
      params: { providerId: string };
      query: { from: string; to: string };
    }>();
    return `slots/${req.params.providerId}/${req.query.from}/${req.query.to}`;
  })
  @CacheTTL(30_000)
  @Get('providers/:providerId/slots')
  @ApiParam({ name: 'providerId', description: 'Provider profile ID' })
  @ApiOperation({
    summary:
      'Booked and open slots for a provider within a date range (public)',
  })
  @ApiQuery({
    name: 'from',
    description: 'Start date (YYYY-MM-DD, UTC)',
    example: '2026-09-20',
    required: true,
  })
  @ApiQuery({
    name: 'to',
    description: 'End date (YYYY-MM-DD, UTC), at most 31 days after from',
    example: '2026-09-30',
    required: true,
  })
  findSlotsForRange(
    @Param('providerId') providerId: string,
    @Query() query: SlotsQueryDto,
  ) {
    return this.availabilityService.findSlotsForRange(
      providerId,
      query.from,
      query.to,
    );
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Availability slot ID' })
  @ApiOperation({ summary: 'Update an availability slot (owner only)' })
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    const result = await this.availabilityService.update(req.user.id, id, dto);
    if (req.user.providerProfileId) {
      await this.cacheService.del(`availability/${req.user.providerProfileId}`);
    }
    return result;
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Availability slot ID' })
  @ApiOperation({ summary: 'Remove an availability slot (owner only)' })
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const result = await this.availabilityService.remove(req.user.id, id);
    if (req.user.providerProfileId) {
      await this.cacheService.del(`availability/${req.user.providerProfileId}`);
    }
    return result;
  }
}
