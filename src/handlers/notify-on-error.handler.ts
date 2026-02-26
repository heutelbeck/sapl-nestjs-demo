import { Injectable, Logger } from '@nestjs/common';
import { ErrorHandlerProvider, SaplConstraintHandler } from '@sapl/nestjs';

/**
 * Demonstrates: ErrorHandlerProvider
 *
 * Handles obligations/advice of type "notifyOnError".
 * When the controller method throws an error, this handler runs
 * a side-effect (logging/notification) WITHOUT modifying the error.
 *
 * In production, this could send alerts to monitoring systems,
 * record the error in an audit log, or notify on-call staff.
 *
 * Policy obligation example:
 *   { "type": "notifyOnError" }
 */
@Injectable()
@SaplConstraintHandler('errorHandler')
export class NotifyOnErrorHandler implements ErrorHandlerProvider {
  private readonly logger = new Logger(NotifyOnErrorHandler.name);

  isResponsible(constraint: any): boolean {
    return constraint?.type === 'notifyOnError';
  }

  getHandler(_constraint: any): (error: Error) => void {
    return (error: Error) => {
      this.logger.warn(
        `[ERROR-NOTIFY] Error during policy-protected operation: ${error.message}`,
      );
    };
  }
}
