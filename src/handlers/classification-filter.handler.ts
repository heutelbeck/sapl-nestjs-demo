import { Injectable, Logger } from '@nestjs/common';
import {
  FilterPredicateConstraintHandlerProvider,
  SaplConstraintHandler,
} from '@sapl/nestjs';

const CLASSIFICATION_LEVELS: Record<string, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  SECRET: 3,
};

/**
 * Demonstrates: FilterPredicateConstraintHandlerProvider
 *
 * Handles obligations/advice of type "filterByClassification".
 * When the controller returns an array, this handler filters out
 * elements whose classification level exceeds the allowed maximum.
 *
 * Each element is expected to have a "classification" field.
 * Elements without a classification are excluded (fail-closed).
 *
 * Policy obligation example:
 *   { "type": "filterByClassification", "maxLevel": "INTERNAL" }
 */
@Injectable()
@SaplConstraintHandler('filterPredicate')
export class ClassificationFilterHandler implements FilterPredicateConstraintHandlerProvider {
  private readonly logger = new Logger(ClassificationFilterHandler.name);

  isResponsible(constraint: any): boolean {
    return constraint?.type === 'filterByClassification';
  }

  getHandler(constraint: any): (element: any) => boolean {
    const maxLevel = constraint.maxLevel ?? 'PUBLIC';
    const maxRank = CLASSIFICATION_LEVELS[maxLevel] ?? 0;
    return (element: any) => {
      const elementLevel = element?.classification;
      const elementRank = CLASSIFICATION_LEVELS[elementLevel];
      if (elementRank === undefined) {
        this.logger.warn(
          `[FILTER] Element excluded: unknown classification '${elementLevel}'`,
        );
        return false;
      }
      const allowed = elementRank <= maxRank;
      if (!allowed) {
        this.logger.log(
          `[FILTER] Excluded ${elementLevel} element (max: ${maxLevel})`,
        );
      }
      return allowed;
    };
  }
}
