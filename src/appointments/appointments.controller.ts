import type { Response } from 'express';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AppointmentStatus, Role } from '../generated/prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  RescheduleAppointmentDto,
} from './dto/appointment.dto';
import { SetReminderDto } from './dto/set-reminder.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Create an appointment (customer)' })
  create(@Req() req: { user: AuthUser }, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List appointments scoped to the current user role',
  })
  findAll(
    @Req() req: { user: AuthUser },
    @Query() query: PaginationQueryDto,
    @Query('status') status?: AppointmentStatus,
  ) {
    return this.appointmentsService.findAll(
      this.ctx(req.user),
      query.page,
      query.limit,
      status,
    );
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  @ApiOperation({ summary: 'Get a single appointment (owner/provider/admin)' })
  findOne(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.appointmentsService.findOne(this.ctx(req.user), id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  @ApiOperation({ summary: 'Reschedule an appointment' })
  reschedule(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.appointmentsService.reschedule(this.ctx(req.user), id, dto);
  }

  @Post(':id/confirm')
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER)
  @ApiOperation({ summary: 'Confirm an appointment (provider only)' })
  confirm(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.appointmentsService.confirm(this.ctx(req.user), id);
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER)
  @ApiOperation({ summary: 'Reject an appointment (provider only)' })
  reject(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.appointmentsService.reject(this.ctx(req.user), id);
  }

  @Post(':id/complete')
  @UseGuards(RolesGuard)
  @Roles(Role.PROVIDER)
  @ApiOperation({ summary: 'Mark an appointment as completed (provider only)' })
  complete(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.appointmentsService.complete(this.ctx(req.user), id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an appointment (customer/provider)' })
  cancel(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.appointmentsService.cancel(this.ctx(req.user), id);
  }

  @Patch(':id/reminder')
  @ApiOperation({ summary: 'Set the shared appointment reminder' })
  setSharedReminder(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: SetReminderDto,
  ) {
    return this.appointmentsService.setSharedReminder(
      this.ctx(req.user),
      id,
      dto,
    );
  }

  @Post(':id/reminders')
  @ApiOperation({ summary: 'Create an individual appointment reminder' })
  createReminder(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: SetReminderDto,
  ) {
    return this.appointmentsService.createIndividualReminder(
      this.ctx(req.user),
      req.user.id,
      id,
      dto,
    );
  }

  @Get(':id/reminders')
  @ApiOperation({ summary: 'List individual reminders for an appointment' })
  listReminders(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.appointmentsService.listReminders(this.ctx(req.user), id);
  }

  @Delete(':id/reminders/:reminderId')
  @ApiOperation({ summary: 'Cancel an unsent individual reminder' })
  deleteReminder(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Param('reminderId') reminderId: string,
  ) {
    return this.appointmentsService.deleteReminder(
      this.ctx(req.user),
      id,
      reminderId,
    );
  }

  @Get(':id/print')
  @Header('Content-Type', 'text/plain')
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  @ApiOperation({ summary: 'Get a printable plain-text appointment summary' })
  async print(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const text = await this.appointmentsService.print(this.ctx(req.user), id);
    res.send(text);
  }

  private ctx(user: AuthUser) {
    return {
      userId: user.id,
      role: user.role,
      providerProfileId: user.providerProfileId ?? null,
    };
  }
}
