import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import {
  PdpService,
  PostEnforce,
  PreEnforce,
  SubscriptionContext,
} from '@sapl/nestjs';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PatientService } from './patient.service';

function bearerToken(ctx: SubscriptionContext) {
  const auth = ctx.request.headers?.authorization;
  const token = typeof auth === 'string' ? auth.split(' ')[1] : undefined;
  return { jwt: token };
}

/**
 * Demonstrates basic authorization patterns with @sapl/nestjs.
 *
 * These endpoints show the three fundamental ways to enforce policies:
 *   1. Manual PDP access (PdpService.decideOnce)
 *   2. @PreEnforce decorator (declarative, before method execution)
 *   3. @PreEnforce with a custom deny response (exception filter)
 */
@Controller('api')
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly patientService: PatientService,
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
   * @PreEnforce with custom deny-response shaping (JWT required).
   *
   * When the PDP denies access, the aspect throws `AccessDeniedError`
   * which `extends ForbiddenException`. The HTTP layer routes that as
   * a 403 by default. To customise the response shape, write a
   * NestJS `@Catch(ForbiddenException)` exception filter -- the
   * idiomatic NestJS mechanism, integrates correctly with
   * `@Transactional`, and works uniformly across HTTP, RPC and WS
   * transports.
   *
   * The shape of the customised response is the filter's concern,
   * not the decorator's.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @PreEnforce({
    action: 'exportData',
    resource: (context) => ({
      pilotId: context.params.pilotId,
      sequenceId: context.params.sequenceId,
    }),
    secrets: bearerToken,
  })
  @Get('exportData2/:pilotId/:sequenceId')
  getExportData2(@Param('pilotId') pilotId: string, @Param('sequenceId') sequenceId: string) {
    this.logger.log(`exportData2: pilot=${pilotId} seq=${sequenceId}`);
    return this.appService.getExportData(pilotId, sequenceId);
  }

  @PreEnforce({ action: 'readPatient', resource: 'patient' })
  @Get('patient/:id')
  getPatient(@Param('id') id: string) {
    return this.patientService.getPatientById(id);
  }

  @PostEnforce({ action: 'readPatients', resource: 'patients' })
  @Get('patients')
  getPatients() {
    return this.patientService.getAllPatients();
  }

  @HttpCode(200)
  @Post('transfer')
  @PreEnforce({ action: 'transfer', resource: 'account' })
  transfer(@Query('amount') amount: string) {
    return {
      transferred: Number(amount),
      recipient: 'default-account',
      status: 'completed',
    };
  }

}
