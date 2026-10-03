import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { TerminusModule } from '@nestjs/terminus';
import { isMetricsEnabled } from '../config/metrics';
import { HealthController, MetricsController } from './health.controller';

const metricsEnabled = isMetricsEnabled();

@Module({
  imports: [
    TerminusModule.forRoot({ errorLogStyle: 'pretty' }),
    ...(metricsEnabled
      ? [
          PrometheusModule.register({
            path: '/metrics',
            controller: MetricsController,
            defaultMetrics: { enabled: true },
          }),
        ]
      : []),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
