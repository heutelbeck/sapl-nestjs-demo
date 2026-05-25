import { Injectable, Logger } from '@nestjs/common';
import { ConstraintHandlerProvider, SaplConstraintHandler, ScopedHandler } from '@sapl/nestjs';

/**
 * Demonstrates: a consumer handler on the error signal.
 *
 * Handles obligations/advice of type "notifyOnError". When the
 * controller method throws an error, this handler runs a side-effect
 * (logging/notification) WITHOUT modifying the error.
 *
 * In production, this could send alerts to monitoring systems,
 * record the error in an audit log, or notify on-call staff.
 *
 * Policy obligation example:
 *   { "type": "notifyOnError" }
 */
@Injectable()
@SaplConstraintHandler('provider')
export class NotifyOnErrorHandler implements ConstraintHandlerProvider {
  private readonly logger = new Logger(NotifyOnErrorHandler.name);

  getHandlers(constraint: unknown): ReadonlyArray<ScopedHandler> {
    if ((constraint as { type?: unknown })?.type !== 'notifyOnError') return [];
    return [
      {
        signal: 'error',
        priority: 0,
        shape: 'consumer',
        handler: (value) => {
          const error = value as Error;
          this.logger.warn(
            `[ERROR-NOTIFY] Error during policy-protected operation: ${error.message}`,
          );
        },
      },
    ];
  }
}
