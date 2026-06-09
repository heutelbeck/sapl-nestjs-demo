import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SaplModule } from '@sapl/nestjs';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { ConstraintDemoController } from './constraint-demo.controller';
import { AppService } from './app.service';
import { PatientService } from './patient.service';
import { LogAccessHandler } from './handlers/log-access.handler';
import { AuditTrailHandler } from './handlers/audit-trail.handler';
import { RedactFieldsHandler } from './handlers/redact-fields.handler';
import { ClassificationFilterHandler } from './handlers/classification-filter.handler';
import { InjectTimestampHandler } from './handlers/inject-timestamp.handler';
import { CapTransferHandler } from './handlers/cap-transfer.handler';
import { NotifyOnErrorHandler } from './handlers/notify-on-error.handler';
import { EnrichErrorHandler } from './handlers/enrich-error.handler';
import { StreamingDemoController } from './streaming-demo.controller';
import { StreamingDemoService } from './streaming-demo.service';
import { LogStreamEventHandler } from './handlers/log-stream-event.handler';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [
        '.env.local',
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env',
      ],
    }),
    AuthModule,
    SaplModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const transport = config.get<'http' | 'rsocket'>('SAPL_TRANSPORT', 'http');
        const baseUrl = config.get('SAPL_PDP_URL', 'http://localhost:8443');
        return {
          transport,
          baseUrl,
          rsocketHost: config.get('SAPL_PDP_RSOCKET_HOST'),
          rsocketPort: config.get<number>('SAPL_PDP_RSOCKET_PORT'),
          allowInsecureConnections: true,
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [
    AppController,
    ConstraintDemoController,
    StreamingDemoController,
  ],
  providers: [
    AppService,
    PatientService,
    LogAccessHandler,
    AuditTrailHandler,
    RedactFieldsHandler,
    ClassificationFilterHandler,
    InjectTimestampHandler,
    CapTransferHandler,
    NotifyOnErrorHandler,
    EnrichErrorHandler,
    StreamingDemoService,
    LogStreamEventHandler,
  ],
})
export class AppModule {}
