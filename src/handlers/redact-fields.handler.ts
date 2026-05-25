import { Injectable, Logger } from '@nestjs/common';
import { ConstraintHandlerProvider, SaplConstraintHandler, ScopedHandler } from '@sapl/nestjs';

/**
 * Demonstrates: an output-signal mapper that transforms response fields.
 *
 * Handles obligations/advice of type "redactFields". Replaces the
 * named fields with "[REDACTED]". A custom domain-specific
 * transformation, complementary to the built-in
 * `ContentFilteringProvider` (which handles blacken / delete / replace
 * via `filterJsonContent`).
 *
 * Policy obligation example:
 *   { "type": "redactFields", "fields": ["ssn", "creditCard"] }
 */
@Injectable()
@SaplConstraintHandler('provider')
export class RedactFieldsHandler implements ConstraintHandlerProvider {
  private readonly logger = new Logger(RedactFieldsHandler.name);

  getHandlers(constraint: unknown): ReadonlyArray<ScopedHandler> {
    if ((constraint as { type?: unknown })?.type !== 'redactFields') return [];
    const fields: string[] = (constraint as { fields?: string[] }).fields ?? [];
    return [
      {
        signal: 'output',
        priority: 0,
        shape: 'mapper',
        handler: (value) => {
          if (value == null || typeof value !== 'object') return value;
          const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
          for (const field of fields) {
            if (field in copy) {
              this.logger.log(`[REDACT] Redacting field: ${field}`);
              copy[field] = '[REDACTED]';
            }
          }
          return copy;
        },
      },
    ];
  }
}
