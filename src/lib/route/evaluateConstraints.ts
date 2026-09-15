import type {
  Conflict,
  ConflictCode,
  DayPlanSettings,
  NormalizedProperty,
  PropertyId,
  SimulationResult,
  StructuredParameters,
  TransportMode,
  Violation,
} from "./types";
import type { TravelMatrix } from "../travel/types";

export interface ConstraintEvaluation {
  readonly hardViolationCount: number;
  readonly violations: readonly Violation[];
  readonly conflicts: readonly Conflict[];
}

export interface EvaluateTravelDataConstraintsInput {
  readonly settings: DayPlanSettings;
  readonly orderedProperties: readonly NormalizedProperty[];
  readonly transportModes: readonly TransportMode[];
  readonly travelMatrix: TravelMatrix;
}

export interface EvaluateTimelineConstraintsInput {
  readonly settings: DayPlanSettings;
  readonly assignedProperties: readonly NormalizedProperty[];
  readonly orderedProperties: readonly NormalizedProperty[];
  readonly simulation: SimulationResult;
}

interface MutableConstraintEvaluation {
  readonly violations: Violation[];
  readonly conflicts: Conflict[];
}

function appendHardIssue(
  evaluation: MutableConstraintEvaluation,
  code: ConflictCode,
  propertyIds: readonly PropertyId[],
  parameters: StructuredParameters,
): void {
  const frozenPropertyIds: readonly PropertyId[] = Object.freeze([
    ...propertyIds,
  ]);
  const frozenParameters: StructuredParameters = Object.freeze({
    ...parameters,
  });

  evaluation.violations.push(
    Object.freeze({
      kind: "violation",
      code,
      severity: "error",
      propertyIds: frozenPropertyIds,
      parameters: frozenParameters,
    }),
  );
  evaluation.conflicts.push(
    Object.freeze({
      kind: "conflict",
      code,
      propertyIds: frozenPropertyIds,
      parameters: frozenParameters,
    }),
  );
}

function finishEvaluation(
  evaluation: MutableConstraintEvaluation,
): ConstraintEvaluation {
  const violations: readonly Violation[] = Object.freeze([
    ...evaluation.violations,
  ]);
  const conflicts: readonly Conflict[] = Object.freeze([
    ...evaluation.conflicts,
  ]);

  return Object.freeze({
    hardViolationCount: violations.length,
    violations,
    conflicts,
  });
}

function validateTimelineAlignment(
  input: EvaluateTimelineConstraintsInput,
): void {
  const { orderedProperties, settings, simulation } = input;

  if (simulation.stops.length !== orderedProperties.length) {
    throw new RangeError(
      "Simulation stop count must equal orderedProperties length",
    );
  }

  for (let index = 0; index < orderedProperties.length; index += 1) {
    if (simulation.stops[index].propertyId !== orderedProperties[index].id) {
      throw new RangeError(
        `Simulation property order mismatch at index ${index}`,
      );
    }
  }

  if (simulation.departureAt !== settings.earliestStart) {
    throw new RangeError(
      "Simulation departureAt must equal settings.earliestStart",
    );
  }
}

export function evaluateTravelDataConstraints(
  input: EvaluateTravelDataConstraintsInput,
): ConstraintEvaluation {
  const { settings, orderedProperties, transportModes, travelMatrix } = input;

  if (transportModes.length !== orderedProperties.length) {
    throw new RangeError(
      "transportModes length must equal orderedProperties length",
    );
  }

  const evaluation: MutableConstraintEvaluation = {
    violations: [],
    conflicts: [],
  };

  for (let index = 0; index < orderedProperties.length; index += 1) {
    const property = orderedProperties[index];
    const transportMode = transportModes[index];
    const fromLocationId =
      index === 0
        ? settings.originLocationId
        : orderedProperties[index - 1].locationId;
    const toLocationId = property.locationId;
    const edge = travelMatrix.edgesByFrom[fromLocationId]?.[toLocationId];

    if (edge === undefined) {
      appendHardIssue(
        evaluation,
        "travel_data_unavailable",
        [property.id],
        {
          fromLocationId,
          toLocationId,
          transportMode,
          reason: "missing_edge",
        },
      );
      continue;
    }

    if (edge[transportMode].status === "unavailable") {
      appendHardIssue(
        evaluation,
        "travel_data_unavailable",
        [property.id],
        {
          fromLocationId,
          toLocationId,
          transportMode,
          reason:
            edge.failure?.kind === "provider_failure"
              ? "provider_failure"
              : "selected_mode_unavailable",
        },
      );
    }
  }

  return finishEvaluation(evaluation);
}

export function evaluateTimelineConstraints(
  input: EvaluateTimelineConstraintsInput,
): ConstraintEvaluation {
  validateTimelineAlignment(input);

  const { assignedProperties, orderedProperties, settings, simulation } =
    input;
  const evaluation: MutableConstraintEvaluation = {
    violations: [],
    conflicts: [],
  };
  const candidatePropertyIds = new Set(
    orderedProperties.map((property) => property.id),
  );

  for (const property of assignedProperties) {
    if (
      property.importance === "must" &&
      !candidatePropertyIds.has(property.id)
    ) {
      appendHardIssue(
        evaluation,
        "must_visit_unscheduled",
        [property.id],
        { reason: "not_in_candidate" },
      );
    }
  }

  for (let index = 0; index < orderedProperties.length; index += 1) {
    const property = orderedProperties[index];
    const stop = simulation.stops[index];

    if (property.viewingTime.type === "fixed") {
      if (stop.bufferMinutes === null) {
        throw new RangeError(
          `Fixed simulation stop requires bufferMinutes at index ${index}`,
        );
      }

      const fixedStart = property.viewingTime.window.earliestStart;
      const actualBufferMinutes = stop.bufferMinutes;
      const requiredBufferMinutes =
        settings.fixedAppointmentBufferMinutes;
      const lateByMinutes = Math.max(
        0,
        stop.viewingStartAt - fixedStart,
      );
      const bufferShortfallMinutes = Math.max(
        0,
        requiredBufferMinutes - actualBufferMinutes,
      );

      if (lateByMinutes > 0 || bufferShortfallMinutes > 0) {
        appendHardIssue(
          evaluation,
          "appointment_conflict",
          [property.id],
          {
            fixedStart,
            arrivalAt: stop.arrivalAt,
            actualStart: stop.viewingStartAt,
            requiredBufferMinutes,
            actualBufferMinutes,
            lateByMinutes,
            bufferShortfallMinutes,
          },
        );
      }

      continue;
    }

    if (
      property.viewingTime.type === "window" ||
      property.viewingTime.type === "flexible"
    ) {
      const { earliestStart, latestStart } = property.viewingTime.window;

      if (stop.viewingStartAt > latestStart) {
        appendHardIssue(
          evaluation,
          "time_window_conflict",
          [property.id],
          {
            earliestStart,
            latestStart,
            actualStart: stop.viewingStartAt,
            lateByMinutes: stop.viewingStartAt - latestStart,
          },
        );
      }
    }
  }

  const { estimatedEndAt } = simulation.totals;

  if (estimatedEndAt > settings.latestEnd) {
    appendHardIssue(evaluation, "end_time_exceeded", [], {
      latestEnd: settings.latestEnd,
      estimatedEndAt,
      exceededByMinutes: estimatedEndAt - settings.latestEnd,
    });
  }

  return finishEvaluation(evaluation);
}
