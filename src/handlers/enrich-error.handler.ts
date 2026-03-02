import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import {
  ErrorMappingConstraintHandlerProvider,
  SaplConstraintHandler,
} from '@sapl/nestjs';

/**
 * Demonstrates: ErrorMappingConstraintHandlerProvider
 *
 * Handles obligations/advice of type "enrichError".
 * When the controller method throws an error, this handler
 * TRANSFORMS the error by wrapping it with additional context
 * (e.g., a support URL, correlation ID, or policy metadata).
 *
 * This differs from ErrorHandlerProvider (side-effect only) --
 * ErrorMappingConstraintHandlerProvider returns a NEW error that
 * replaces the original.
 *
 * Policy obligation example:
 *   { "type": "enrichError", "supportUrl": "https://support.example.com" }
 */
@Injectable()
@SaplConstraintHandler('errorMapping')
export class EnrichErrorHandler implements ErrorMappingConstraintHandlerProvider {
  private readonly logger = new Logger(EnrichErrorHandler.name);

  isResponsible(constraint: any): boolean {
    return constraint?.type === 'enrichError';
  }

  getPriority(): number {
    return 0;
  }

  getHandler(constraint: any): (error: Error) => Error {
    const supportUrl = constraint.supportUrl ?? 'https://support.example.com';
    return (error: Error) => {
      this.logger.log(
        `[ERROR-ENRICH] Enriching error with support URL: ${supportUrl}`,
      );
      return new InternalServerErrorException(
        `${error.message} | Support: ${supportUrl}`,
      );
    };
  }
}
