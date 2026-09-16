import type { NormalizedProperty, PropertyId } from "../types";
import type {
  DailyPropertyOrder,
  GenerateDailyOrderCandidatesInput,
  OrderSearchPrefixContext,
} from "./types";

export function generateDailyOrderCandidatesDfs(
  input: GenerateDailyOrderCandidatesInput,
): readonly DailyPropertyOrder[] {
  const candidates: DailyPropertyOrder[] = [];
  const seenFingerprints = new Set<string>();

  function explore(
    prefixPropertyIds: readonly PropertyId[],
    remainingProperties: readonly NormalizedProperty[],
  ): void {
    for (let index = 0; index < remainingProperties.length; index += 1) {
      const property = remainingProperties[index];
      const nextPrefixPropertyIds = [...prefixPropertyIds, property.id];
      const nextRemainingProperties = [
        ...remainingProperties.slice(0, index),
        ...remainingProperties.slice(index + 1),
      ];

      if (input.canExplorePrefix !== undefined) {
        const context: OrderSearchPrefixContext = Object.freeze({
          prefixPropertyIds: Object.freeze([...nextPrefixPropertyIds]),
          remainingPropertyIds: Object.freeze(
            nextRemainingProperties.map(({ id }) => id),
          ),
        });

        if (!input.canExplorePrefix(context)) {
          continue;
        }
      }

      const containsEveryMustProperty = !nextRemainingProperties.some(
        ({ importance }) => importance === "must",
      );

      if (containsEveryMustProperty) {
        const candidate: DailyPropertyOrder = Object.freeze([
          ...nextPrefixPropertyIds,
        ]);
        const fingerprint = JSON.stringify(candidate);

        if (!seenFingerprints.has(fingerprint)) {
          seenFingerprints.add(fingerprint);
          candidates.push(candidate);
        }
      }

      explore(nextPrefixPropertyIds, nextRemainingProperties);
    }
  }

  explore([], input.properties);

  return Object.freeze(candidates);
}
