import { Injectable, Logger } from '@nestjs/common';
import { ConstraintHandlerProvider, SaplConstraintHandler, ScopedHandler } from '@sapl/nestjs';

/**
 * Demonstrates: a runner attached to the decision signal.
 *
 * Handles obligations/advice of type "logAccess". Fires when the PDP
 * decision arrives, before the controller method runs.
 *
 * Policy obligation example:
 *   { "type": "logAccess", "message": "Patient record accessed" }
 */
@Injectable()
@SaplConstraintHandler('provider')
export class LogAccessHandler implements ConstraintHandlerProvider {
  private readonly logger = new Logger(LogAccessHandler.name);

  getHandlers(constraint: unknown): ReadonlyArray<ScopedHandler> {
    if ((constraint as { type?: unknown })?.type !== 'logAccess') return [];
    const message = (constraint as { message?: string }).message ?? 'Access logged';
    return [
      {
        signal: 'decision',
        priority: 0,
        shape: 'runner',
        handler: () => {
          this.logger.log(`[POLICY] ${message}`);
        },
      },
    ];
  }
}
