import { Injectable, Logger } from '@nestjs/common';
import {
  RunnableConstraintHandlerProvider,
  SaplConstraintHandler,
  Signal,
} from '@sapl/nestjs';

/**
 * Demonstrates: RunnableConstraintHandlerProvider
 *
 * Handles obligations/advice of type "logAccess".
 * Runs a side-effect (logging) when a PDP decision is received,
 * BEFORE the controller method executes.
 *
 * Policy obligation example:
 *   { "type": "logAccess", "message": "Patient record accessed" }
 */
@Injectable()
@SaplConstraintHandler('runnable')
export class LogAccessHandler implements RunnableConstraintHandlerProvider {
  private readonly logger = new Logger(LogAccessHandler.name);

  isResponsible(constraint: any): boolean {
    return constraint?.type === 'logAccess';
  }

  getSignal(): Signal {
    return Signal.ON_DECISION;
  }

  getHandler(constraint: any): () => void {
    const message = constraint.message ?? 'Access logged';
    return () => {
      this.logger.log(`[POLICY] ${message}`);
    };
  }
}
