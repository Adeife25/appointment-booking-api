import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1 returns service info JSON', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1').expect(200);
    expect(res.body.data).toHaveProperty('name');
    expect(res.body.data).toHaveProperty('version');
    expect(res.body.data).toHaveProperty('health');
    expect(res.body.data).toHaveProperty('metrics');
  });

  it('GET /health runs the DB check (ok when DB reachable)', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.data.status).toBe('ok');
    }
  });

  it('GET /metrics exposes Prometheus text metrics', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('text/plain');
  });

  it('rejects anonymous access to protected routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/appointments').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/provider/overview')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/providers/some-provider-id')
      .expect(401);
    await request(app.getHttpServer()).post('/api/v1/appointments').expect(401);
  });

  it('surfaces the real JWT rejection reason for a token signed with a different secret', async () => {
    const jwtService = new JwtService();
    const token = await jwtService.signAsync(
      { sub: 'some-user' },
      { secret: 'some-other-secret', expiresIn: '5m' },
    );
    const res = await request(app.getHttpServer())
      .get('/api/v1/providers/some-provider-id')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(res.body.message).toBe('invalid signature');
  });
});
