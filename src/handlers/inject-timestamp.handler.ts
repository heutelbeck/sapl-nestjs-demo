import { Injectable, Logger } from '@nestjs/common';
import {
  MethodInvocationConstraintHandlerProvider,
  SaplConstraintHandler,
} from '@sapl/nestjs';

/**
 * Demonstrates: MethodInvocationConstraintHandlerProvider
 *
 * Handles obligations/advice of type "injectTimestamp".
 * Modifies the request object BEFORE the controller method executes,
 * adding a policy-enforcement timestamp. The controller can then
 * read this value and include it in its response.
 *
 * This pattern is useful for:
 * - Injecting policy-derived metadata into the request
 * - Modifying request parameters based on policy constraints
 * - Adding audit/traceability data before method execution
 *
 * Policy obligation example:
 *   { "type": "injectTimestamp" }
 */
@Injectable()
@SaplConstraintHandler('methodInvocation')
export class InjectTimestampHandler
  implements MethodInvocationConstraintHandlerProvider
{
  private readonly logger = new Logger(InjectTimestampHandler.name);

  isResponsible(constraint: any): boolean {
    return constraint?.type === 'injectTimestamp';
  }

  getHandler(_constraint: any): (request: any) => void {
    return (request: any) => {
      const timestamp = new Date().toISOString();
      request.policyTimestamp = timestamp;
      this.logger.log(`[METHOD] Injected policy timestamp: ${timestamp}`);
    };
  }
}
