import { Injectable, Logger } from '@nestjs/common';
import {
  ConsumerConstraintHandlerProvider,
  SaplConstraintHandler,
} from '@sapl/nestjs';

/**
 * Demonstrates: ConsumerConstraintHandlerProvider
 *
 * Handles obligations/advice of type "auditTrail".
 * Receives the response value AFTER the controller method returns
 * and records it to an in-memory audit log. This is a side-effect
 * that does not modify the response.
 *
 * The audit log is exposed via getAuditLog() so the demo can
 * show what was recorded.
 *
 * Policy obligation example:
 *   { "type": "auditTrail", "action": "readMedicalRecord" }
 */
@Injectable()
@SaplConstraintHandler('consumer')
export class AuditTrailHandler implements ConsumerConstraintHandlerProvider {
  private readonly logger = new Logger(AuditTrailHandler.name);
  private readonly auditLog: Array<{
    timestamp: string;
    action: string;
    value: any;
  }> = [];

  isResponsible(constraint: any): boolean {
    return constraint?.type === 'auditTrail';
  }

  getHandler(constraint: any): (value: any) => void {
    const action = constraint.action ?? 'unknown';
    return (value: any) => {
      const entry = {
        timestamp: new Date().toISOString(),
        action,
        value,
      };
      this.auditLog.push(entry);
      this.logger.log(`[AUDIT] ${action}: recorded response`);
    };
  }

  getAuditLog() {
    return [...this.auditLog];
  }
}
