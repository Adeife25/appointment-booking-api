import {
  Body,
  Controller,
  ExecutionContext,
  Get,
  Param,
  Patch,
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
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../generated/prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CacheService } from '../common/services/cache.service';
import { ProvidersService } from './providers.service';
import { UpdateProviderProfileDto } from './dto/update-provider-profile.dto';

@ApiTags('providers')
@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly providersService: ProvidersService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300_000)
  @ApiOperation({ summary: 'List all providers' })
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('search') search?: string,
  ) {
    return this.providersService.findAll(query, search);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseInterceptors(CacheInterceptor)
  @CacheKey((ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ params: { id: string } }>();
    return `provider/${req.params.id}`;
  })
  @CacheTTL(300_000)
  @ApiParam({ name: 'id', description: 'Provider profile ID' })
  @ApiOperation({ summary: 'Get provider details, services, and availability' })
  findOne(@Param('id') id: string) {
    return this.providersService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Provider profile ID' })
  @ApiOperation({ summary: 'Update provider profile (owner only)' })
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: UpdateProviderProfileDto,
  ) {
    const result = await this.providersService.update(req.user.id, id, dto);
    await this.cacheService.del(`provider/${id}`);
    return result;
  }

  @Patch(':id/verify')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Provider profile ID' })
  @ApiOperation({ summary: '[Admin] Mark provider as verified' })
  async verify(@Param('id') id: string) {
    const result = await this.providersService.setVerification(id, true);
    await this.cacheService.del(`provider/${id}`);
    return result;
  }

  @Patch(':id/unverify')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Provider profile ID' })
  @ApiOperation({ summary: '[Admin] Remove provider verification' })
  async unverify(@Param('id') id: string) {
    const result = await this.providersService.setVerification(id, false);
    await this.cacheService.del(`provider/${id}`);
    return result;
  }
}
