import {
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PdpService, PreEnforce, SubscriptionContext } from '@sapl/nestjs';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api')
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly pdpService: PdpService,
  ) {}

  // Manual PDP access without decorators.
  @Get('hello')
  async getHello(@Request() req) {
    const user = req.user;
    this.logger.log(
      `Manual PDP: ${user.preferred_username} (${user.user_role})`,
    );

    const decision = await this.pdpService.decideOnce({
      subject: user,
      action: 'read',
      resource: 'hello',
    });

    this.logger.log(`PDP decision: ${JSON.stringify(decision)}`);
    if (
      decision.decision === 'PERMIT' &&
      !decision.obligations?.length &&
      decision.resource == null
    ) {
      return this.appService.getHello();
    }
    throw new ForbiddenException('Access denied by policy');
  }

  // @PreEnforce with custom resource builder.
  // Clinician can only export data for their own pilotId.
  @PreEnforce({
    action: 'exportData',
    resource: (ctx) => ({
      pilotId: ctx.params.pilotId,
      sequenceId: ctx.params.sequenceId,
    }),
  })
  @Get('exportData/:pilotId/:sequenceId')
  getExportData(
    @Param('pilotId') pilotId: string,
    @Param('sequenceId') sequenceId: string,
  ) {
    this.logger.log(`exportData: pilot=${pilotId} seq=${sequenceId}`);
    return this.appService.getExportData(pilotId, sequenceId);
  }

  // @PreEnforce with custom onDeny handler.
  // Returns a structured JSON response instead of throwing 403.
  @PreEnforce({
    action: 'exportData',
    resource: (ctx) => ({
      pilotId: ctx.params.pilotId,
      sequenceId: ctx.params.sequenceId,
    }),
    onDeny: handleExportDeny,
  })
  @Get('exportData2/:pilotId/:sequenceId')
  getExportData2(
    @Param('pilotId') pilotId: string,
    @Param('sequenceId') sequenceId: string,
  ) {
    this.logger.log(`exportData2: pilot=${pilotId} seq=${sequenceId}`);
    return this.appService.getExportData(pilotId, sequenceId);
  }
}

function handleExportDeny(ctx: SubscriptionContext, decision: any) {
  return {
    error: 'access_denied',
    decision: decision.decision,
    user: ctx.request.user?.preferred_username ?? 'unknown',
    requested: {
      pilotId: ctx.params.pilotId,
      sequenceId: ctx.params.sequenceId,
    },
  };
}
