import { Injectable, Logger } from '@nestjs/common';
import { ConstraintHandlerProvider, SaplConstraintHandler, ScopedHandler } from '@sapl/nestjs';

/**
 * Logs streaming events as a side-effect when a policy obligation of
 * type "logStreamEvent" is present. Demonstrates a consumer handler
 * attached to the output signal in a streaming context.
 */
@Injectable()
@SaplConstraintHandler('provider')
export class LogStreamEventHandler implements ConstraintHandlerProvider {
  private readonly logger = new Logger(LogStreamEventHandler.name);

  getHandlers(constraint: unknown): ReadonlyArray<ScopedHandler> {
    if ((constraint as { type?: unknown })?.type !== 'logStreamEvent') return [];
    const message = (constraint as { message?: string }).message ?? 'Stream event';
    return [
      {
        signal: 'output',
        priority: 0,
        shape: 'consumer',
        handler: (value) => {
          this.logger.log(`[STREAM-LOG] ${message}: ${JSON.stringify(value)}`);
        },
      },
    ];
  }
}
