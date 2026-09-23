import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController, MetricsController } from './health.controller';

@Module({
  imports: [
    TerminusModule.forRoot({ errorLogStyle: 'pretty' }),
    PrometheusModule.register({
      path: '/metrics',
      controller: MetricsController,
      defaultMetrics: { enabled: true },
    }),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
