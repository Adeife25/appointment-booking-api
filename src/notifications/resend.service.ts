import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    this.from =
      config.get<string>('RESEND_FROM') ??
      'Appointment Booking <onboarding@resend.dev>';
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  get isConfigured(): boolean {
    return this.resend !== null;
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    if (!this.resend) {
      this.logger.log(`[email skipped] to=${to} subject="${subject}"`);
      return;
    }
    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      text: body,
    });
    if (error) {
      this.logger.error(`Resend email failed: ${error.message}`);
    }
  }
}
