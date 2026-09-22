import type { RouteCandidate } from "./types";

interface RankingValues {
  readonly hardViolationCount: number;
  readonly mustCompletedCount: number;
  readonly completedCount: number;
  readonly riskPenalty: number;
  readonly totalTravelMinutes: number;
  readonly taxiCost: number;
  readonly experiencePenalty: number;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
}

function assertNonNegativeFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
}

function readRankingValues(candidate: RouteCandidate): RankingValues {
  const values: RankingValues = {
    hardViolationCount: candidate.metrics.hardViolationCount,
    mustCompletedCount: candidate.simulation.totals.mustCompletedCount,
    completedCount: candidate.simulation.totals.completedCount,
    riskPenalty: candidate.metrics.riskPenalty,
    totalTravelMinutes: candidate.simulation.totals.totalTravelMinutes,
    taxiCost: candidate.simulation.totals.taxiCost,
    experiencePenalty: candidate.metrics.experiencePenalty,
  };

  assertNonNegativeInteger(
    values.hardViolationCount,
    "hardViolationCount",
  );
  assertNonNegativeInteger(
    values.mustCompletedCount,
    "mustCompletedCount",
  );
  assertNonNegativeInteger(values.completedCount, "completedCount");
  assertNonNegativeFiniteNumber(values.riskPenalty, "riskPenalty");
  assertNonNegativeFiniteNumber(
    values.totalTravelMinutes,
    "totalTravelMinutes",
  );
  assertNonNegativeFiniteNumber(values.taxiCost, "taxiCost");
  assertNonNegativeFiniteNumber(
    values.experiencePenalty,
    "experiencePenalty",
  );

  return values;
}

function compareAscending(left: number, right: number): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function compareDescending(left: number, right: number): number {
  return compareAscending(right, left);
}

export function compareRouteCandidates(
  left: RouteCandidate,
  right: RouteCandidate,
): number {
  const leftValues = readRankingValues(left);
  const rightValues = readRankingValues(right);

  const hardViolationComparison = compareAscending(
    leftValues.hardViolationCount,
    rightValues.hardViolationCount,
  );

  if (hardViolationComparison !== 0) {
    return hardViolationComparison;
  }

  const mustCompletionComparison = compareDescending(
    leftValues.mustCompletedCount,
    rightValues.mustCompletedCount,
  );

  if (mustCompletionComparison !== 0) {
    return mustCompletionComparison;
  }

  const completionComparison = compareDescending(
    leftValues.completedCount,
    rightValues.completedCount,
  );

  if (completionComparison !== 0) {
    return completionComparison;
  }

  const riskComparison = compareAscending(
    leftValues.riskPenalty,
    rightValues.riskPenalty,
  );

  if (riskComparison !== 0) {
    return riskComparison;
  }

  const travelComparison = compareAscending(
    leftValues.totalTravelMinutes,
    rightValues.totalTravelMinutes,
  );

  if (travelComparison !== 0) {
    return travelComparison;
  }

  const taxiCostComparison = compareAscending(
    leftValues.taxiCost,
    rightValues.taxiCost,
  );

  if (taxiCostComparison !== 0) {
    return taxiCostComparison;
  }

  return compareAscending(
    leftValues.experiencePenalty,
    rightValues.experiencePenalty,
  );
}

export function rankRoutes(
  candidates: readonly RouteCandidate[],
): readonly RouteCandidate[] {
  for (const candidate of candidates) {
    readRankingValues(candidate);
  }

  const ranked = candidates
    .map((candidate, inputIndex) => ({ candidate, inputIndex }))
    .sort((left, right) => {
      const hierarchyComparison = compareRouteCandidates(
        left.candidate,
        right.candidate,
      );

      return hierarchyComparison !== 0
        ? hierarchyComparison
        : left.inputIndex - right.inputIndex;
    })
    .map(({ candidate }) => candidate);

  return Object.freeze(ranked);
}
