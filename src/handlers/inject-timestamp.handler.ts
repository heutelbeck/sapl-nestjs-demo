import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ConstraintHandlerProvider, SaplConstraintHandler, ScopedHandler } from '@sapl/nestjs';

export const POLICY_TIMESTAMP_KEY = 'policyTimestamp';

/**
 * Demonstrates: a decision-signal runner that publishes policy-derived
 * metadata into request-scoped CLS state.
 *
 * Handles obligations/advice of type "injectTimestamp". Fires when a
 * PDP decision arrives, captures the current timestamp into
 * `ClsService` under `POLICY_TIMESTAMP_KEY`, and lets the controller
 * read it via the same key. This replaces the older request-mutation
 * pattern: handlers no longer receive the request object directly;
 * cross-cutting state moves through the host's request-scoped DI
 * (ClsService here) rather than through the constraint-handler
 * signal channel.
 *
 * Policy obligation example:
 *   { "type": "injectTimestamp" }
 */
@Injectable()
@SaplConstraintHandler('provider')
export class InjectTimestampHandler implements ConstraintHandlerProvider {
  private readonly logger = new Logger(InjectTimestampHandler.name);

  constructor(private readonly cls: ClsService) {}

  getHandlers(constraint: unknown): ReadonlyArray<ScopedHandler> {
    if ((constraint as { type?: unknown })?.type !== 'injectTimestamp') return [];
    return [
      {
        signal: 'decision',
        priority: 0,
        shape: 'runner',
        handler: () => {
          const timestamp = new Date().toISOString();
          this.cls.set(POLICY_TIMESTAMP_KEY, timestamp);
          this.logger.log(`[DECISION] Published policy timestamp to CLS: ${timestamp}`);
        },
      },
    ];
  }
}
