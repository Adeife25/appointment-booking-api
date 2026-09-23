import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { ResendService } from './resend.service';

describe('ResendService', () => {
  function makeConfig(apiKey?: string) {
    return {
      get: jest.fn((key: string) =>
        key === 'RESEND_API_KEY' ? (apiKey ?? '') : undefined,
      ),
    } as unknown as ConfigService;
  }

  it('is not configured when no API key is set', () => {
    const service = new ResendService(makeConfig());
    expect(service.isConfigured).toBe(false);
  });

  it('is configured when an API key is set', () => {
    const service = new ResendService(makeConfig('re_test_key'));
    expect(service.isConfigured).toBe(true);
  });

  it('skips sending when not configured', async () => {
    const service = new ResendService(makeConfig());
    await expect(
      service.sendEmail('a@example.com', 'Subject', 'Body'),
    ).resolves.toBeUndefined();
  });

  it('sends via Resend when configured', async () => {
    const service = new ResendService(makeConfig('re_test_key'));
    const send = jest.fn().mockResolvedValue({ error: null });
    (service as unknown as { resend: Resend | null }).resend = {
      emails: { send },
    } as unknown as Resend;

    await service.sendEmail('a@example.com', 'Subject', 'Body');

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@example.com',
        subject: 'Subject',
        text: 'Body',
      }),
    );
  });

  it('logs when Resend returns an error', async () => {
    const service = new ResendService(makeConfig('re_test_key'));
    const loggerSpy = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);
    const send = jest.fn().mockResolvedValue({ error: { message: 'boom' } });
    (service as unknown as { resend: Resend | null }).resend = {
      emails: { send },
    } as unknown as Resend;

    await service.sendEmail('a@example.com', 'Subject', 'Body');

    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('boom'));
    loggerSpy.mockRestore();
  });
});
