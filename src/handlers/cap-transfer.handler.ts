import { Injectable, Logger } from '@nestjs/common';
import { ConstraintHandlerProvider, SaplConstraintHandler, ScopedHandler } from '@sapl/nestjs';

/**
 * Demonstrates: argument transformation via an input-signal mapper.
 *
 * Handles obligations of type "capTransferAmount". Receives the
 * controller method's args and caps the numeric argument at index 0
 * to the policy-specified maximum. If the requested amount exceeds
 * the limit, the returned args array has the argument replaced.
 *
 * Policy obligation example:
 *   { "type": "capTransferAmount", "maxAmount": 5000 }
 */
@Injectable()
@SaplConstraintHandler('provider')
export class CapTransferHandler implements ConstraintHandlerProvider {
  private readonly logger = new Logger(CapTransferHandler.name);

  getHandlers(constraint: unknown): ReadonlyArray<ScopedHandler> {
    if ((constraint as { type?: unknown })?.type !== 'capTransferAmount') return [];
    const maxAmount = (constraint as { maxAmount: number }).maxAmount;
    const amountArgIndex = 0;
    return [
      {
        signal: 'input',
        priority: 0,
        shape: 'mapper',
        handler: (value) => {
          const args = value as unknown[];
          const requested = Number(args[amountArgIndex]);
          if (requested > maxAmount) {
            this.logger.log(`[CAP] args[${amountArgIndex}]: ${requested} -> ${maxAmount}`);
            const capped = [...args];
            capped[amountArgIndex] = maxAmount;
            return capped;
          }
          return args;
        },
      },
    ];
  }
}
