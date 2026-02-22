import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SaplModule } from '@sapl/nestjs';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { ConstraintDemoController } from './constraint-demo.controller';
import { AppService } from './app.service';

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
  providers: [AppService],
})
export class AppModule {}
