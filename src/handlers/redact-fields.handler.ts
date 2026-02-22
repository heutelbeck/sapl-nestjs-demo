import { Injectable, Logger } from '@nestjs/common';
import {
  MappingConstraintHandlerProvider,
  SaplConstraintHandler,
} from '@sapl/nestjs';

/**
 * Demonstrates: MappingConstraintHandlerProvider
 *
 * Handles obligations/advice of type "redactFields".
 * Transforms the response by replacing specified fields with
 * "[REDACTED]". Unlike the built-in ContentFilter (which handles
 * blacken/delete/replace via filterJsonContent), this is a custom
 * domain-specific transformation.
 *
 * Policy obligation example:
 *   { "type": "redactFields", "fields": ["ssn", "creditCard"] }
 */
@Injectable()
@SaplConstraintHandler('mapping')
export class RedactFieldsHandler implements MappingConstraintHandlerProvider {
  private readonly logger = new Logger(RedactFieldsHandler.name);

  isResponsible(constraint: any): boolean {
    return constraint?.type === 'redactFields';
  }

  getPriority(): number {
    return 0;
  }

  getHandler(constraint: any): (value: any) => any {
    const fields: string[] = constraint.fields ?? [];
    return (value: any) => {
      if (value == null || typeof value !== 'object') return value;
      const copy = { ...value };
      for (const field of fields) {
        if (field in copy) {
          this.logger.log(`[REDACT] Redacting field: ${field}`);
          copy[field] = '[REDACTED]';
        }
      }
      return copy;
    };
  }
}
