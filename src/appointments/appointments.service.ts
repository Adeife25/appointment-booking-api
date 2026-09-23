import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppointmentStatus,
  Prisma,
  PricingType,
  PricingUnit,
} from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAppointmentDto,
  RescheduleAppointmentDto,
} from './dto/appointment.dto';
import { SetReminderDto } from './dto/set-reminder.dto';

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED', 'REJECTED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};

type RoleCtx = {
  userId: string;
  role: 'ADMIN' | 'PROVIDER' | 'CUSTOMER';
  providerProfileId: string | null;
};

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateAppointmentDto) {
    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
      include: { provider: { select: { id: true, isActive: true } } },
    });

    if (!service || !service.isActive) {
      throw new NotFoundException('Service not found');
    }
    if (service.providerProfileId !== dto.providerProfileId) {
      throw new BadRequestException('Service does not belong to this provider');
    }
    if (!service.provider.isActive) {
      throw new BadRequestException(
        'This provider is no longer accepting bookings',
      );
    }

    const startTime = new Date(dto.startTime);
    if (Number.isNaN(startTime.getTime())) {
      throw new BadRequestException('Invalid start time');
    }
    if (startTime.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Appointment start time must be in the future',
      );
    }

    const durationMinutes = this.resolveDuration(service, dto.durationMinutes);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);

    await this.assertWithinAvailability(
      dto.providerProfileId,
      startTime,
      endTime,
      service,
    );

    const priceAtBooking = this.computePriceAtBooking(service, durationMinutes);

    const appointment = await this.createWithDoubleBookingGuard({
      customerId: userId,
      providerProfileId: dto.providerProfileId,
      serviceId: dto.serviceId,
      startTime,
      endTime,
      priceAtBooking,
      notes: dto.notes,
    });

    this.notifications.dispatchAppointmentEvent({
      appointmentId: appointment.id,
      type: 'APPOINTMENT_CREATED',
    });

    return this.findOne(
      { userId, role: 'CUSTOMER', providerProfileId: null },
      appointment.id,
    );
  }

  async findAll(
    ctx: RoleCtx,
    page = 1,
    limit = 20,
    status?: AppointmentStatus,
  ) {
    const where: Prisma.AppointmentWhereInput = {
      ...(status ? { status } : {}),
      ...(ctx.role === 'ADMIN'
        ? {}
        : ctx.role === 'PROVIDER'
          ? { providerProfileId: ctx.providerProfileId ?? '__none__' }
          : { customerId: ctx.userId }),
    };

    const [items, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        orderBy: { startTime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: this.include,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(ctx: RoleCtx, id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: this.include,
    });
    if (!appointment) throw new NotFoundException('Appointment not found');

    this.assertAccess(ctx, appointment);
    return appointment;
  }

  async reschedule(ctx: RoleCtx, id: string, dto: RescheduleAppointmentDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        service: {
          select: {
            durationMinutes: true,
            pricingType: true,
            pricingUnit: true,
            price: true,
          },
        },
      },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    this.assertAccess(ctx, appointment);
    this.assertCanTransition(appointment.status, 'CANCELLED', 'reschedule');

    const startTime = new Date(dto.startTime);
    if (Number.isNaN(startTime.getTime())) {
      throw new BadRequestException('Invalid start time');
    }
    if (startTime.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Appointment start time must be in the future',
      );
    }

    let durationMinutes: number;
    if (appointment.service.durationMinutes) {
      durationMinutes = appointment.service.durationMinutes;
    } else if (dto.durationMinutes) {
      durationMinutes = dto.durationMinutes;
    } else {
      durationMinutes =
        (appointment.endTime.getTime() - appointment.startTime.getTime()) /
        60_000;
    }

    const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);

    await this.assertWithinAvailability(
      appointment.providerProfileId,
      startTime,
      endTime,
      appointment.service,
    );

    const priceAtBooking = this.computePriceAtBooking(
      appointment.service,
      durationMinutes,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "provider_profiles" WHERE id = ${appointment.providerProfileId} FOR UPDATE`;

      const conflicts = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "appointments"
        WHERE "providerProfileId" = ${appointment.providerProfileId}
          AND "status" IN ('PENDING', 'CONFIRMED')
          AND "id" <> ${id}
          AND "startTime" < ${endTime}
          AND "endTime" > ${startTime}
        LIMIT 1
      `;

      if (conflicts.length > 0) {
        throw new ConflictException('This time slot is already booked');
      }

      return tx.appointment.update({
        where: { id },
        data: { startTime, endTime, priceAtBooking },
        include: this.include,
      });
    });

    return updated;
  }

  async confirm(ctx: RoleCtx, id: string) {
    return this.transition(ctx, id, 'CONFIRMED', { notify: true });
  }

  async reject(ctx: RoleCtx, id: string) {
    return this.transition(ctx, id, 'REJECTED');
  }

  async complete(ctx: RoleCtx, id: string) {
    return this.transition(ctx, id, 'COMPLETED', {
      requireProviderRole: true,
    });
  }

  async cancel(ctx: RoleCtx, id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    this.assertAccess(ctx, appointment);
    this.assertCanTransition(appointment.status, 'CANCELLED', 'cancel');

    const isCustomer =
      ctx.role === 'CUSTOMER' && appointment.customerId === ctx.userId;
    if (isCustomer && !this.isInsideCancellationWindow(appointment.startTime)) {
      const hours = Number(this.config.get('cancelWindowHours') ?? 24);
      throw new BadRequestException(
        `Appointments can only be cancelled at least ${hours} hour(s) before the start time`,
      );
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: this.include,
    });

    this.notifications.dispatchAppointmentEvent({
      appointmentId: id,
      type: 'APPOINTMENT_CANCELLED',
    });

    return updated;
  }

  async setSharedReminder(ctx: RoleCtx, id: string, dto: SetReminderDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      select: {
        id: true,
        startTime: true,
        customerId: true,
        providerProfileId: true,
      },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    this.assertAccess(ctx, appointment);

    const reminderAt = new Date(dto.reminderAt);
    if (Number.isNaN(reminderAt.getTime())) {
      throw new BadRequestException('Invalid reminder time');
    }
    this.assertReminderWindow(reminderAt, appointment.startTime);

    return this.prisma.appointment.update({
      where: { id },
      data: { reminderAt },
      select: { id: true, reminderAt: true },
    });
  }

  async createIndividualReminder(
    ctx: RoleCtx,
    userId: string,
    id: string,
    dto: SetReminderDto,
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      select: {
        id: true,
        startTime: true,
        customerId: true,
        providerProfileId: true,
      },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    this.assertAccess(ctx, appointment);

    const reminderAt = new Date(dto.reminderAt);
    if (Number.isNaN(reminderAt.getTime())) {
      throw new BadRequestException('Invalid reminder time');
    }
    this.assertReminderWindow(reminderAt, appointment.startTime);

    return this.prisma.appointmentReminder.create({
      data: { appointmentId: id, userId, reminderAt },
    });
  }

  async listReminders(ctx: RoleCtx, id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      select: { id: true, customerId: true, providerProfileId: true },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    this.assertAccess(ctx, appointment);

    return this.prisma.appointmentReminder.findMany({
      where: { appointmentId: id },
      orderBy: { reminderAt: 'asc' },
    });
  }

  async deleteReminder(ctx: RoleCtx, id: string, reminderId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      select: { id: true, customerId: true, providerProfileId: true },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    this.assertAccess(ctx, appointment);

    const reminder = await this.prisma.appointmentReminder.findFirst({
      where: { id: reminderId, appointmentId: id, sentAt: null },
    });
    if (!reminder) {
      throw new NotFoundException('Reminder not found or already sent');
    }

    await this.prisma.appointmentReminder.delete({
      where: { id: reminder.id },
    });
    return { message: 'Reminder cancelled' };
  }

  async print(ctx: RoleCtx, id: string): Promise<string> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: this.include,
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    this.assertAccess(ctx, appointment);

    const lines = [
      'APPOINTMENT SUMMARY',
      '──────────────────────────',
      `Reference:    ${appointment.id}`,
      `Service:      ${appointment.service.name}`,
      `Provider:     ${appointment.provider.businessName}`,
      `Customer:     ${appointment.customer.name}`,
      `Start:        ${appointment.startTime.toISOString()}`,
      `End:          ${appointment.endTime.toISOString()}`,
      `Duration:     ${appointment.endTime.getTime() - appointment.startTime.getTime() >= 0 ? Math.round((appointment.endTime.getTime() - appointment.startTime.getTime()) / 60_000) : 0} min`,
      `Price:        ${String(appointment.priceAtBooking ?? 'N/A')}`,
      `Status:       ${appointment.status}`,
      ...(appointment.notes ? [`Notes:        ${appointment.notes}`] : []),
      '──────────────────────────',
    ];

    return lines.join('\n');
  }

  private async transition(
    ctx: RoleCtx,
    id: string,
    next: AppointmentStatus,
    options?: { notify?: boolean; requireProviderRole?: boolean },
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    this.assertAccess(ctx, appointment);
    this.assertCanTransition(appointment.status, next, next.toLowerCase());

    if (
      options?.requireProviderRole &&
      ctx.role !== 'PROVIDER' &&
      ctx.role !== 'ADMIN'
    ) {
      throw new ForbiddenException(
        'Only the provider can complete an appointment',
      );
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: next },
      include: this.include,
    });

    if (options?.notify) {
      this.notifications.dispatchAppointmentEvent({
        appointmentId: id,
        type: 'APPOINTMENT_CONFIRMED',
      });
    }

    return updated;
  }

  private async createWithDoubleBookingGuard(data: {
    customerId: string;
    providerProfileId: string;
    serviceId: string;
    startTime: Date;
    endTime: Date;
    priceAtBooking: string | null;
    notes?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "provider_profiles" WHERE id = ${data.providerProfileId} FOR UPDATE`;

      const conflicts = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "appointments"
        WHERE "providerProfileId" = ${data.providerProfileId}
          AND "status" IN ('PENDING', 'CONFIRMED')
          AND "startTime" < ${data.endTime}
          AND "endTime" > ${data.startTime}
        LIMIT 1
      `;

      if (conflicts.length > 0) {
        throw new ConflictException('This time slot is already booked');
      }

      return tx.appointment.create({
        data: {
          customerId: data.customerId,
          providerProfileId: data.providerProfileId,
          serviceId: data.serviceId,
          startTime: data.startTime,
          endTime: data.endTime,
          priceAtBooking: data.priceAtBooking,
          notes: data.notes,
        },
        select: { id: true },
      });
    });
  }

  private async assertWithinAvailability(
    providerProfileId: string,
    startTime: Date,
    endTime: Date,
    service?: {
      startTime?: string | null;
      endTime?: string | null;
      pricingType: PricingType;
      pricingUnit?: PricingUnit | null;
      price: { toString(): string } | null;
      durationMinutes: number | null;
    } | null,
  ) {
    const availabilities = await this.prisma.availability.findMany({
      where: { providerProfileId, isActive: true },
    });
    if (availabilities.length === 0) {
      throw new BadRequestException('Provider has no availability configured');
    }

    const startDay = startTime.getUTCDay();
    const endDay = endTime.getUTCDay();
    const startTimeStr = this.toTimeString(startTime);
    const endTimeStr = this.toTimeString(endTime);

    const fits = availabilities.some(
      (slot) =>
        slot.dayOfWeek === startDay &&
        slot.dayOfWeek === endDay &&
        slot.startTime <= startTimeStr &&
        slot.endTime >= endTimeStr,
    );

    if (!fits) {
      throw new BadRequestException(
        'Appointment is outside the provider availability',
      );
    }

    if (service?.startTime && service.endTime) {
      if (
        startTimeStr < service.startTime ||
        endTimeStr > service.endTime ||
        startDay !== endDay
      ) {
        throw new BadRequestException(
          'Appointment is outside the service working hours',
        );
      }
    }
  }

  private resolveDuration(
    service: { durationMinutes: number | null },
    requested?: number,
  ): number {
    if (service.durationMinutes) {
      return service.durationMinutes;
    }
    if (requested && requested >= 5) {
      return requested;
    }
    throw new BadRequestException(
      'This service has no fixed duration; please provide durationMinutes',
    );
  }

  private computePriceAtBooking(
    service: {
      pricingType: PricingType;
      pricingUnit: PricingUnit | null;
      price: { toString(): string } | null;
    },
    durationMinutes: number,
  ): string | null {
    switch (service.pricingType) {
      case 'FIXED':
        if (service.pricingUnit === 'PER_HOUR') {
          return service.price
            ? (Number(service.price) * (durationMinutes / 60)).toFixed(2)
            : null;
        }
        return service.price ? service.price.toString() : null;
      case 'PER_HOUR':
        return service.price
          ? (Number(service.price) * (durationMinutes / 60)).toFixed(2)
          : null;
      case 'FREE':
        return '0.00';
      default:
        return null;
    }
  }

  private assertReminderWindow(reminderAt: Date, startTime: Date): void {
    if (reminderAt.getTime() <= Date.now()) {
      throw new BadRequestException('Reminder time must be in the future');
    }
    if (reminderAt.getTime() >= startTime.getTime()) {
      throw new BadRequestException(
        'Reminder time must be before the appointment start time',
      );
    }
  }

  private assertCanTransition(
    current: AppointmentStatus,
    next: AppointmentStatus,
    action: string,
  ) {
    if (!TRANSITIONS[current].includes(next)) {
      throw new ConflictException(
        `Cannot ${action} an appointment in ${current} status`,
      );
    }
  }

  private isInsideCancellationWindow(startTime: Date): boolean {
    const hours = Number(this.config.get('cancelWindowHours') ?? 24);
    return startTime.getTime() - Date.now() >= hours * 60 * 60 * 1000;
  }

  private toTimeString(date: Date): string {
    const hh = date.getUTCHours().toString().padStart(2, '0');
    const mm = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private assertAccess(
    ctx: RoleCtx,
    appointment: { customerId: string; providerProfileId: string },
  ) {
    const isCustomer =
      ctx.role === 'CUSTOMER' && appointment.customerId === ctx.userId;
    const isProvider =
      ctx.role === 'PROVIDER' &&
      appointment.providerProfileId === ctx.providerProfileId;
    const isAdmin = ctx.role === 'ADMIN';
    if (!isCustomer && !isProvider && !isAdmin) {
      throw new ForbiddenException(
        'You do not have access to this appointment',
      );
    }
  }

  private include = {
    customer: { select: { id: true, name: true, email: true, phone: true } },
    provider: { select: { id: true, businessName: true, location: true } },
    service: {
      select: {
        id: true,
        name: true,
        price: true,
        pricingType: true,
        pricingUnit: true,
        durationMinutes: true,
      },
    },
    review: true,
  } as const;
}
