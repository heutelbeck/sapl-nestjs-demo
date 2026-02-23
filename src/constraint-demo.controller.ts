import { Controller, Get, Logger, Param, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PreEnforce, PostEnforce, SubscriptionContext } from '@sapl/nestjs';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AuditTrailHandler } from './handlers/audit-trail.handler';

function bearerToken(ctx: SubscriptionContext) {
  return { jwt: ctx.request.headers?.authorization?.split(' ')[1] };
}

/**
 * Demonstrates all constraint handler types supported by @sapl/nestjs.
 *
 * Each endpoint is protected by a SAPL policy that attaches obligations
 * or advice. The ConstraintEnforcementService discovers registered
 * handlers via the @SaplConstraintHandler decorator and builds a
 * ConstraintHandlerBundle that enforces all constraints.
 *
 * Sections:
 *   1. Built-in Content Filtering   (filterJsonContent)
 *   2. Custom Constraint Handlers   (one per provider interface)
 *   3. Advanced Patterns            (resource replacement, advice, fail-fast)
 */
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/constraints')
export class ConstraintDemoController {
  private readonly logger = new Logger(ConstraintDemoController.name);

  constructor(private readonly auditTrailHandler: AuditTrailHandler) {}

  // ---------------------------------------------------------------------------
  // Section 1: Built-in Content Filtering (filterJsonContent)
  // ---------------------------------------------------------------------------

  /**
   * 1a. Content Filter -- blacken
   *
   * The PDP returns a PERMIT with obligation:
   *   { "type": "filterJsonContent", "actions": [{ "type": "blacken", "path": "$.ssn", "discloseRight": 4 }] }
   *
   * The built-in ContentFilteringProvider (MappingConstraintHandlerProvider)
   * masks the SSN field, disclosing only the last 4 characters.
   *
   * Expected: { name: "Jane Doe", ssn: "XXXXX6789", email: "...", diagnosis: "..." }
   */
  @PreEnforce({ action: 'readPatient', resource: 'patient', secrets: bearerToken })
  @Get('patient')
  getPatient() {
    return {
      name: 'Jane Doe',
      ssn: '123-45-6789',
      email: 'jane.doe@example.com',
      diagnosis: 'healthy',
    };
  }

  /**
   * 1b. Content Filter -- blacken + delete + replace (all three actions)
   *
   * The PDP returns a PERMIT with obligation combining all three filter types:
   *   - blacken $.ssn (mask all but last 4 digits)
   *   - delete $.internalNotes (remove field entirely)
   *   - replace $.email (substitute with placeholder)
   *
   * Expected: ssn masked, internalNotes absent, email replaced with "redacted@example.com"
   */
  @PreEnforce({ action: 'readPatientFull', resource: 'patientFull', secrets: bearerToken })
  @Get('patient-full')
  getPatientFull() {
    return {
      name: 'Jane Doe',
      ssn: '123-45-6789',
      email: 'jane.doe@example.com',
      diagnosis: 'healthy',
      internalNotes: 'Follow-up scheduled for next week',
    };
  }

  // ---------------------------------------------------------------------------
  // Section 2: Custom Constraint Handlers (one per provider interface)
  // ---------------------------------------------------------------------------

  /**
   * 2a. RunnableConstraintHandlerProvider -- LogAccessHandler
   *
   * The PDP returns a PERMIT with obligation:
   *   { "type": "logAccess", "message": "Patient data accessed by clinician" }
   *
   * LogAccessHandler.getHandler() returns a () => void that logs the message.
   * This runs on ON_DECISION signal, before the controller method executes.
   *
   * Watch the server console for: [LogAccessHandler] [POLICY] Patient data accessed by clinician
   */
  @PreEnforce({ action: 'readLogged', resource: 'logged', secrets: bearerToken })
  @Get('logged')
  getLogged() {
    return {
      message: 'This response was logged by a policy obligation',
      data: { patientId: 'P-001', status: 'active' },
    };
  }

  /**
   * 2b. ConsumerConstraintHandlerProvider -- AuditTrailHandler
   *
   * The PDP returns a PERMIT with obligation:
   *   { "type": "auditTrail", "action": "readMedicalRecord" }
   *
   * AuditTrailHandler.getHandler() returns a (value) => void that receives
   * the response value and records it to an in-memory audit log. The response
   * itself is NOT modified (consumers are side-effect only).
   *
   * Call this endpoint, then call GET /api/constraints/audit-log to see
   * what was recorded.
   */
  @PreEnforce({ action: 'readAudited', resource: 'audited', secrets: bearerToken })
  @Get('audited')
  getAudited() {
    return {
      message: 'This response was recorded in the audit trail',
      record: { id: 'MR-42', type: 'blood-work', result: 'normal' },
    };
  }

  /**
   * Auxiliary endpoint: view the in-memory audit trail.
   * Not policy-protected -- just shows what the AuditTrailHandler recorded.
   */
  @Get('audit-log')
  getAuditLog() {
    return this.auditTrailHandler.getAuditLog();
  }

  /**
   * 2c. MappingConstraintHandlerProvider -- RedactFieldsHandler
   *
   * The PDP returns a PERMIT with obligation:
   *   { "type": "redactFields", "fields": ["ssn", "creditCard"] }
   *
   * RedactFieldsHandler.getHandler() returns a (value) => any that replaces
   * the specified fields with "[REDACTED]". Unlike the built-in ContentFilter
   * (blacken/delete/replace), this is a custom domain-specific transformation.
   *
   * Expected: ssn and creditCard become "[REDACTED]", other fields unchanged.
   */
  @PreEnforce({ action: 'readRedacted', resource: 'redacted', secrets: bearerToken })
  @Get('redacted')
  getRedacted() {
    return {
      name: 'John Smith',
      ssn: '987-65-4321',
      creditCard: '4111-1111-1111-1111',
      email: 'john@example.com',
      balance: 1500.00,
    };
  }

  /**
   * 2d. FilterPredicateConstraintHandlerProvider -- ClassificationFilterHandler
   *
   * The PDP returns a PERMIT with obligation:
   *   { "type": "filterByClassification", "maxLevel": "INTERNAL" }
   *
   * ClassificationFilterHandler.getHandler() returns a (element) => boolean
   * predicate. When the controller returns an array, the ConstraintHandlerBundle
   * filters elements using this predicate. Elements with classification above
   * "INTERNAL" are excluded.
   *
   * Expected: only PUBLIC and INTERNAL documents are returned; CONFIDENTIAL
   * and SECRET documents are filtered out.
   */
  @PreEnforce({ action: 'readDocuments', resource: 'documents', secrets: bearerToken })
  @Get('documents')
  getDocuments() {
    return [
      { id: 'DOC-1', title: 'Company Newsletter', classification: 'PUBLIC' },
      { id: 'DOC-2', title: 'Team Standup Notes', classification: 'INTERNAL' },
      { id: 'DOC-3', title: 'Patient Records', classification: 'CONFIDENTIAL' },
      { id: 'DOC-4', title: 'Encryption Keys', classification: 'SECRET' },
    ];
  }

  /**
   * 2e. MethodInvocationConstraintHandlerProvider -- InjectTimestampHandler
   *
   * The PDP returns a PERMIT with obligation:
   *   { "type": "injectTimestamp" }
   *
   * InjectTimestampHandler.getHandler() returns a (request) => void that adds
   * a "policyTimestamp" property to the Express request object BEFORE the
   * controller method executes. The controller reads this injected value
   * and includes it in the response.
   *
   * This demonstrates how policies can modify the execution context
   * before the handler runs (e.g., injecting metadata, modifying parameters).
   *
   * Expected: response includes policyTimestamp set by the constraint handler.
   */
  @PreEnforce({ action: 'readTimestamped', resource: 'timestamped', secrets: bearerToken })
  @Get('timestamped')
  getTimestamped(@Request() req) {
    return {
      message: 'This response includes a policy-injected timestamp',
      policyTimestamp: req.policyTimestamp ?? 'not injected',
      data: { sensor: 'temp-01', value: 22.5 },
    };
  }

  /**
   * 2f. ErrorHandlerProvider + ErrorMappingConstraintHandlerProvider
   *
   * The PDP returns a PERMIT with two obligations:
   *   { "type": "notifyOnError" }
   *   { "type": "enrichError", "supportUrl": "https://support.example.com/errors" }
   *
   * The controller intentionally throws to demonstrate the error pipeline:
   *   1. NotifyOnErrorHandler (ErrorHandlerProvider) logs the error (side-effect)
   *   2. EnrichErrorHandler (ErrorMappingConstraintHandlerProvider) transforms
   *      the error, appending a support URL to the message
   *
   * The enriched error is then thrown by the interceptor's catchError pipe.
   *
   * Watch the server console for both [ERROR-NOTIFY] and [ERROR-ENRICH] logs.
   * Expected: 500 with enriched error message including the support URL.
   */
  @PreEnforce({ action: 'readErrorDemo', resource: 'errorDemo', secrets: bearerToken })
  @Get('error-demo')
  getErrorDemo() {
    throw new Error('Simulated backend failure');
  }

  // ---------------------------------------------------------------------------
  // Section 3: Advanced Patterns
  // ---------------------------------------------------------------------------

  /**
   * 3a. Resource Replacement
   *
   * The PDP returns a PERMIT with a "resource" field in the decision:
   *   { decision: "PERMIT", resource: { message: "...", policyGenerated: true, ... } }
   *
   * The policy uses SAPL's "transform" keyword to replace the resource entirely.
   * The ConstraintHandlerBundle substitutes the controller's return value with
   * the PDP-provided resource. The controller's actual return value is ignored.
   *
   * This is useful when the PDP itself determines what data the user should see,
   * e.g., returning policy-compliant versions of resources, anonymized datasets,
   * or dynamically generated content.
   *
   * Expected: the response contains the PDP-generated object, NOT the
   * controller's return value.
   */
  @PreEnforce({ action: 'readReplaced', resource: 'replaced', secrets: bearerToken })
  @Get('resource-replaced')
  getResourceReplaced() {
    return {
      message: 'You should NOT see this -- the PDP replaces this resource',
      originalData: true,
    };
  }

  /**
   * 3b. Advice vs Obligations
   *
   * The PDP returns a PERMIT with two ADVICE constraints (not obligations):
   *   { "type": "logAccess", "message": "Advisory: medical data accessed" }
   *   { "type": "nonExistentAdviceHandler", "note": "No handler exists..." }
   *
   * Key difference from obligations:
   *   - Obligations are MANDATORY: if no handler can process an obligation,
   *     access is denied (ForbiddenException).
   *   - Advice is BEST-EFFORT: if a handler fails or no handler exists,
   *     access is still granted.
   *
   * The first advice (logAccess) succeeds -- the LogAccessHandler logs it.
   * The second advice (nonExistentAdviceHandler) has no handler -- but access
   * is still permitted because advice is non-mandatory.
   *
   * Watch the server console: you'll see the logAccess log but no error for
   * the unhandled advice.
   */
  @PreEnforce({ action: 'readAdvised', resource: 'advised', secrets: bearerToken })
  @Get('advised')
  getAdvised() {
    return {
      message: 'Access granted despite unhandled advice',
      data: { category: 'medical', status: 'reviewed' },
    };
  }

  /**
   * 3c. @PostEnforce with ctx.returnValue
   *
   * In @PostEnforce, the controller method executes FIRST, then the PDP
   * is called with the return value available as ctx.returnValue in the
   * resource callback. This allows policies to make decisions based on
   * the actual data being returned.
   *
   * The policy permit-clinician-read-record permits clinicians to read records.
   */
  @PostEnforce({
    action: 'readRecord',
    resource: (ctx) => ({
      type: 'record',
      data: ctx.returnValue,
    }),
    secrets: bearerToken,
  })
  @Get('record/:id')
  getRecord(@Param('id') id: string) {
    this.logger.log(`Fetching record ${id}`);
    return { id, value: 'sensitive-data', classification: 'confidential' };
  }

  /**
   * 3d. Unhandled Obligation -- Fail-Fast
   *
   * The PDP returns a PERMIT with an obligation of type "unknownConstraintType"
   * that no registered handler can process.
   *
   * Because obligations are MANDATORY, the ConstraintEnforcementService
   * throws ForbiddenException when it detects unhandled obligations.
   * The controller method never executes.
   *
   * Compare with 3b (Advice): unhandled advice does NOT deny access.
   *
   * Expected: 403 Forbidden, regardless of the PERMIT decision.
   */
  @PreEnforce({ action: 'readSecret', resource: 'secret', secrets: bearerToken })
  @Get('unhandled')
  getUnhandled() {
    return { data: 'you should not see this' };
  }

  /**
   * 3e. @PostEnforce with onDeny Callback
   *
   * Demonstrates a custom deny handler that returns a structured response
   * instead of throwing ForbiddenException. The onDeny callback receives
   * the SubscriptionContext and the PDP decision.
   *
   * Clinicians are permitted (permit-clinician-read-audit policy).
   * Participants are denied (no matching permit policy, default DENY).  3. The user wants to demonstrate that decorators work on service classes (not just controllers), which is the whole reason we migrated to AOP.
   *
   * When denied, the onDeny callback returns a JSON body with the decision
   * details instead of a 403 status code.
   */
  @PostEnforce({
    action: 'readAudit',
    resource: 'audit',
    secrets: bearerToken,
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
