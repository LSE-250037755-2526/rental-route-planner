import type { NormalizedProperty, PropertyId } from "../types";

export type DailyPropertyOrder = readonly PropertyId[];

export interface OrderSearchPrefixContext {
  readonly prefixPropertyIds: readonly PropertyId[];
  readonly remainingPropertyIds: readonly PropertyId[];
}

export type CanExploreOrderPrefix = (
  context: OrderSearchPrefixContext,
) => boolean;

export interface GenerateDailyOrderCandidatesInput {
  readonly properties: readonly NormalizedProperty[];
  readonly canExplorePrefix?: CanExploreOrderPrefix;
}

export interface DailyOrderSearchStrategy {
  readonly generate: (
    input: GenerateDailyOrderCandidatesInput,
  ) => readonly DailyPropertyOrder[];
}
