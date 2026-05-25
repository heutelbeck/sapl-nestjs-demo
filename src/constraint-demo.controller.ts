import { Controller, Get, Logger, Param } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PreEnforce, PostEnforce } from '@sapl/nestjs';
import { AuditTrailHandler } from './handlers/audit-trail.handler';
import { POLICY_TIMESTAMP_KEY } from './handlers/inject-timestamp.handler';

/**
 * Demonstrates all constraint handler patterns supported by @sapl/nestjs.
 *
 * Each endpoint is protected by a SAPL policy that attaches obligations
 * or advice. The `EnforcementPlanner` discovers registered handlers via
 * the `@SaplConstraintHandler('provider')` decorator and produces an
 * `EnforcementPlan` keyed by signal kind that the PEP discharges per
 * lifecycle event.
 *
 */
@Controller('api/constraints')
export class ConstraintDemoController {
  private readonly logger = new Logger(ConstraintDemoController.name);

  constructor(
    private readonly auditTrailHandler: AuditTrailHandler,
    private readonly cls: ClsService,
  ) {}

  /**
   * 1a. Content Filter -- blacken
   *
   * The PDP returns a PERMIT with obligation:
   *   { "type": "filterJsonContent", "actions": [{ "type": "blacken", "path": "$.ssn", "discloseRight": 4 }] }
   *
   * The built-in ContentFilteringProvider attaches an output-signal mapper
   * that masks the SSN field, disclosing only the last 4 characters.
   *
   * Expected: { name: "Jane Doe", ssn: "XXXXX6789", email: "...", diagnosis: "..." }
   */
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

  /**
   * 1b. Content Filter -- blacken + delete + replace (all three actions)
   *
   * The PDP returns a PERMIT with obligation combining all three filter types:
   *   - blacken $.ssn (mask all but last 4 digits)
   *   - delete $.internal_notes (remove field entirely)
   *   - replace $.email (substitute with placeholder)
   *
   * Expected: ssn masked, internal_notes absent, email replaced with "redacted@example.com"
   */
  @PreEnforce({ action: 'readPatientFull', resource: 'patientFull' })
  @Get('patient-full')
  getPatientFull() {
    return {
      name: 'Jane Doe',
      ssn: '123-45-6789',
      email: 'jane.doe@example.com',
      diagnosis: 'healthy',
      internal_notes: 'Follow-up scheduled for next week',
    };
  }

  /**
   * 2a. Decision-signal runner -- LogAccessHandler
   *
   * The PDP returns a PERMIT with obligation:
   *   { "type": "logAccess", "message": "Patient data accessed by clinician" }
   *
   * LogAccessHandler attaches a runner to the `decision` signal that
   * logs the message. The runner fires when the PDP decision arrives,
   * before the controller method executes.
   *
   * Watch the server console for: [LogAccessHandler] [POLICY] Patient data accessed by clinician
   */
  @PreEnforce({ action: 'readLogged', resource: 'logged' })
  @Get('logged')
  getLogged() {
    return {
      message: 'This response was logged by a policy obligation',
      data: { patientId: 'P-001', status: 'active' },
    };
  }

  /**
   * 2b. Output-signal consumer -- AuditTrailHandler
   *
   * The PDP returns a PERMIT with obligation:
   *   { "type": "auditTrail", "action": "readMedicalRecord" }
   *
   * AuditTrailHandler attaches a consumer to the `output` signal that
   * receives the response value and records it to an in-memory audit
   * log. Consumers observe without transforming; the response itself
   * is unchanged.
   *
   * Call this endpoint, then call GET /api/constraints/audit-log to see
   * what was recorded.
   */
  @PreEnforce({ action: 'readAudited', resource: 'audited' })
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
   * 2c. Output-signal mapper -- RedactFieldsHandler
   *
   * The PDP returns a PERMIT with obligation:
   *   { "type": "redactFields", "fields": ["ssn", "creditCard"] }
   *
   * RedactFieldsHandler attaches a mapper to the `output` signal that
   * replaces the named fields with "[REDACTED]". Unlike the built-in
   * ContentFilter (blacken / delete / replace via filterJsonContent),
   * this is a custom domain-specific transformation.
   *
   * Expected: ssn and creditCard become "[REDACTED]", other fields unchanged.
   */
  @PreEnforce({ action: 'readRedacted', resource: 'redacted' })
  @Get('redacted')
  getRedacted() {
    return {
      name: 'John Smith',
      ssn: '987-65-4321',
      creditCard: '4111-1111-1111-1111',
      email: 'john@example.com',
      balance: 1500.0,
    };
  }

  /**
   * 2d. Output-signal mapper that filters array contents
   *     -- ClassificationFilterHandler
   *
   * The PDP returns a PERMIT with obligation:
   *   { "type": "filterByClassification", "maxLevel": "INTERNAL" }
   *
   * ClassificationFilterHandler attaches a mapper to the `output` signal
   * that, when the controller returns an array, filters out elements
   * with classification above the policy-allowed maximum.
   *
   * Expected: only PUBLIC and INTERNAL documents are returned;
   * CONFIDENTIAL and SECRET documents are filtered out.
   */
  @PreEnforce({ action: 'readDocuments', resource: 'documents' })
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
   * 2e. Decision-signal runner publishing into request-scoped CLS state
   *     -- InjectTimestampHandler
   *
   * The PDP returns a PERMIT with obligation:
   *   { "type": "injectTimestamp" }
   *
   * InjectTimestampHandler attaches a runner to the decision signal that
   * captures `new Date().toISOString()` into ClsService under
   * POLICY_TIMESTAMP_KEY. The controller reads it back from ClsService
   * and includes it in the response. This is the new-API replacement
   * for the older request-mutation pattern: handlers no longer reach
   * the request object directly, so cross-cutting state moves through
   * the host's request-scoped DI.
   *
   * Expected: response includes the policy-derived timestamp.
   */
  @PreEnforce({ action: 'readTimestamped', resource: 'timestamped' })
  @Get('timestamped')
  getTimestamped() {
    return {
      message: 'This response includes a policy-derived timestamp',
      policyTimestamp: this.cls.get<string>(POLICY_TIMESTAMP_KEY) ?? 'not injected',
      data: { sensor: 'temp-01', value: 22.5 },
    };
  }

  /**
   * 2f. Error-signal consumer + error-signal mapper
   *
   * The PDP returns a PERMIT with two obligations:
   *   { "type": "notifyOnError" }
   *   { "type": "enrichError", "supportUrl": "https://support.example.com/errors" }
   *
   * The controller intentionally throws to demonstrate the error pipeline:
   *   1. NotifyOnErrorHandler attaches a consumer to the `error` signal
   *      that logs the error (side-effect).
   *   2. EnrichErrorHandler attaches a mapper to the `error` signal that
   *      transforms the error, appending a support URL to the message.
   *
   * The enriched error is then re-thrown by the aspect.
   *
   * Watch the server console for both [ERROR-NOTIFY] and [ERROR-ENRICH] logs.
   * Expected: 500 with enriched error message including the support URL.
   */
  @PreEnforce({ action: 'readErrorDemo', resource: 'errorDemo' })
  @Get('error-demo')
  getErrorDemo() {
    throw new Error('Simulated backend failure');
  }

  /**
   * 3a. Resource Replacement
   *
   * The PDP returns a PERMIT with a "resource" field in the decision:
   *   { decision: "PERMIT", resource: { message: "...", policyGenerated: true, ... } }
   *
   * The policy uses SAPL's "transform" keyword to replace the resource entirely.
   * The planner inserts a synthetic head-of-output mapper that substitutes
   * the controller's return value with the PDP-provided resource. The
   * controller's actual return value is ignored.
   *
   * This is useful when the PDP itself determines what data the user should see,
   * e.g., returning policy-compliant versions of resources, anonymized datasets,
   * or dynamically generated content.
   *
   * Expected: the response contains the PDP-generated object, NOT the
   * controller's return value.
   */
  @PreEnforce({ action: 'readReplaced', resource: 'replaced' })
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
  @PreEnforce({ action: 'readAdvised', resource: 'advised' })
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
   * The policy permit-read-record permits reading records.
   */
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
  @PreEnforce({ action: 'readSecret', resource: 'secret' })
  @Get('unhandled')
  getUnhandled() {
    return { data: 'you should not see this' };
  }

  /**
   * 3e. @PostEnforce with onDeny Callback
   *
   * On deny the aspect throws `AccessDeniedError` (a
   * `ForbiddenException` subclass) and the HTTP layer routes a 403.
   * A `@Catch(ForbiddenException)` exception filter customises the
   * response shape if needed -- standard NestJS, no decorator option.
   */
  @PostEnforce({
    action: 'readAudit',
    resource: 'audit',
  })
  @Get('audit')
  getAudit() {
    return {
      entries: [{ action: 'login', timestamp: '2026-01-01T00:00:00Z' }],
    };
  }
}
