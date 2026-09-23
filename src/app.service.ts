import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo(): Record<string, string> {
    return {
      name: 'Appointment & Service Booking API',
      version: '1.0.0',
      docs: '/api/docs',
      health: '/health',
      metrics: '/metrics',
    };
  }
}
