import {
  Controller,
  ExecutionContext,
  Get,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../generated/prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('admin/overview')
  @UseInterceptors(CacheInterceptor)
  @CacheKey('dashboard/admin/overview')
  @CacheTTL(60_000)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Platform overview metrics' })
  adminOverview() {
    return this.dashboardService.adminOverview();
  }

  @Get('admin/appointments')
  @UseInterceptors(CacheInterceptor)
  @CacheKey('dashboard/admin/appointments')
  @CacheTTL(60_000)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Appointment counts by status' })
  adminAppointments() {
    return this.dashboardService.adminAppointments();
  }

  @Get('admin/trends')
  @UseInterceptors(CacheInterceptor)
  @CacheKey((ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ query?: { days?: string } }>();
    return `dashboard/admin/trends/${req.query?.days ?? 30}`;
  })
  @CacheTTL(60_000)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Bookings and revenue per day' })
  adminTrends(@Query('days') days?: string) {
    return this.dashboardService.adminTrends(days ? Number(days) : 30);
  }

  @Get('admin/top-providers')
  @UseInterceptors(CacheInterceptor)
  @CacheKey('dashboard/admin/top-providers')
  @CacheTTL(60_000)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Top providers by completed appointments' })
  adminTopProviders() {
    return this.dashboardService.adminTopProviders();
  }

  @Get('provider/overview')
  @UseInterceptors(CacheInterceptor)
  @CacheKey((ctx: ExecutionContext) => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ user?: { providerProfileId?: string | null } }>();
    return `dashboard/provider/overview/${req.user?.providerProfileId ?? ''}`;
  })
  @CacheTTL(60_000)
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER)
  @ApiOperation({ summary: '[Provider] Provider engagement metrics' })
  providerOverview(@Req() req: { user: AuthUser }) {
    return this.dashboardService.providerOverview(
      req.user.providerProfileId ?? '',
    );
  }

  @Get('provider/schedule')
  @UseInterceptors(CacheInterceptor)
  @CacheKey((ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{
      user?: { providerProfileId?: string | null };
      query?: { date?: string };
    }>();
    return `dashboard/provider/schedule/${
      req.user?.providerProfileId ?? ''
    }/${req.query?.date ?? ''}`;
  })
  @CacheTTL(60_000)
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER)
  @ApiOperation({ summary: "[Provider] Provider's appointments for a day" })
  providerSchedule(
    @Req() req: { user: AuthUser },
    @Query('date') date?: string,
  ) {
    return this.dashboardService.providerSchedule(
      req.user.providerProfileId ?? '',
      date,
    );
  }

  @Get('customer/overview')
  @UseInterceptors(CacheInterceptor)
  @CacheKey((ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: { id?: string } }>();
    return `dashboard/customer/overview/${req.user?.id ?? ''}`;
  })
  @CacheTTL(60_000)
  @UseGuards(RolesGuard)
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: '[Customer] Customer engagement metrics' })
  customerOverview(@Req() req: { user: AuthUser }) {
    return this.dashboardService.customerOverview(req.user.id);
  }
}
