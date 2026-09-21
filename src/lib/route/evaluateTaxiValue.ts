import { ROUTE_ENGINE_CONFIG } from "./config";
import type { ConstraintEvaluation } from "./evaluateConstraints";
import type {
  Explanation,
  NormalizedProperty,
  PropertyId,
  SimulationResult,
  StructuredParameters,
} from "./types";
import type { TravelMatrix } from "../travel/types";

export interface TaxiValueRouteEvidence {
  readonly orderedProperties: readonly NormalizedProperty[];
  readonly simulation: SimulationResult;
  readonly constraints: ConstraintEvaluation;
}

export interface EvaluateTaxiValueInput {
  readonly reference: TaxiValueRouteEvidence;
  readonly candidate: TaxiValueRouteEvidence;
  readonly candidateTransitCounterfactual?: TaxiValueRouteEvidence;
  readonly travelMatrix: TravelMatrix;
}

interface LatenessEvidence {
  readonly lateIssuesAvoided: number;
  readonly maximumLateByMinutesAvoided: number;
}

function validateAlignment(
  evidence: TaxiValueRouteEvidence,
  label: string,
): void {
  if (evidence.simulation.stops.length !== evidence.orderedProperties.length) {
    throw new RangeError(
      `${label} simulation stop count must equal orderedProperties length`,
    );
  }

  for (let index = 0; index < evidence.orderedProperties.length; index += 1) {
    if (
      evidence.simulation.stops[index].propertyId !==
      evidence.orderedProperties[index].id
    ) {
      throw new RangeError(
        `${label} simulation property order mismatch at index ${index}`,
      );
    }
  }
}

function createLegExplanation(
  code: "avoid_late" | "transit_detour",
  fromLocationId: string,
  toLocationId: string,
  parameters: StructuredParameters,
): Explanation {
  return Object.freeze({
    scope: "leg",
    code,
    fromLocationId,
    toLocationId,
    parameters: Object.freeze({ ...parameters }),
  });
}

function validateCandidateTransitCounterfactual(
  candidate: TaxiValueRouteEvidence,
  counterfactual: TaxiValueRouteEvidence,
): void {
  validateAlignment(counterfactual, "Candidate transit counterfactual");

  if (
    counterfactual.orderedProperties.length !==
    candidate.orderedProperties.length
  ) {
    throw new RangeError(
      "Candidate transit counterfactual property order length must match candidate",
    );
  }

  for (let index = 0; index < candidate.orderedProperties.length; index += 1) {
    const candidateProperty = candidate.orderedProperties[index];
    const counterfactualProperty = counterfactual.orderedProperties[index];
    const candidateStop = candidate.simulation.stops[index];
    const counterfactualStop = counterfactual.simulation.stops[index];

    if (counterfactualProperty.id !== candidateProperty.id) {
      throw new RangeError(
        `Candidate transit counterfactual property order mismatch at index ${index}`,
      );
    }

    if (
      counterfactualStop.travelFromLocationId !==
      candidateStop.travelFromLocationId
    ) {
      throw new RangeError(
        `Candidate transit counterfactual leg origin mismatch at index ${index}`,
      );
    }

    const expectedMode =
      candidateStop.travelMode === "taxi"
        ? "transit"
        : candidateStop.travelMode;

    if (counterfactualStop.travelMode !== expectedMode) {
      throw new RangeError(
        `Candidate transit counterfactual mode mismatch at index ${index}`,
      );
    }
  }
}

function createRouteExplanation(
  parameters: StructuredParameters,
): Explanation {
  return Object.freeze({
    scope: "route",
    code: "unlock_extra_viewing",
    parameters: Object.freeze({ ...parameters }),
  });
}

function readPositiveLateByMinutes(
  parameters: StructuredParameters,
): number {
  const value = parameters.lateByMinutes;

  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function collectDownstreamLateness(
  constraints: ConstraintEvaluation,
  downstreamPropertyIds: ReadonlySet<PropertyId>,
): LatenessEvidence {
  let lateIssuesAvoided = 0;
  let maximumLateByMinutesAvoided = 0;

  for (const conflict of constraints.conflicts) {
    if (
      !conflict.propertyIds.some((propertyId) =>
        downstreamPropertyIds.has(propertyId),
      )
    ) {
      continue;
    }

    if (conflict.code === "time_window_conflict") {
      lateIssuesAvoided += 1;
      maximumLateByMinutesAvoided = Math.max(
        maximumLateByMinutesAvoided,
        readPositiveLateByMinutes(conflict.parameters),
      );
      continue;
    }

    if (conflict.code === "appointment_conflict") {
      const lateByMinutes = readPositiveLateByMinutes(conflict.parameters);

      if (lateByMinutes > 0) {
        lateIssuesAvoided += 1;
        maximumLateByMinutesAvoided = Math.max(
          maximumLateByMinutesAvoided,
          lateByMinutes,
        );
      }
    }
  }

  return Object.freeze({
    lateIssuesAvoided,
    maximumLateByMinutesAvoided,
  });
}

function containsMustVisitConflict(
  constraints: ConstraintEvaluation,
): boolean {
  return (
    constraints.conflicts.some(
      (conflict) => conflict.code === "must_visit_unscheduled",
    ) ||
    constraints.violations.some(
      (violation) => violation.code === "must_visit_unscheduled",
    )
  );
}

function containsRelevantTimingIssue(
  constraints: ConstraintEvaluation,
): boolean {
  const isRelevantTimingCode = (code: string): boolean =>
    code === "appointment_conflict" ||
    code === "time_window_conflict" ||
    code === "end_time_exceeded";

  return (
    constraints.conflicts.some((conflict) =>
      isRelevantTimingCode(conflict.code),
    ) ||
    constraints.violations.some((violation) =>
      isRelevantTimingCode(violation.code),
    )
  );
}

export function evaluateTaxiValue(
  input: EvaluateTaxiValueInput,
): readonly Explanation[] {
  validateAlignment(input.reference, "Reference");
  validateAlignment(input.candidate, "Candidate");

  if (input.candidateTransitCounterfactual !== undefined) {
    validateCandidateTransitCounterfactual(
      input.candidate,
      input.candidateTransitCounterfactual,
    );
  }

  const explanations: Explanation[] = [];
  let hasTaxiLegWithTransitCounterfactual = false;
  let aggregateTaxiTravelMinutesSaved = 0;

  for (
    let index = 0;
    index < input.candidate.orderedProperties.length;
    index += 1
  ) {
    const candidateStop = input.candidate.simulation.stops[index];

    if (candidateStop.travelMode !== "taxi") {
      continue;
    }

    const candidateProperty = input.candidate.orderedProperties[index];
    const fromLocationId = candidateStop.travelFromLocationId;
    const toLocationId = candidateProperty.locationId;
    const edge =
      input.travelMatrix.edgesByFrom[fromLocationId]?.[toLocationId];

    if (edge === undefined) {
      throw new RangeError(
        `Missing directed travel edge from ${fromLocationId} to ${toLocationId}`,
      );
    }

    if (edge.taxi.status === "unavailable") {
      throw new RangeError(
        `Taxi data is unavailable from ${fromLocationId} to ${toLocationId}`,
      );
    }

    if (edge.transit.status === "unavailable") {
      continue;
    }

    hasTaxiLegWithTransitCounterfactual = true;

    const transitMinutes = edge.transit.durationMinutes;
    const taxiMinutes = edge.taxi.durationMinutes;
    const minutesSaved = transitMinutes - taxiMinutes;

    aggregateTaxiTravelMinutesSaved += minutesSaved;

    const referenceStop = input.reference.simulation.stops[index];
    const referenceProperty = input.reference.orderedProperties[index];
    const isSamePositionTransitReference =
      referenceStop !== undefined &&
      referenceProperty !== undefined &&
      referenceStop.propertyId === candidateProperty.id &&
      referenceProperty.id === candidateProperty.id &&
      referenceStop.travelFromLocationId === fromLocationId &&
      referenceStop.travelMode === "transit";

    if (
      isSamePositionTransitReference &&
      input.candidate.constraints.hardViolationCount === 0
    ) {
      const downstreamPropertyIds = new Set(
        input.reference.orderedProperties
          .slice(index)
          .map((property) => property.id),
      );
      const lateness = collectDownstreamLateness(
        input.reference.constraints,
        downstreamPropertyIds,
      );

      if (lateness.lateIssuesAvoided > 0) {
        explanations.push(
          createLegExplanation(
            "avoid_late",
            fromLocationId,
            toLocationId,
            {
              taxiCost: candidateStop.travelCost,
              minutesSaved,
              lateIssuesAvoided: lateness.lateIssuesAvoided,
              maximumLateByMinutesAvoided:
                lateness.maximumLateByMinutesAvoided,
            },
          ),
        );
      }
    }

    const taxiConfig = ROUTE_ENGINE_CONFIG.taxiRecommendation;
    const timeThresholdQualifies =
      minutesSaved >= taxiConfig.meaningfulTimeSavingMinutes &&
      transitMinutes >=
        taxiMinutes * taxiConfig.minimumTransitToTaxiDurationRatio;
    const transferThresholdQualifies =
      edge.transit.transferCount >=
      ROUTE_ENGINE_CONFIG.transitRisk.transferCountThreshold;

    if (timeThresholdQualifies || transferThresholdQualifies) {
      explanations.push(
        createLegExplanation(
          "transit_detour",
          fromLocationId,
          toLocationId,
          {
            taxiCost: candidateStop.travelCost,
            minutesSaved,
            transitMinutes,
            taxiMinutes,
            transferCount: edge.transit.transferCount,
            detourBasis: timeThresholdQualifies
              ? "time_threshold"
              : "multiple_transfers",
          },
        ),
      );
    }
  }

  const completedCountGain =
    input.candidate.simulation.totals.completedCount -
    input.reference.simulation.totals.completedCount;
  const mustCompletedCountGain =
    input.candidate.simulation.totals.mustCompletedCount -
    input.reference.simulation.totals.mustCompletedCount;
  const candidateIsFullyFeasible =
    input.candidate.constraints.hardViolationCount === 0;
  const counterfactualProvesTimingInfeasibility =
    input.candidateTransitCounterfactual !== undefined &&
    input.candidateTransitCounterfactual.constraints.hardViolationCount > 0 &&
    containsRelevantTimingIssue(
      input.candidateTransitCounterfactual.constraints,
    );
  const extraViewingUnlocked =
    candidateIsFullyFeasible &&
    counterfactualProvesTimingInfeasibility &&
    input.reference.constraints.hardViolationCount === 0 &&
    completedCountGain > 0;
  const mustVisitRestored =
    candidateIsFullyFeasible &&
    counterfactualProvesTimingInfeasibility &&
    mustCompletedCountGain > 0 &&
    containsMustVisitConflict(input.reference.constraints);

  if (
    hasTaxiLegWithTransitCounterfactual &&
    (extraViewingUnlocked || mustVisitRestored)
  ) {
    explanations.push(
      createRouteExplanation({
        taxiCost: input.candidate.simulation.totals.taxiCost,
        minutesSaved: aggregateTaxiTravelMinutesSaved,
        completedCountGain,
        mustCompletedCountGain,
        taxiLegCount: input.candidate.simulation.totals.taxiLegCount,
      }),
    );
  }

  return Object.freeze(explanations);
}
