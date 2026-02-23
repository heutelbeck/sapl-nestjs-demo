import { Injectable, Logger } from '@nestjs/common';
import {
  MethodInvocationConstraintHandlerProvider,
  MethodInvocationContext,
  SaplConstraintHandler,
} from '@sapl/nestjs';

/**
 * Demonstrates: argument manipulation via MethodInvocationContext
 *
 * Handles obligations of type "capTransferAmount".
 * Caps the numeric method argument at the policy-specified maximum.
 * If the requested amount exceeds the limit, the argument is replaced
 * with the maximum -- the service method never sees the original value.
 *
 * Policy obligation example:
 *   { "type": "capTransferAmount", "maxAmount": 5000, "argIndex": 0 }
 */
@Injectable()
@SaplConstraintHandler('methodInvocation')
export class CapTransferHandler
  implements MethodInvocationConstraintHandlerProvider
{
  private readonly logger = new Logger(CapTransferHandler.name);

  isResponsible(constraint: any): boolean {
    return constraint?.type === 'capTransferAmount';
  }

  getHandler(constraint: any): (context: MethodInvocationContext) => void {
    const maxAmount = constraint.maxAmount;
    const argIndex = constraint.argIndex ?? 0;
    return (context) => {
      const requested = Number(context.args[argIndex]);
      if (requested > maxAmount) {
        context.args[argIndex] = maxAmount;
        this.logger.log(`[CAP] ${context.className}.${context.methodName} args[${argIndex}]: ${requested} -> ${maxAmount} (limit: ${maxAmount})`);
      }
    };
  }
}
