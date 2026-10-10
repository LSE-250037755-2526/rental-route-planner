import { calculateRouteRisk } from "./calculateRisk";
import { ROUTE_ENGINE_CONFIG } from "./config";
import {
  evaluateTimelineConstraints,
  evaluateTravelDataConstraints,
  type ConstraintEvaluation,
} from "./evaluateConstraints";
import { evaluateTaxiBudget } from "./evaluateTaxiBudget";
import {
  evaluateTaxiValue,
  type TaxiValueRouteEvidence,
} from "./evaluateTaxiValue";
import { extractRouteOptions } from "./extractRouteOptions";
import { normalizeViewingTimeForDay } from "./normalizeWindows";
import { rankRoutes } from "./rankRoutes";
import { enumerateModeSequences } from "./search/enumerateModes";
import { generateDailyOrderCandidatesDfs } from "./search/dfsOrders";
import { simulateTimeline } from "./simulateTimeline";
import type {
  CandidateMetrics,
  Conflict,
  DayPlanSettings,
  DayRouteOptimizationResult,
  Explanation,
  NormalizedProperty,
  NormalizedViewingTime,
  Property,
  PropertyId,
  RouteCandidate,
  RouteOption,
  RouteRisk,
  SimulationResult,
  StructuredParameters,
  TransportMode,
  Violation,
} from "./types";
import {
  validateDayRouteInput,
  type DayRouteInputValidationIssue,
} from "./validateDayRouteInput";
import type { TravelMatrix } from "../travel/types";

export interface OptimizeDayRouteInput {
  readonly settings: DayPlanSettings;
  readonly properties: readonly Property[];
  readonly travelMatrix: TravelMatrix;
}

interface CandidateEvidence {
  readonly id: string;
  readonly propertyOrder: readonly PropertyId[];
  readonly transportModes: readonly TransportMode[];
  readonly orderedProperties: readonly NormalizedProperty[];
  readonly simulation: SimulationResult;
  readonly timelineConstraints: ConstraintEvaluation;
  readonly metrics: CandidateMetrics;
  readonly risk: RouteRisk;
  readonly violations: readonly Violation[];
  readonly conflicts: readonly Conflict[];
}

const EMPTY_OPTIONS: readonly [] = Object.freeze([]);
const EMPTY_VIOLATIONS: readonly [] = Object.freeze([]);
const EMPTY_CONFLICTS: readonly [] = Object.freeze([]);
const EMPTY_EXPLANATIONS: readonly Explanation[] = Object.freeze([]);
const SAME_DAY_OVERFLOW_SUFFIX = "crosses the same-day boundary";

function isSameDayOverflow(error: unknown): boolean {
  return (
    error instanceof RangeError &&
    error.message.endsWith(SAME_DAY_OVERFLOW_SUFFIX)
  );
}

function createFailureResult(
  conflicts: readonly [Conflict, ...Conflict[]],
): DayRouteOptimizationResult {
  return Object.freeze({
    status: "failure",
    options: EMPTY_OPTIONS,
    conflicts,
    consideredCandidateCount: 0,
  });
}

function validationIssueToConflict(
  issue: DayRouteInputValidationIssue,
): Conflict {
  const propertyIds: readonly PropertyId[] = Object.freeze(
    issue.scope === "property" && issue.propertyId !== undefined
      ? [issue.propertyId]
      : [],
  );
  const mutableParameters: Record<string, string | number> = {
    validationCode: issue.code,
    scope: issue.scope,
  };

  if ("propertyIndex" in issue) {
    mutableParameters.propertyIndex = issue.propertyIndex;
  }

  const parameters: StructuredParameters = Object.freeze({
    ...mutableParameters,
  });

  return Object.freeze({
    kind: "conflict",
    code: "invalid_input",
    propertyIds,
    parameters,
  });
}

function createValidationFailure(
  issues: readonly [
    DayRouteInputValidationIssue,
    ...DayRouteInputValidationIssue[],
  ],
): DayRouteOptimizationResult {
  const conflicts = Object.freeze(
    issues.map(validationIssueToConflict),
  ) as readonly [Conflict, ...Conflict[]];

  return createFailureResult(conflicts);
}

function freezeNormalizedViewingTime(
  viewingTime: NormalizedViewingTime,
): NormalizedViewingTime {
  if (viewingTime.window === null) {
    return Object.freeze({ ...viewingTime });
  }

  return Object.freeze({
    ...viewingTime,
    window: Object.freeze({ ...viewingTime.window }),
  });
}

function normalizeProperties(
  settings: DayPlanSettings,
  properties: readonly Property[],
): readonly NormalizedProperty[] {
  const normalizedProperties = properties.map((property) => {
    const durationMinutes =
      property.durationMinutes ??
      ROUTE_ENGINE_CONFIG.defaults.viewingDurationMinutes;
    const result = normalizeViewingTimeForDay({
      viewingTime: property.viewingTime,
      targetDate: settings.date,
      dayEarliestStart: settings.earliestStart,
      dayLatestEnd: settings.latestEnd,
      durationMinutes,
    });

    if (result.status === "not_eligible") {
      throw new RangeError(
        `Validated property ${property.id} is not eligible for ${settings.date}`,
      );
    }

    if (property.locationId === undefined) {
      throw new RangeError(
        `Validated property ${property.id} has no locationId`,
      );
    }

    const normalizedProperty: NormalizedProperty = Object.freeze({
      id: property.id,
      address: property.address,
      displayName: property.displayName ?? property.address,
      locationId: property.locationId,
      viewingTime: freezeNormalizedViewingTime(
        result.normalizedViewingTime,
      ),
      importance: property.importance,
      durationMinutes,
      ...(property.agentName === undefined
        ? {}
        : { agentName: property.agentName }),
      status: property.status,
    });

    return normalizedProperty;
  });

  return Object.freeze(normalizedProperties);
}

function mergeHardEvidence(
  timeline: ConstraintEvaluation,
  travelData: ConstraintEvaluation,
  taxiBudget: ConstraintEvaluation,
): Readonly<{
  hardViolationCount: number;
  violations: readonly Violation[];
  conflicts: readonly Conflict[];
}> {
  return Object.freeze({
    hardViolationCount:
      timeline.hardViolationCount +
      travelData.hardViolationCount +
      taxiBudget.hardViolationCount,
    violations: Object.freeze([
      ...timeline.violations,
      ...travelData.violations,
      ...taxiBudget.violations,
    ]),
    conflicts: Object.freeze([
      ...timeline.conflicts,
      ...travelData.conflicts,
      ...taxiBudget.conflicts,
    ]),
  });
}

function createRouteCandidate(
  evidence: CandidateEvidence,
  explanations: readonly Explanation[],
): RouteCandidate {
  const base = {
    id: evidence.id,
    propertyOrder: evidence.propertyOrder,
    transportModes: evidence.transportModes,
    simulation: evidence.simulation,
    metrics: evidence.metrics,
    risk: evidence.risk,
    explanations,
  } as const;

  if (evidence.metrics.hardViolationCount === 0) {
    if (
      evidence.violations.length !== 0 ||
      evidence.conflicts.length !== 0
    ) {
      throw new RangeError(
        "Zero hardViolationCount requires empty hard evidence",
      );
    }

    return Object.freeze({
      ...base,
      status: "feasible",
      violations: EMPTY_VIOLATIONS,
      conflicts: EMPTY_CONFLICTS,
    });
  }

  if (
    evidence.violations.length === 0 ||
    evidence.conflicts.length === 0
  ) {
    throw new RangeError(
      "Positive hardViolationCount requires violations and conflicts",
    );
  }

  return Object.freeze({
    ...base,
    status: "conflicted",
    violations: evidence.violations,
    conflicts: evidence.conflicts as readonly [Conflict, ...Conflict[]],
  });
}

function createCandidateEvidence(
  input: Readonly<{
    settings: DayPlanSettings;
    assignedProperties: readonly NormalizedProperty[];
    orderedProperties: readonly NormalizedProperty[];
    propertyOrder: readonly PropertyId[];
    transportModes: readonly TransportMode[];
    travelMatrix: TravelMatrix;
    simulation: SimulationResult;
  }>,
): CandidateEvidence {
  const timelineConstraints = evaluateTimelineConstraints({
    settings: input.settings,
    assignedProperties: input.assignedProperties,
    orderedProperties: input.orderedProperties,
    simulation: input.simulation,
  });
  const travelDataConstraints = evaluateTravelDataConstraints({
    settings: input.settings,
    orderedProperties: input.orderedProperties,
    transportModes: input.transportModes,
    travelMatrix: input.travelMatrix,
  });
  const taxiBudgetConstraints = evaluateTaxiBudget({
    taxiBudget: input.settings.taxiBudget,
    simulation: input.simulation,
  });
  const hardEvidence = mergeHardEvidence(
    timelineConstraints,
    travelDataConstraints,
    taxiBudgetConstraints,
  );
  const risk = calculateRouteRisk({
    orderedProperties: input.orderedProperties,
    simulation: input.simulation,
    travelMatrix: input.travelMatrix,
  });
  const metrics: CandidateMetrics = Object.freeze({
    hardViolationCount: hardEvidence.hardViolationCount,
    riskPenalty: risk.score,
    experiencePenalty: 0,
  });

  return Object.freeze({
    id: JSON.stringify([input.propertyOrder, input.transportModes]),
    propertyOrder: input.propertyOrder,
    transportModes: input.transportModes,
    orderedProperties: input.orderedProperties,
    simulation: input.simulation,
    timelineConstraints,
    metrics,
    risk,
    violations: hardEvidence.violations,
    conflicts: hardEvidence.conflicts,
  });
}

function asTaxiValueEvidence(
  evidence: CandidateEvidence,
): TaxiValueRouteEvidence {
  return Object.freeze({
    orderedProperties: evidence.orderedProperties,
    simulation: evidence.simulation,
    constraints: evidence.timelineConstraints,
  });
}

function createTransitCounterfactual(
  input: Readonly<{
    settings: DayPlanSettings;
    assignedProperties: readonly NormalizedProperty[];
    candidate: CandidateEvidence;
    travelMatrix: TravelMatrix;
  }>,
): TaxiValueRouteEvidence | undefined {
  const substitutedModes = Object.freeze(
    input.candidate.transportModes.map((mode) =>
      mode === "taxi" ? "transit" : mode,
    ),
  );

  for (
    let index = 0;
    index < input.candidate.orderedProperties.length;
    index += 1
  ) {
    if (input.candidate.transportModes[index] !== "taxi") {
      continue;
    }

    const property = input.candidate.orderedProperties[index];
    const fromLocationId =
      index === 0
        ? input.settings.originLocationId
        : input.candidate.orderedProperties[index - 1].locationId;
    const edge =
      input.travelMatrix.edgesByFrom[fromLocationId]?.[
        property.locationId
      ];

    if (edge === undefined || edge.transit.status === "unavailable") {
      return undefined;
    }
  }

  let simulation: SimulationResult;

  try {
    simulation = simulateTimeline({
      settings: input.settings,
      orderedProperties: input.candidate.orderedProperties,
      transportModes: substitutedModes,
      travelMatrix: input.travelMatrix,
    });
  } catch (error: unknown) {
    if (isSameDayOverflow(error)) {
      return undefined;
    }

    throw error;
  }

  const constraints = evaluateTimelineConstraints({
    settings: input.settings,
    assignedProperties: input.assignedProperties,
    orderedProperties: input.candidate.orderedProperties,
    simulation,
  });

  return Object.freeze({
    orderedProperties: input.candidate.orderedProperties,
    simulation,
    constraints,
  });
}

function createEngineFailureConflict(
  code: "end_time_exceeded" | "travel_data_unavailable",
  reason: "same_day_overflow" | "no_legal_mode_sequence",
): Conflict {
  return Object.freeze({
    kind: "conflict",
    code,
    propertyIds: Object.freeze([]),
    parameters: Object.freeze({ reason }),
  });
}

function createZeroCandidateFailure(
  hadSameDayOverflow: boolean,
  attemptedLegalSequence: boolean,
): DayRouteOptimizationResult {
  const conflict =
    hadSameDayOverflow && attemptedLegalSequence
      ? createEngineFailureConflict(
          "end_time_exceeded",
          "same_day_overflow",
        )
      : createEngineFailureConflict(
          "travel_data_unavailable",
          "no_legal_mode_sequence",
        );

  return createFailureResult(Object.freeze([conflict]));
}

function findRecommendedOption(
  options: readonly RouteOption[],
): RouteOption {
  const recommended = options.find((option) =>
    option.objectiveLabels.includes("recommended"),
  );

  if (recommended === undefined) {
    throw new RangeError("CE-15 options must contain Recommended");
  }

  return recommended;
}

export function optimizeDayRoute(
  input: OptimizeDayRouteInput,
): DayRouteOptimizationResult {
  const validation = validateDayRouteInput({
    settings: input.settings,
    properties: input.properties,
  });

  if (!validation.valid) {
    return createValidationFailure(validation.issues);
  }

  const normalizedProperties = normalizeProperties(
    input.settings,
    input.properties,
  );
  const propertiesById = new Map(
    normalizedProperties.map((property) => [property.id, property]),
  );
  const propertyOrders = generateDailyOrderCandidatesDfs({
    properties: normalizedProperties,
  });
  const candidateEvidence: CandidateEvidence[] = [];
  let attemptedLegalSequence = false;
  let hadSameDayOverflow = false;

  for (const propertyOrder of propertyOrders) {
    const orderedProperties = Object.freeze(
      propertyOrder.map((propertyId) => {
        const property = propertiesById.get(propertyId);

        if (property === undefined) {
          throw new RangeError(
            `Unknown PropertyId in CE-09 order: ${propertyId}`,
          );
        }

        return property;
      }),
    );
    const modeSequences = enumerateModeSequences({
      transportStrategy: input.settings.transportStrategy,
      originLocationId: input.settings.originLocationId,
      orderedProperties,
      travelMatrix: input.travelMatrix,
    });

    for (const transportModes of modeSequences) {
      attemptedLegalSequence = true;
      let simulation: SimulationResult;

      try {
        simulation = simulateTimeline({
          settings: input.settings,
          orderedProperties,
          transportModes,
          travelMatrix: input.travelMatrix,
        });
      } catch (error: unknown) {
        if (isSameDayOverflow(error)) {
          hadSameDayOverflow = true;
          continue;
        }

        throw error;
      }

      candidateEvidence.push(
        createCandidateEvidence({
          settings: input.settings,
          assignedProperties: normalizedProperties,
          orderedProperties,
          propertyOrder,
          transportModes,
          travelMatrix: input.travelMatrix,
          simulation,
        }),
      );
    }
  }

  if (candidateEvidence.length === 0) {
    return createZeroCandidateFailure(
      hadSameDayOverflow,
      attemptedLegalSequence,
    );
  }

  const preliminaryCandidates = Object.freeze(
    candidateEvidence.map((evidence) =>
      createRouteCandidate(evidence, EMPTY_EXPLANATIONS),
    ),
  );
  const evidenceByPreliminaryCandidate = new Map<RouteCandidate, CandidateEvidence>(
    preliminaryCandidates.map((candidate, index) => [
      candidate,
      candidateEvidence[index],
    ]),
  );
  const preliminaryRankedCandidates = rankRoutes(preliminaryCandidates);
  const allTransitReferenceCandidate = preliminaryRankedCandidates.find(
    (candidate) => !candidate.transportModes.includes("taxi"),
  );
  const allTransitReferenceEvidence =
    allTransitReferenceCandidate === undefined
      ? undefined
      : evidenceByPreliminaryCandidate.get(allTransitReferenceCandidate);

  if (
    allTransitReferenceCandidate !== undefined &&
    allTransitReferenceEvidence === undefined
  ) {
    throw new RangeError("Missing evidence for preliminary reference candidate");
  }

  const finalCandidates = Object.freeze(
    preliminaryCandidates.map((preliminaryCandidate) => {
      const evidence = evidenceByPreliminaryCandidate.get(
        preliminaryCandidate,
      );

      if (evidence === undefined) {
        throw new RangeError("Missing evidence for preliminary candidate");
      }

      if (!evidence.transportModes.includes("taxi")) {
        return createRouteCandidate(evidence, EMPTY_EXPLANATIONS);
      }

      const referenceEvidence = allTransitReferenceEvidence ?? evidence;
      const candidateTransitCounterfactual = createTransitCounterfactual({
        settings: input.settings,
        assignedProperties: normalizedProperties,
        candidate: evidence,
        travelMatrix: input.travelMatrix,
      });
      const explanations = evaluateTaxiValue({
        reference: asTaxiValueEvidence(referenceEvidence),
        candidate: asTaxiValueEvidence(evidence),
        ...(candidateTransitCounterfactual === undefined
          ? {}
          : { candidateTransitCounterfactual }),
        travelMatrix: input.travelMatrix,
      });

      return createRouteCandidate(evidence, explanations);
    }),
  );
  const rankedCandidates = rankRoutes(finalCandidates);
  const options = extractRouteOptions(rankedCandidates);
  const consideredCandidateCount = finalCandidates.length;

  if (options.length === 0) {
    throw new RangeError(
      "A non-empty final candidate set must produce CE-15 options",
    );
  }

  const nonEmptyOptions = options as readonly [
    RouteOption,
    ...RouteOption[],
  ];
  const recommended = findRecommendedOption(nonEmptyOptions);

  if (recommended.status === "feasible") {
    return Object.freeze({
      status: "success",
      options: nonEmptyOptions,
      conflicts: EMPTY_CONFLICTS,
      consideredCandidateCount,
    });
  }

  return Object.freeze({
    status: "partial",
    options: nonEmptyOptions,
    conflicts: recommended.conflicts,
    consideredCandidateCount,
  });
}
