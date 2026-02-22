import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SaplModule } from '@sapl/nestjs';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { ConstraintDemoController } from './constraint-demo.controller';
import { AppService } from './app.service';
import { LogAccessHandler } from './handlers/log-access.handler';
import { AuditTrailHandler } from './handlers/audit-trail.handler';
import { RedactFieldsHandler } from './handlers/redact-fields.handler';
import { ClassificationFilterHandler } from './handlers/classification-filter.handler';
import { InjectTimestampHandler } from './handlers/inject-timestamp.handler';
import { NotifyOnErrorHandler } from './handlers/notify-on-error.handler';
import { EnrichErrorHandler } from './handlers/enrich-error.handler';

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
      useFactory: (config: ConfigService) => ({
        baseUrl: config.get('SAPL_PDP_URL', 'http://localhost:8443'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController, ConstraintDemoController],
  providers: [
    AppService,
    LogAccessHandler,
    AuditTrailHandler,
    RedactFieldsHandler,
    ClassificationFilterHandler,
    InjectTimestampHandler,
    NotifyOnErrorHandler,
    EnrichErrorHandler,
  ],
})
export class AppModule {}
