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
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../generated/prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CacheService } from '../common/services/cache.service';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
    private readonly cacheService: CacheService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a service (provider only)' })
  async create(@Req() req: { user: AuthUser }, @Body() dto: CreateServiceDto) {
    const result = await this.servicesService.create(
      req.user.id,
      req.user.providerProfileId ?? null,
      dto,
    );
    await this.cacheService.del(`service/${result.id}`);
    return result;
  }

  @Get()
  @ApiBearerAuth()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300_000)
  @ApiOperation({ summary: 'List active services' })
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('providerId') providerId?: string,
  ) {
    return this.servicesService.findAll(query, providerId);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseInterceptors(CacheInterceptor)
  @CacheKey((ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ params: { id: string } }>();
    return `service/${req.params.id}`;
  })
  @CacheTTL(300_000)
  @ApiParam({ name: 'id', description: 'Service ID' })
  @ApiOperation({ summary: 'Get a single service' })
  findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a service (owner only)' })
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    const result = await this.servicesService.update(req.user.id, id, dto);
    await this.cacheService.del(`service/${id}`);
    return result;
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete a service (owner only)' })
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const result = await this.servicesService.remove(req.user.id, id);
    await this.cacheService.del(`service/${id}`);
    return result;
  }
}
