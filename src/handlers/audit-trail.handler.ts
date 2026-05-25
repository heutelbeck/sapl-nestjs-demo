import { Injectable, Logger } from '@nestjs/common';
import { ConstraintHandlerProvider, SaplConstraintHandler, ScopedHandler } from '@sapl/nestjs';

/**
 * Demonstrates: a consumer handler attached to the output signal.
 *
 * Handles obligations/advice of type "auditTrail". Receives the
 * response value AFTER the controller method returns and records it
 * to an in-memory audit log. Side-effect only; does not modify the
 * response.
 *
 * The audit log is exposed via getAuditLog() so the demo can show
 * what was recorded.
 *
 * Policy obligation example:
 *   { "type": "auditTrail", "action": "readMedicalRecord" }
 */
@Injectable()
@SaplConstraintHandler('provider')
export class AuditTrailHandler implements ConstraintHandlerProvider {
  private readonly logger = new Logger(AuditTrailHandler.name);
  private readonly auditLog: Array<{
    timestamp: string;
    action: string;
    value: unknown;
  }> = [];

  getHandlers(constraint: unknown): ReadonlyArray<ScopedHandler> {
    if ((constraint as { type?: unknown })?.type !== 'auditTrail') return [];
    const action = (constraint as { action?: string }).action ?? 'unknown';
    return [
      {
        signal: 'output',
        priority: 0,
        shape: 'consumer',
        handler: (value) => {
          this.auditLog.push({
            timestamp: new Date().toISOString(),
            action,
            value,
          });
          this.logger.log(`[AUDIT] ${action}: recorded response`);
        },
      },
    ];
  }

  getAuditLog() {
    return [...this.auditLog];
  }
}
