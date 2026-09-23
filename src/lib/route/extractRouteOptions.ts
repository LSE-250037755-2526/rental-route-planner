import type {
  RouteCandidate,
  RouteOption,
  RouteOptionLabel,
} from "./types";

interface EligibilityTier {
  readonly hardViolationCount: number;
  readonly mustCompletedCount: number;
  readonly completedCount: number;
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

function assertMinuteOfDay(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 1439) {
    throw new RangeError(`${name} must be an integer from 0 through 1439`);
  }
}

function validateExtractionEvidence(candidate: RouteCandidate): void {
  assertNonNegativeInteger(
    candidate.metrics.hardViolationCount,
    "hardViolationCount",
  );
  assertNonNegativeInteger(
    candidate.simulation.totals.mustCompletedCount,
    "mustCompletedCount",
  );
  assertNonNegativeInteger(
    candidate.simulation.totals.completedCount,
    "completedCount",
  );
  assertNonNegativeFiniteNumber(
    candidate.simulation.totals.taxiCost,
    "taxiCost",
  );
  assertMinuteOfDay(
    candidate.simulation.totals.estimatedEndAt,
    "estimatedEndAt",
  );
  assertNonNegativeFiniteNumber(
    candidate.simulation.totals.totalTravelMinutes,
    "totalTravelMinutes",
  );
}

function routeFingerprint(candidate: RouteCandidate): string {
  return JSON.stringify([
    candidate.propertyOrder,
    candidate.transportModes,
  ]);
}

function deduplicateCandidates(
  rankedCandidates: readonly RouteCandidate[],
): readonly RouteCandidate[] {
  const fingerprints = new Set<string>();
  const uniqueCandidates: RouteCandidate[] = [];

  for (const candidate of rankedCandidates) {
    const fingerprint = routeFingerprint(candidate);

    if (fingerprints.has(fingerprint)) {
      continue;
    }

    fingerprints.add(fingerprint);
    uniqueCandidates.push(candidate);
  }

  return uniqueCandidates;
}

function readEligibilityTier(candidate: RouteCandidate): EligibilityTier {
  return {
    hardViolationCount: candidate.metrics.hardViolationCount,
    mustCompletedCount: candidate.simulation.totals.mustCompletedCount,
    completedCount: candidate.simulation.totals.completedCount,
  };
}

function isInEligibilityTier(
  candidate: RouteCandidate,
  tier: EligibilityTier,
): boolean {
  return (
    candidate.metrics.hardViolationCount === tier.hardViolationCount &&
    candidate.simulation.totals.mustCompletedCount ===
      tier.mustCompletedCount &&
    candidate.simulation.totals.completedCount === tier.completedCount
  );
}

function selectCheapest(
  candidates: readonly RouteCandidate[],
): RouteCandidate {
  let cheapest = candidates[0];

  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];

    if (
      candidate.simulation.totals.taxiCost <
      cheapest.simulation.totals.taxiCost
    ) {
      cheapest = candidate;
    }
  }

  return cheapest;
}

function selectFastest(
  candidates: readonly RouteCandidate[],
): RouteCandidate {
  let fastest = candidates[0];

  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const candidateTotals = candidate.simulation.totals;
    const fastestTotals = fastest.simulation.totals;

    if (
      candidateTotals.estimatedEndAt < fastestTotals.estimatedEndAt ||
      (candidateTotals.estimatedEndAt === fastestTotals.estimatedEndAt &&
        candidateTotals.totalTravelMinutes <
          fastestTotals.totalTravelMinutes)
    ) {
      fastest = candidate;
    }
  }

  return fastest;
}

function createRouteOption(
  candidate: RouteCandidate,
  labels: readonly RouteOptionLabel[],
): RouteOption {
  const objectiveLabels = Object.freeze([...labels]) as readonly [
    RouteOptionLabel,
    ...RouteOptionLabel[],
  ];

  return Object.freeze({
    ...candidate,
    objectiveLabels,
  }) as RouteOption;
}

export function extractRouteOptions(
  rankedCandidates: readonly RouteCandidate[],
): readonly RouteOption[] {
  for (const candidate of rankedCandidates) {
    validateExtractionEvidence(candidate);
  }

  const uniqueCandidates = deduplicateCandidates(rankedCandidates);

  if (uniqueCandidates.length === 0) {
    return Object.freeze([]);
  }

  const recommended = uniqueCandidates[0];
  const selectedLabels = new Map<
    RouteCandidate,
    readonly RouteOptionLabel[]
  >();
  selectedLabels.set(recommended, ["recommended"]);

  const bestFeasible = uniqueCandidates.find(
    (candidate) => candidate.status === "feasible",
  );

  if (bestFeasible !== undefined) {
    const tier = readEligibilityTier(bestFeasible);
    const eligibleCandidates = uniqueCandidates.filter(
      (candidate) =>
        candidate.status === "feasible" &&
        isInEligibilityTier(candidate, tier),
    );
    const cheapest = selectCheapest(eligibleCandidates);
    const fastest = selectFastest(eligibleCandidates);

    for (const [candidate, label] of [
      [cheapest, "cheapest"],
      [fastest, "fastest"],
    ] as const) {
      const labels = selectedLabels.get(candidate) ?? [];
      selectedLabels.set(candidate, [...labels, label]);
    }
  }

  const options = uniqueCandidates.flatMap((candidate) => {
    const labels = selectedLabels.get(candidate);

    return labels === undefined ? [] : [createRouteOption(candidate, labels)];
  });

  return Object.freeze(options);
}
