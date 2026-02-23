import { Injectable, Logger } from '@nestjs/common';
import {
  ConsumerConstraintHandlerProvider,
  SaplConstraintHandler,
} from '@sapl/nestjs';

/**
 * Logs streaming events as a side-effect when a policy obligation
 * of type "logStreamEvent" is present. Demonstrates ConsumerConstraintHandlerProvider
 * usage in a streaming context.
 */
@Injectable()
@SaplConstraintHandler('consumer')
export class LogStreamEventHandler implements ConsumerConstraintHandlerProvider {
  private readonly logger = new Logger(LogStreamEventHandler.name);

  isResponsible(constraint: any): boolean {
    return constraint?.type === 'logStreamEvent';
  }

  getHandler(constraint: any): (value: any) => void {
    const message = constraint.message ?? 'Stream event';
    return (value: any) => {
      this.logger.log(`[STREAM-LOG] ${message}: ${JSON.stringify(value)}`);
    };
  }
}
