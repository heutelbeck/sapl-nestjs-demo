import {
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PdpService, PreEnforce, SubscriptionContext } from '@sapl/nestjs';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

function bearerToken(ctx: SubscriptionContext) {
  return { jwt: ctx.request.headers?.authorization?.split(' ')[1] };
}

/**
 * Demonstrates basic authorization patterns with @sapl/nestjs.
 *
 * These endpoints show the three fundamental ways to enforce policies:
 *   1. Manual PDP access (PdpService.decideOnce)
 *   2. @PreEnforce decorator (declarative, before method execution)
 *   3. @PreEnforce with onDeny callback (custom deny handling)
 */
@Controller('api')
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly pdpService: PdpService,
  ) {}

  /**
   * Manual PDP Access -- no decorator
   *
   * Calls PdpService.decideOnce() directly to get a PDP decision.
   * The application code is responsible for interpreting the decision
   * and enforcing it manually.
   *
   * This is the most flexible approach but requires the most code.
   * Use this when you need fine-grained control over how decisions
   * are interpreted, or when you need to handle obligations/resource
   * replacement in a custom way.
   *
   * The policy permit-read-hello permits any request.
   */
  @Get('hello')
  async getHello() {
    const decision = await this.pdpService.decideOnce({
      subject: 'anonymous',
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

  /**
   * @PreEnforce with Custom Resource Builder (JWT required)
   *
   * The @PreEnforce decorator automates the PDP call and decision enforcement.
   * Before the controller method runs:
   *   1. Builds a SAPL subscription from EnforceOptions
   *   2. Calls PdpService.decideOnce()
   *   3. If PERMIT: builds constraint handler bundle, runs handlers, calls method
   *   4. If DENY: throws ForbiddenException
   *
   * The "resource" callback receives the SubscriptionContext and builds a
   * custom resource object from route parameters. The policy then uses this
   * to match the clinician's pilotId against the requested pilotId.
   *
   * clinician1 (pilotId=1) can access /api/exportData/1/* but not /api/exportData/2/*
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @PreEnforce({
    action: 'exportData',
    resource: (ctx) => ({
      pilotId: ctx.params.pilotId,
      sequenceId: ctx.params.sequenceId,
    }),
    secrets: bearerToken,
  })
  @Get('exportData/:pilotId/:sequenceId')
  getExportData(
    @Param('pilotId') pilotId: string,
    @Param('sequenceId') sequenceId: string,
  ) {
    this.logger.log(`exportData: pilot=${pilotId} seq=${sequenceId}`);
    return this.appService.getExportData(pilotId, sequenceId);
  }

  /**
   * @PreEnforce with Custom onDeny Handler (JWT required)
   *
   * When the PDP denies access, the default behavior is to throw
   * ForbiddenException (HTTP 403). The onDeny callback overrides this
   * to return a structured JSON response instead.
   *
   * The callback receives:
   *   - ctx: SubscriptionContext (request, params, user info)
   *   - decision: the full PDP decision object
   *
   * This is useful for SPAs or APIs that need machine-readable deny
   * responses rather than HTTP error codes.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @PreEnforce({
    action: 'exportData',
    resource: (ctx) => ({
      pilotId: ctx.params.pilotId,
      sequenceId: ctx.params.sequenceId,
    }),
    secrets: bearerToken,
    onDeny: AppController.handleExportDeny,
  })
  @Get('exportData2/:pilotId/:sequenceId')
  getExportData2(
    @Param('pilotId') pilotId: string,
    @Param('sequenceId') sequenceId: string,
  ) {
    this.logger.log(`exportData2: pilot=${pilotId} seq=${sequenceId}`);
    return this.appService.getExportData(pilotId, sequenceId);
  }

  private static handleExportDeny(ctx: SubscriptionContext, decision: any) {
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
}
