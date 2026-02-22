import { Controller, Get, Logger, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PreEnforce, PostEnforce } from '@sapl/nestjs';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/constraints')
export class ConstraintDemoController {
  private readonly logger = new Logger(ConstraintDemoController.name);

  // The PDP returns an obligation with type "filterJsonContent" that
  // blackens the SSN field. The built-in ContentFilteringProvider
  // handles this automatically.
  @PreEnforce({ action: 'readPatient', resource: 'patient' })
  @Get('patient')
  getPatient() {
    return {
      name: 'Jane Doe',
      ssn: '123-45-6789',
      email: 'jane.doe@example.com',
      diagnosis: 'healthy',
    };
  }

  // @PostEnforce where ctx.returnValue is available in the resource
  // callback for policy evaluation.
  @PostEnforce({
    action: 'readRecord',
    resource: (ctx) => ({
      type: 'record',
      data: ctx.returnValue,
    }),
  })
  @Get('record/:id')
  getRecord(@Param('id') id: string) {
    this.logger.log(`Fetching record ${id}`);
    return { id, value: 'sensitive-data', classification: 'confidential' };
  }

  // The PDP returns a PERMIT with an obligation that no registered
  // handler can process. The ConstraintEnforcementService denies
  // access (ForbiddenException) because unhandled obligations are
  // mandatory.
  @PreEnforce({ action: 'readSecret', resource: 'secret' })
  @Get('unhandled')
  getUnhandled() {
    return { data: 'you should not see this' };
  }

  // @PostEnforce with an onDeny callback that returns a custom
  // response body instead of throwing ForbiddenException.
  @PostEnforce({
    action: 'readAudit',
    resource: 'audit',
    onDeny: (ctx, decision) => ({
      denied: true,
      reason: decision.decision,
      handler: ctx.handler,
    }),
  })
  @Get('audit')
  getAudit() {
    return {
      entries: [{ action: 'login', timestamp: '2026-01-01T00:00:00Z' }],
    };
  }
}
