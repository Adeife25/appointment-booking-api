import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should expose api metadata', () => {
      const info = appController.getInfo();
      expect(info.name).toContain('Appointment & Service Booking API');
      expect(info.docs).toBe('/api/docs');
    });
  });
});
