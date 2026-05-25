import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConstraintHandlerProvider, SaplConstraintHandler, ScopedHandler } from '@sapl/nestjs';

/**
 * Demonstrates: an error-signal mapper.
 *
 * Handles obligations/advice of type "enrichError". When the
 * controller method throws an error, this handler TRANSFORMS the
 * error by wrapping it with additional context (e.g., a support URL).
 *
 * Returning a new Error replaces the original on the propagated chain.
 *
 * Policy obligation example:
 *   { "type": "enrichError", "supportUrl": "https://support.example.com" }
 */
@Injectable()
@SaplConstraintHandler('provider')
export class EnrichErrorHandler implements ConstraintHandlerProvider {
  private readonly logger = new Logger(EnrichErrorHandler.name);

  getHandlers(constraint: unknown): ReadonlyArray<ScopedHandler> {
    if ((constraint as { type?: unknown })?.type !== 'enrichError') return [];
    const supportUrl =
      (constraint as { supportUrl?: string }).supportUrl ?? 'https://support.example.com';
    return [
      {
        signal: 'error',
        priority: 0,
        shape: 'mapper',
        handler: (value) => {
          const error = value as Error;
          this.logger.log(`[ERROR-ENRICH] Enriching error with support URL: ${supportUrl}`);
          return new InternalServerErrorException(`${error.message} | Support: ${supportUrl}`);
        },
      },
    ];
  }
}
