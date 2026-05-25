import { Injectable, Logger } from '@nestjs/common';
import { ConstraintHandlerProvider, SaplConstraintHandler, ScopedHandler } from '@sapl/nestjs';

const CLASSIFICATION_LEVELS: Record<string, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  SECRET: 3,
};

/**
 * Demonstrates: an output-signal mapper that filters array contents.
 *
 * Handles obligations/advice of type "filterByClassification". When
 * the controller returns an array, this handler filters out elements
 * whose classification level exceeds the allowed maximum. When the
 * controller returns a non-array, it is passed through unchanged.
 *
 * Each element is expected to have a "classification" field.
 * Elements without a known classification are excluded (fail-closed).
 *
 * Policy obligation example:
 *   { "type": "filterByClassification", "maxLevel": "INTERNAL" }
 */
@Injectable()
@SaplConstraintHandler('provider')
export class ClassificationFilterHandler implements ConstraintHandlerProvider {
  private readonly logger = new Logger(ClassificationFilterHandler.name);

  getHandlers(constraint: unknown): ReadonlyArray<ScopedHandler> {
    if ((constraint as { type?: unknown })?.type !== 'filterByClassification') return [];
    const maxLevel = (constraint as { maxLevel?: string }).maxLevel ?? 'PUBLIC';
    const maxRank = CLASSIFICATION_LEVELS[maxLevel] ?? 0;
    const isAdmissible = (element: { classification?: string }): boolean => {
      const elementLevel = element?.classification;
      const elementRank = elementLevel !== undefined ? CLASSIFICATION_LEVELS[elementLevel] : undefined;
      if (elementRank === undefined) {
        this.logger.warn(`[FILTER] Element excluded: unknown classification '${elementLevel}'`);
        return false;
      }
      const allowed = elementRank <= maxRank;
      if (!allowed) {
        this.logger.log(`[FILTER] Excluded ${elementLevel} element (max: ${maxLevel})`);
      }
      return allowed;
    };
    return [
      {
        signal: 'output',
        priority: 0,
        shape: 'mapper',
        handler: (value) => {
          if (Array.isArray(value)) {
            return value.filter(isAdmissible);
          }
          return value;
        },
      },
    ];
  }
}
