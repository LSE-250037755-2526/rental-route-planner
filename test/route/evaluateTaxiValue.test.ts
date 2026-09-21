import { describe, expect, it } from "vitest";

import { ROUTE_ENGINE_CONFIG } from "../../src/lib/route/config";
import {
  evaluateTimelineConstraints,
  type ConstraintEvaluation,
} from "../../src/lib/route/evaluateConstraints";
import { evaluateTaxiBudget } from "../../src/lib/route/evaluateTaxiBudget";
import {
  evaluateTaxiValue,
  type TaxiValueRouteEvidence,
} from "../../src/lib/route/evaluateTaxiValue";
import { simulateTimeline } from "../../src/lib/route/simulateTimeline";
import type {
  ConflictCode,
  DayPlanSettings,
  NormalizedProperty,
  NormalizedViewingTime,
  StructuredParameters,
  TransportMode,
} from "../../src/lib/route/types";
import type {
  TaxiTravelAlternative,
  TransitTravelAlternative,
  TravelEdge,
  TravelMatrix,
} from "../../src/lib/travel/types";

const EMPTY_ROUTE_PREFERENCES = Object.freeze([]);
const TAXI_RECOMMENDATION = ROUTE_ENGINE_CONFIG.taxiRecommendation;
const RATIO_BOUNDARY_TAXI_MINUTES = 50;
const EXACT_RATIO_BOUNDARY_TRANSIT_MINUTES =
  RATIO_BOUNDARY_TAXI_MINUTES *
  TAXI_RECOMMENDATION.minimumTransitToTaxiDurationRatio;
const CLEAN_CONSTRAINTS: ConstraintEvaluation = Object.freeze({
  hardViolationCount: 0,
  violations: Object.freeze([]),
  conflicts: Object.freeze([]),
});

function createSettings(
  overrides: Partial<DayPlanSettings> = {},
): DayPlanSettings {
  return Object.freeze({
    date: "2026-09-20",
    originLocationId: "origin",
    earliestStart: 540,
    latestEnd: 1080,
    transportStrategy: "transit_first",
    taxiBudget: Object.freeze({ type: "unset" as const }),
    fixedAppointmentBufferMinutes: 0,
    routePreferences: EMPTY_ROUTE_PREFERENCES,
    ...overrides,
  });
}

function fixedViewingTime(start: number): NormalizedViewingTime {
  return Object.freeze({
    type: "fixed",
    window: Object.freeze({ earliestStart: start, latestStart: start }),
  });
}

function windowViewingTime(
  earliestStart: number,
  latestStart: number,
): NormalizedViewingTime {
  return Object.freeze({
    type: "window",
    sourceConstraint: "start_between",
    window: Object.freeze({ earliestStart, latestStart }),
  });
}

function unconfirmedViewingTime(): NormalizedViewingTime {
  return Object.freeze({ type: "unconfirmed", window: null });
}

function createProperty(
  id: string,
  overrides: Partial<NormalizedProperty> = {},
): NormalizedProperty {
  return Object.freeze({
    id,
    address: `${id} address`,
    displayName: id,
    locationId: `location-${id}`,
    viewingTime: unconfirmedViewingTime(),
    importance: "if_time",
    durationMinutes: 10,
    status: "pending",
    ...overrides,
  });
}

function createTransit(
  durationMinutes: number,
  transferCount = 0,
  status: "available" | "degraded" = "available",
): TransitTravelAlternative {
  return Object.freeze({
    status,
    durationMinutes,
    cost: 3,
    transferCount,
    walkMeters: 200,
  });
}

function createTaxi(
  durationMinutes: number,
  cost = 20,
  status: "available" | "degraded" = "available",
): TaxiTravelAlternative {
  return Object.freeze({ status, durationMinutes, cost });
}

function createEdge(
  fromLocationId: string,
  toLocationId: string,
  options: Readonly<{
    transit?: TransitTravelAlternative;
    taxi?: TaxiTravelAlternative;
  }> = {},
): TravelEdge {
  const transit =
    options.transit ?? createTransit(20);
  const taxi = options.taxi ?? createTaxi(10);
  const dataStatus =
    transit.status === "available" && taxi.status === "available"
      ? "complete"
      : transit.status === "unavailable" && taxi.status === "unavailable"
        ? "unavailable"
        : "degraded";

  return Object.freeze({
    fromLocationId,
    toLocationId,
    transit,
    taxi,
    dataStatus,
    failure: null,
  });
}

function createMatrix(...edges: readonly TravelEdge[]): TravelMatrix {
  const rows: Record<string, Record<string, TravelEdge>> = Object.create(null);

  for (const edge of edges) {
    const row = rows[edge.fromLocationId] ?? Object.create(null);
    row[edge.toLocationId] = edge;
    rows[edge.fromLocationId] = row;
  }

  for (const row of Object.values(rows)) {
    Object.freeze(row);
  }

  return Object.freeze({ edgesByFrom: Object.freeze(rows) });
}

function createEvidence(
  settings: DayPlanSettings,
  orderedProperties: readonly NormalizedProperty[],
  transportModes: readonly TransportMode[],
  travelMatrix: TravelMatrix,
  assignedProperties: readonly NormalizedProperty[] = orderedProperties,
): TaxiValueRouteEvidence {
  const frozenOrder = Object.freeze([...orderedProperties]);
  const simulation = simulateTimeline({
    settings,
    orderedProperties: frozenOrder,
    transportModes: Object.freeze([...transportModes]),
    travelMatrix,
  });
  const constraints = evaluateTimelineConstraints({
    settings,
    assignedProperties: Object.freeze([...assignedProperties]),
    orderedProperties: frozenOrder,
    simulation,
  });

  return Object.freeze({
    orderedProperties: frozenOrder,
    simulation,
    constraints,
  });
}

function withConstraints(
  evidence: TaxiValueRouteEvidence,
  constraints: ConstraintEvaluation,
): TaxiValueRouteEvidence {
  return Object.freeze({ ...evidence, constraints });
}

function createHardIssue(
  code: ConflictCode,
  propertyIds: readonly string[],
  parameters: StructuredParameters,
): ConstraintEvaluation {
  const frozenPropertyIds = Object.freeze([...propertyIds]);
  const frozenParameters = Object.freeze({ ...parameters });
  const violation = Object.freeze({
    kind: "violation" as const,
    code,
    severity: "error" as const,
    propertyIds: frozenPropertyIds,
    parameters: frozenParameters,
  });
  const conflict = Object.freeze({
    kind: "conflict" as const,
    code,
    propertyIds: frozenPropertyIds,
    parameters: frozenParameters,
  });

  return Object.freeze({
    hardViolationCount: 1,
    violations: Object.freeze([violation]),
    conflicts: Object.freeze([conflict]),
  });
}

function evaluateSingleTaxiEdge(
  transitMinutes: number,
  taxiMinutes: number,
  transferCount = 0,
  statuses: Readonly<{
    transit?: "available" | "degraded";
    taxi?: "available" | "degraded";
  }> = {},
) {
  const settings = createSettings();
  const property = createProperty("A");
  const matrix = createMatrix(
    createEdge("origin", property.locationId, {
      transit: createTransit(
        transitMinutes,
        transferCount,
        statuses.transit,
      ),
      taxi: createTaxi(taxiMinutes, 20, statuses.taxi),
    }),
  );
  const reference = createEvidence(
    settings,
    [property],
    ["transit"],
    matrix,
  );
  const candidate = createEvidence(settings, [property], ["taxi"], matrix);

  return evaluateTaxiValue({ reference, candidate, travelMatrix: matrix });
}

describe("evaluateTaxiValue avoid_late", () => {
  it("implements Case 06 from real CE-07 and CE-08 evidence", () => {
    const settings = createSettings();
    const property = createProperty("A", {
      viewingTime: fixedViewingTime(555),
    });
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: createTransit(20),
        taxi: createTaxi(10, 20),
      }),
    );
    const reference = createEvidence(
      settings,
      [property],
      ["transit"],
      matrix,
    );
    const candidate = createEvidence(settings, [property], ["taxi"], matrix);
    const explanations = evaluateTaxiValue({
      reference,
      candidate,
      travelMatrix: matrix,
    });
    const budget = evaluateTaxiBudget({
      taxiBudget: Object.freeze({ type: "capped", amount: 20 }),
      simulation: candidate.simulation,
    });

    expect(reference.constraints.conflicts[0]).toMatchObject({
      code: "appointment_conflict",
      parameters: { lateByMinutes: 5 },
    });
    expect(candidate.constraints.hardViolationCount).toBe(0);
    expect(explanations).toEqual([
      {
        scope: "leg",
        code: "avoid_late",
        fromLocationId: "origin",
        toLocationId: property.locationId,
        parameters: {
          taxiCost: 20,
          minutesSaved: 10,
          lateIssuesAvoided: 1,
          maximumLateByMinutesAvoided: 5,
        },
      },
    ]);
    expect(budget.hardViolationCount).toBe(0);
  });

  it("does not emit avoid_late when the slower transit reference is feasible", () => {
    const settings = createSettings();
    const property = createProperty("A", {
      viewingTime: fixedViewingTime(570),
    });
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: createTransit(20),
        taxi: createTaxi(10),
      }),
    );
    const reference = createEvidence(
      settings,
      [property],
      ["transit"],
      matrix,
    );
    const candidate = createEvidence(settings, [property], ["taxi"], matrix);

    expect(reference.constraints.hardViolationCount).toBe(0);
    expect(
      evaluateTaxiValue({ reference, candidate, travelMatrix: matrix }),
    ).toEqual([]);
  });

  it("does not treat a fixed-buffer shortfall without lateness as avoid_late", () => {
    const settings = createSettings({ fixedAppointmentBufferMinutes: 15 });
    const property = createProperty("A", {
      viewingTime: fixedViewingTime(570),
    });
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: createTransit(25),
        taxi: createTaxi(10),
      }),
    );
    const reference = createEvidence(
      settings,
      [property],
      ["transit"],
      matrix,
    );
    const candidate = createEvidence(settings, [property], ["taxi"], matrix);

    expect(reference.constraints.conflicts[0]).toMatchObject({
      code: "appointment_conflict",
      parameters: { lateByMinutes: 0, bufferShortfallMinutes: 10 },
    });
    expect(candidate.constraints.hardViolationCount).toBe(0);
    expect(
      evaluateTaxiValue({ reference, candidate, travelMatrix: matrix }),
    ).toEqual([]);
  });

  it("does not attribute an earlier lateness issue to a later taxi leg", () => {
    const settings = createSettings();
    const propertyA = createProperty("A", {
      viewingTime: fixedViewingTime(550),
    });
    const propertyB = createProperty("B");
    const matrix = createMatrix(
      createEdge("origin", propertyA.locationId, {
        transit: createTransit(20),
      }),
      createEdge(propertyA.locationId, propertyB.locationId, {
        transit: createTransit(20),
        taxi: createTaxi(10),
      }),
    );
    const reference = createEvidence(
      settings,
      [propertyA, propertyB],
      ["transit", "transit"],
      matrix,
    );
    const simulatedCandidate = createEvidence(
      settings,
      [propertyA, propertyB],
      ["transit", "taxi"],
      matrix,
    );
    const candidate = withConstraints(simulatedCandidate, CLEAN_CONSTRAINTS);

    expect(reference.constraints.conflicts[0]).toMatchObject({
      code: "appointment_conflict",
      propertyIds: ["A"],
    });
    expect(
      evaluateTaxiValue({ reference, candidate, travelMatrix: matrix }),
    ).toEqual([]);
  });

  it("requires a same-position transit reference with matching leg identity", () => {
    const settings = createSettings();
    const propertyA = createProperty("A");
    const propertyB = createProperty("B");
    const matrix = createMatrix(
      createEdge("origin", propertyA.locationId),
      createEdge("origin", propertyB.locationId),
    );
    const reference = withConstraints(
      createEvidence(settings, [propertyB], ["transit"], matrix),
      createHardIssue("time_window_conflict", ["B"], {
        lateByMinutes: 5,
      }),
    );
    const candidate = createEvidence(settings, [propertyA], ["taxi"], matrix);

    expect(
      evaluateTaxiValue({ reference, candidate, travelMatrix: matrix }),
    ).toEqual([]);
  });

  it("requires the candidate to restore full CE-08 hard feasibility", () => {
    const settings = createSettings();
    const property = createProperty("A", {
      viewingTime: fixedViewingTime(555),
    });
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: createTransit(20),
        taxi: createTaxi(10),
      }),
    );
    const reference = createEvidence(
      settings,
      [property],
      ["transit"],
      matrix,
    );
    const candidate = withConstraints(
      createEvidence(settings, [property], ["taxi"], matrix),
      createHardIssue("end_time_exceeded", [], { exceededByMinutes: 1 }),
    );

    expect(
      evaluateTaxiValue({ reference, candidate, travelMatrix: matrix }),
    ).toEqual([]);
  });

  it("uses time-window lateness and emits avoid_late before transit_detour", () => {
    const settings = createSettings();
    const property = createProperty("A", {
      viewingTime: windowViewingTime(540, 560),
    });
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: createTransit(55),
        taxi: createTaxi(10),
      }),
    );
    const reference = createEvidence(
      settings,
      [property],
      ["transit"],
      matrix,
    );
    const candidate = createEvidence(settings, [property], ["taxi"], matrix);
    const result = evaluateTaxiValue({ reference, candidate, travelMatrix: matrix });

    expect(reference.constraints.conflicts[0]).toMatchObject({
      code: "time_window_conflict",
      parameters: { lateByMinutes: 35 },
    });
    expect(result.map((item) => item.code)).toEqual([
      "avoid_late",
      "transit_detour",
    ]);
  });
});

describe("evaluateTaxiValue transit_detour", () => {
  it("implements Case 07 while budget invalidity remains independently visible", () => {
    const settings = createSettings();
    const property = createProperty("A");
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: createTransit(55, 2),
        taxi: createTaxi(18, 32),
      }),
    );
    const reference = createEvidence(
      settings,
      [property],
      ["transit"],
      matrix,
    );
    const candidate = createEvidence(settings, [property], ["taxi"], matrix);
    const explanations = evaluateTaxiValue({
      reference,
      candidate,
      travelMatrix: matrix,
    });
    const budget = evaluateTaxiBudget({
      taxiBudget: Object.freeze({ type: "capped", amount: 30 }),
      simulation: candidate.simulation,
    });

    expect(explanations).toEqual([
      {
        scope: "leg",
        code: "transit_detour",
        fromLocationId: "origin",
        toLocationId: property.locationId,
        parameters: {
          taxiCost: 32,
          minutesSaved: 37,
          transitMinutes: 55,
          taxiMinutes: 18,
          transferCount: 2,
          detourBasis: "time_threshold",
        },
      },
    ]);
    expect(budget).toMatchObject({
      hardViolationCount: 1,
      conflicts: [{ code: "taxi_budget_exceeded" }],
    });
  });

  it.each([
    [ROUTE_ENGINE_CONFIG.taxiRecommendation.meaningfulTimeSavingMinutes - 1, false],
    [ROUTE_ENGINE_CONFIG.taxiRecommendation.meaningfulTimeSavingMinutes, true],
    [ROUTE_ENGINE_CONFIG.taxiRecommendation.meaningfulTimeSavingMinutes + 1, true],
  ])(
    "applies the inclusive configured minutes-saved boundary at offset %s",
    (minutesSaved, expected) => {
      const result = evaluateSingleTaxiEdge(10 + minutesSaved, 10);

      expect(result.some((item) => item.code === "transit_detour")).toBe(
        expected,
      );
    },
  );

  it.each([
    ["just below", EXACT_RATIO_BOUNDARY_TRANSIT_MINUTES - 1, false],
    ["exactly at", EXACT_RATIO_BOUNDARY_TRANSIT_MINUTES, true],
    ["just above", EXACT_RATIO_BOUNDARY_TRANSIT_MINUTES + 1, true],
  ])(
    "applies the configured ratio boundary %s (%s transit minutes)",
    (boundaryPosition, transitMinutes, expected) => {
      expect(
        EXACT_RATIO_BOUNDARY_TRANSIT_MINUTES -
          RATIO_BOUNDARY_TAXI_MINUTES,
      ).toBeGreaterThanOrEqual(
        TAXI_RECOMMENDATION.meaningfulTimeSavingMinutes,
      );
      if (boundaryPosition === "exactly at") {
        expect(transitMinutes / RATIO_BOUNDARY_TAXI_MINUTES).toBe(
          TAXI_RECOMMENDATION.minimumTransitToTaxiDurationRatio,
        );
      }

      const result = evaluateSingleTaxiEdge(
        transitMinutes,
        RATIO_BOUNDARY_TAXI_MINUTES,
      );

      expect(result.some((item) => item.code === "transit_detour")).toBe(
        expected,
      );
    },
  );

  it.each([
    [60, 35],
    [36, 20],
  ])(
    "does not qualify when only one time condition is met (%s vs %s)",
    (transitMinutes, taxiMinutes) => {
      expect(evaluateSingleTaxiEdge(transitMinutes, taxiMinutes)).toEqual([]);
    },
  );

  it.each([
    [ROUTE_ENGINE_CONFIG.transitRisk.transferCountThreshold - 1, false],
    [ROUTE_ENGINE_CONFIG.transitRisk.transferCountThreshold, true],
    [ROUTE_ENGINE_CONFIG.transitRisk.transferCountThreshold + 1, true],
  ])(
    "applies the inclusive configured transfer boundary at %s",
    (transferCount, expected) => {
      const result = evaluateSingleTaxiEdge(20, 15, transferCount);

      expect(result.some((item) => item.code === "transit_detour")).toBe(
        expected,
      );
      if (expected) {
        expect(result[0].parameters.detourBasis).toBe("multiple_transfers");
      }
    },
  );

  it("uses available and degraded alternatives identically for comparison", () => {
    const result = evaluateSingleTaxiEdge(55, 18, 0, {
      transit: "degraded",
      taxi: "degraded",
    });

    expect(result).toMatchObject([
      { code: "transit_detour", parameters: { minutesSaved: 37 } },
    ]);
  });

  it("skips all transit-comparison reasons when transit is unavailable", () => {
    const settings = createSettings();
    const property = createProperty("A");
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: Object.freeze({ status: "unavailable" as const }),
        taxi: createTaxi(10),
      }),
    );
    const reference = createEvidence(settings, [], [], matrix);
    const candidate = createEvidence(settings, [property], ["taxi"], matrix);

    expect(
      evaluateTaxiValue({ reference, candidate, travelMatrix: matrix }),
    ).toEqual([]);
  });
});

describe("evaluateTaxiValue unlock_extra_viewing", () => {
  it("implements Case 08 only when the same-order transit counterfactual is infeasible", () => {
    const settings = createSettings({ latestEnd: 605 });
    const propertyA = createProperty("A");
    const propertyB = createProperty("B");
    const assigned = Object.freeze([propertyA, propertyB]);
    const matrix = createMatrix(
      createEdge("origin", propertyA.locationId),
      createEdge(propertyA.locationId, propertyB.locationId, {
        transit: createTransit(30),
        taxi: createTaxi(20, 25),
      }),
    );
    const reference = createEvidence(
      settings,
      [propertyA],
      ["transit"],
      matrix,
      assigned,
    );
    const candidate = createEvidence(
      settings,
      [propertyA, propertyB],
      ["transit", "taxi"],
      matrix,
      assigned,
    );
    const candidateTransitCounterfactual = createEvidence(
      settings,
      [propertyA, propertyB],
      ["transit", "transit"],
      matrix,
      assigned,
    );

    expect(reference.constraints.hardViolationCount).toBe(0);
    expect(candidate.constraints.hardViolationCount).toBe(0);
    expect(candidateTransitCounterfactual.constraints.conflicts).toMatchObject([
      { code: "end_time_exceeded" },
    ]);
    expect(
      evaluateTaxiValue({ reference, candidate, travelMatrix: matrix }),
    ).toEqual([]);
    expect(
      evaluateTaxiValue({
        reference,
        candidate,
        candidateTransitCounterfactual,
        travelMatrix: matrix,
      }),
    ).toEqual([
      {
        scope: "route",
        code: "unlock_extra_viewing",
        parameters: {
          taxiCost: 25,
          minutesSaved: 10,
          completedCountGain: 1,
          mustCompletedCountGain: 0,
          taxiLegCount: 1,
        },
      },
    ]);
  });

  it("does not claim Case 08 unlock when the same-order transit route is feasible", () => {
    const settings = createSettings({ latestEnd: 620 });
    const propertyA = createProperty("A");
    const propertyB = createProperty("B");
    const assigned = Object.freeze([propertyA, propertyB]);
    const matrix = createMatrix(
      createEdge("origin", propertyA.locationId),
      createEdge(propertyA.locationId, propertyB.locationId, {
        transit: createTransit(30),
        taxi: createTaxi(20, 25),
      }),
    );
    const reference = createEvidence(
      settings,
      [propertyA],
      ["transit"],
      matrix,
      assigned,
    );
    const candidate = createEvidence(
      settings,
      [propertyA, propertyB],
      ["transit", "taxi"],
      matrix,
      assigned,
    );
    const candidateTransitCounterfactual = createEvidence(
      settings,
      [propertyA, propertyB],
      ["transit", "transit"],
      matrix,
      assigned,
    );

    expect(candidate.constraints.hardViolationCount).toBe(0);
    expect(candidateTransitCounterfactual.constraints.hardViolationCount).toBe(0);
    expect(
      evaluateTaxiValue({
        reference,
        candidate,
        candidateTransitCounterfactual,
        travelMatrix: matrix,
      }),
    ).toEqual([]);
  });

  it("does not treat an unrelated counterfactual conflict as taxi causality", () => {
    const settings = createSettings({ latestEnd: 620 });
    const propertyA = createProperty("A");
    const propertyB = createProperty("B");
    const matrix = createMatrix(
      createEdge("origin", propertyA.locationId),
      createEdge(propertyA.locationId, propertyB.locationId, {
        transit: createTransit(30),
        taxi: createTaxi(20, 25),
      }),
    );
    const reference = createEvidence(
      settings,
      [propertyA],
      ["transit"],
      matrix,
    );
    const candidate = createEvidence(
      settings,
      [propertyA, propertyB],
      ["transit", "taxi"],
      matrix,
    );
    const candidateTransitCounterfactual = withConstraints(
      createEvidence(
        settings,
        [propertyA, propertyB],
        ["transit", "transit"],
        matrix,
      ),
      createHardIssue("travel_data_unavailable", ["B"], {
        reason: "selected_mode_unavailable",
      }),
    );

    expect(
      evaluateTaxiValue({
        reference,
        candidate,
        candidateTransitCounterfactual,
        travelMatrix: matrix,
      }),
    ).toEqual([]);
  });

  it("emits unlock when taxi causally restores must-visit completion", () => {
    const settings = createSettings();
    const mustProperty = createProperty("A", {
      importance: "must",
      viewingTime: fixedViewingTime(555),
    });
    const optionalProperty = createProperty("B");
    const assigned = Object.freeze([mustProperty, optionalProperty]);
    const matrix = createMatrix(
      createEdge("origin", mustProperty.locationId, {
        transit: createTransit(20),
        taxi: createTaxi(10, 22),
      }),
      createEdge("origin", optionalProperty.locationId),
    );
    const reference = createEvidence(
      settings,
      [optionalProperty],
      ["transit"],
      matrix,
      assigned,
    );
    const candidate = createEvidence(
      settings,
      [mustProperty],
      ["taxi"],
      matrix,
      assigned,
    );
    const candidateTransitCounterfactual = createEvidence(
      settings,
      [mustProperty],
      ["transit"],
      matrix,
      assigned,
    );
    const result = evaluateTaxiValue({
      reference,
      candidate,
      candidateTransitCounterfactual,
      travelMatrix: matrix,
    });

    expect(reference.constraints.conflicts).toMatchObject([
      { code: "must_visit_unscheduled", propertyIds: ["A"] },
    ]);
    expect(candidate.constraints.hardViolationCount).toBe(0);
    expect(candidateTransitCounterfactual.constraints.conflicts).toMatchObject([
      { code: "appointment_conflict", parameters: { lateByMinutes: 5 } },
    ]);
    expect(result).toEqual([
      {
        scope: "route",
        code: "unlock_extra_viewing",
        parameters: {
          taxiCost: 22,
          minutesSaved: 10,
          completedCountGain: 0,
          mustCompletedCountGain: 1,
          taxiLegCount: 1,
        },
      },
    ]);
  });

  it("does not claim must restoration when its transit counterfactual is feasible", () => {
    const settings = createSettings();
    const mustProperty = createProperty("A", {
      importance: "must",
      viewingTime: fixedViewingTime(570),
    });
    const optionalProperty = createProperty("B");
    const assigned = Object.freeze([mustProperty, optionalProperty]);
    const matrix = createMatrix(
      createEdge("origin", mustProperty.locationId, {
        transit: createTransit(20),
        taxi: createTaxi(10, 22),
      }),
      createEdge("origin", optionalProperty.locationId),
    );
    const reference = createEvidence(
      settings,
      [optionalProperty],
      ["transit"],
      matrix,
      assigned,
    );
    const candidate = createEvidence(
      settings,
      [mustProperty],
      ["taxi"],
      matrix,
      assigned,
    );
    const candidateTransitCounterfactual = createEvidence(
      settings,
      [mustProperty],
      ["transit"],
      matrix,
      assigned,
    );

    expect(reference.constraints.conflicts).toMatchObject([
      { code: "must_visit_unscheduled" },
    ]);
    expect(candidate.constraints.hardViolationCount).toBe(0);
    expect(candidateTransitCounterfactual.constraints.hardViolationCount).toBe(0);
    expect(
      evaluateTaxiValue({
        reference,
        candidate,
        candidateTransitCounterfactual,
        travelMatrix: matrix,
      }),
    ).toEqual([]);
  });

  it("does not infer unlock from an earlier finish or lower travel time alone", () => {
    const result = evaluateSingleTaxiEdge(20, 10);

    expect(result).toEqual([]);
  });

  it("does not emit unlock while the candidate still has hard violations", () => {
    const settings = createSettings({ latestEnd: 595 });
    const propertyA = createProperty("A");
    const propertyB = createProperty("B");
    const matrix = createMatrix(
      createEdge("origin", propertyA.locationId),
      createEdge(propertyA.locationId, propertyB.locationId, {
        transit: createTransit(20),
        taxi: createTaxi(10),
      }),
    );
    const reference = createEvidence(
      settings,
      [propertyA],
      ["transit"],
      matrix,
    );
    const candidate = withConstraints(
      createEvidence(
        settings,
        [propertyA, propertyB],
        ["transit", "taxi"],
        matrix,
      ),
      createHardIssue("end_time_exceeded", [], { exceededByMinutes: 1 }),
    );
    const candidateTransitCounterfactual = createEvidence(
      settings,
      [propertyA, propertyB],
      ["transit", "transit"],
      matrix,
    );

    expect(
      evaluateTaxiValue({
        reference,
        candidate,
        candidateTransitCounterfactual,
        travelMatrix: matrix,
      }),
    ).toEqual([]);
  });
});

describe("evaluateTaxiValue contract protection and determinism", () => {
  it("throws for a selected taxi leg whose exact directed edge is missing", () => {
    const settings = createSettings();
    const property = createProperty("A");
    const usableMatrix = createMatrix(
      createEdge("origin", property.locationId),
    );
    const reverseOnlyMatrix = createMatrix(
      createEdge(property.locationId, "origin"),
    );
    const reference = createEvidence(
      settings,
      [property],
      ["transit"],
      usableMatrix,
    );
    const candidate = createEvidence(
      settings,
      [property],
      ["taxi"],
      usableMatrix,
    );

    expect(() =>
      evaluateTaxiValue({
        reference,
        candidate,
        travelMatrix: reverseOnlyMatrix,
      }),
    ).toThrow(RangeError);
  });

  it("throws when selected candidate taxi data is unavailable", () => {
    const settings = createSettings();
    const property = createProperty("A");
    const usableMatrix = createMatrix(
      createEdge("origin", property.locationId),
    );
    const unavailableTaxiMatrix = createMatrix(
      createEdge("origin", property.locationId, {
        taxi: Object.freeze({ status: "unavailable" as const }),
      }),
    );
    const reference = createEvidence(
      settings,
      [property],
      ["transit"],
      usableMatrix,
    );
    const candidate = createEvidence(
      settings,
      [property],
      ["taxi"],
      usableMatrix,
    );

    expect(() =>
      evaluateTaxiValue({
        reference,
        candidate,
        travelMatrix: unavailableTaxiMatrix,
      }),
    ).toThrow(RangeError);
  });

  it("throws when reference stop count and property order are misaligned", () => {
    const settings = createSettings();
    const property = createProperty("A");
    const matrix = createMatrix(createEdge("origin", property.locationId));
    const validReference = createEvidence(
      settings,
      [property],
      ["transit"],
      matrix,
    );
    const reference = Object.freeze({
      ...validReference,
      orderedProperties: Object.freeze([]),
    });
    const candidate = createEvidence(settings, [property], ["taxi"], matrix);

    expect(() =>
      evaluateTaxiValue({ reference, candidate, travelMatrix: matrix }),
    ).toThrow(RangeError);
  });

  it("throws when candidate stop identity and property order are misaligned", () => {
    const settings = createSettings();
    const propertyA = createProperty("A");
    const propertyB = createProperty("B", { locationId: propertyA.locationId });
    const matrix = createMatrix(createEdge("origin", propertyA.locationId));
    const reference = createEvidence(
      settings,
      [propertyA],
      ["transit"],
      matrix,
    );
    const validCandidate = createEvidence(
      settings,
      [propertyA],
      ["taxi"],
      matrix,
    );
    const candidate = Object.freeze({
      ...validCandidate,
      orderedProperties: Object.freeze([propertyB]),
    });

    expect(() =>
      evaluateTaxiValue({ reference, candidate, travelMatrix: matrix }),
    ).toThrow(RangeError);
  });

  it("rejects a counterfactual whose stop count is not internally aligned", () => {
    const settings = createSettings();
    const property = createProperty("A");
    const matrix = createMatrix(createEdge("origin", property.locationId));
    const reference = createEvidence(
      settings,
      [property],
      ["transit"],
      matrix,
    );
    const candidate = createEvidence(settings, [property], ["taxi"], matrix);
    const validCounterfactual = createEvidence(
      settings,
      [property],
      ["transit"],
      matrix,
    );
    const candidateTransitCounterfactual = Object.freeze({
      ...validCounterfactual,
      orderedProperties: Object.freeze([]),
    });

    expect(() =>
      evaluateTaxiValue({
        reference,
        candidate,
        candidateTransitCounterfactual,
        travelMatrix: matrix,
      }),
    ).toThrow(RangeError);
  });

  it("rejects a counterfactual with a different PropertyId order", () => {
    const settings = createSettings();
    const propertyA = createProperty("A");
    const propertyB = createProperty("B", { locationId: propertyA.locationId });
    const matrix = createMatrix(createEdge("origin", propertyA.locationId));
    const reference = createEvidence(
      settings,
      [propertyA],
      ["transit"],
      matrix,
    );
    const candidate = createEvidence(
      settings,
      [propertyA],
      ["taxi"],
      matrix,
    );
    const candidateTransitCounterfactual = createEvidence(
      settings,
      [propertyB],
      ["transit"],
      matrix,
    );

    expect(() =>
      evaluateTaxiValue({
        reference,
        candidate,
        candidateTransitCounterfactual,
        travelMatrix: matrix,
      }),
    ).toThrow(RangeError);
  });

  it("rejects a counterfactual with a different directed leg origin", () => {
    const settings = createSettings();
    const property = createProperty("A");
    const matrix = createMatrix(createEdge("origin", property.locationId));
    const reference = createEvidence(
      settings,
      [property],
      ["transit"],
      matrix,
    );
    const candidate = createEvidence(settings, [property], ["taxi"], matrix);
    const validCounterfactual = createEvidence(
      settings,
      [property],
      ["transit"],
      matrix,
    );
    const counterfactualStop = Object.freeze({
      ...validCounterfactual.simulation.stops[0],
      travelFromLocationId: "different-origin",
    });
    const candidateTransitCounterfactual = Object.freeze({
      ...validCounterfactual,
      simulation: Object.freeze({
        ...validCounterfactual.simulation,
        stops: Object.freeze([counterfactualStop]),
      }),
    });

    expect(() =>
      evaluateTaxiValue({
        reference,
        candidate,
        candidateTransitCounterfactual,
        travelMatrix: matrix,
      }),
    ).toThrow(RangeError);
  });

  it("requires every candidate taxi leg to become transit", () => {
    const settings = createSettings();
    const property = createProperty("A");
    const matrix = createMatrix(createEdge("origin", property.locationId));
    const reference = createEvidence(
      settings,
      [property],
      ["transit"],
      matrix,
    );
    const candidate = createEvidence(settings, [property], ["taxi"], matrix);

    expect(() =>
      evaluateTaxiValue({
        reference,
        candidate,
        candidateTransitCounterfactual: candidate,
        travelMatrix: matrix,
      }),
    ).toThrow(RangeError);
  });

  it("requires every non-taxi candidate leg to keep its mode", () => {
    const settings = createSettings();
    const property = createProperty("A");
    const matrix = createMatrix(createEdge("origin", property.locationId));
    const reference = createEvidence(
      settings,
      [property],
      ["transit"],
      matrix,
    );
    const candidate = createEvidence(
      settings,
      [property],
      ["transit"],
      matrix,
    );
    const candidateTransitCounterfactual = createEvidence(
      settings,
      [property],
      ["taxi"],
      matrix,
    );

    expect(() =>
      evaluateTaxiValue({
        reference,
        candidate,
        candidateTransitCounterfactual,
        travelMatrix: matrix,
      }),
    ).toThrow(RangeError);
  });

  it("preserves deterministic leg order, appends one route reason, and freezes output", () => {
    const settings = createSettings({ latestEnd: 640 });
    const propertyA = createProperty("A");
    const propertyB = createProperty("B");
    const propertyC = createProperty("C");
    const assigned = Object.freeze([propertyA, propertyB, propertyC]);
    const matrix = createMatrix(
      createEdge("origin", propertyA.locationId),
      createEdge(propertyA.locationId, propertyB.locationId, {
        transit: createTransit(55, 0),
        taxi: createTaxi(18, 20),
      }),
      createEdge(propertyB.locationId, propertyC.locationId, {
        transit: createTransit(20, ROUTE_ENGINE_CONFIG.transitRisk.transferCountThreshold),
        taxi: createTaxi(15, 25),
      }),
    );
    const reference = createEvidence(
      settings,
      [propertyA],
      ["transit"],
      matrix,
      assigned,
    );
    const candidate = createEvidence(
      settings,
      [propertyA, propertyB, propertyC],
      ["transit", "taxi", "taxi"],
      matrix,
      assigned,
    );
    const candidateTransitCounterfactual = createEvidence(
      settings,
      [propertyA, propertyB, propertyC],
      ["transit", "transit", "transit"],
      matrix,
      assigned,
    );
    const input = Object.freeze({
      reference,
      candidate,
      candidateTransitCounterfactual,
      travelMatrix: matrix,
    });
    const first = evaluateTaxiValue(input);
    const second = evaluateTaxiValue(input);

    expect(candidateTransitCounterfactual.constraints.conflicts).toMatchObject([
      { code: "end_time_exceeded" },
    ]);
    expect(first.map((item) => item.code)).toEqual([
      "transit_detour",
      "transit_detour",
      "unlock_extra_viewing",
    ]);
    expect(
      first.filter((item) => item.code === "unlock_extra_viewing"),
    ).toHaveLength(1);
    expect(first.at(-1)?.parameters).toMatchObject({
      taxiCost: 45,
      minutesSaved: 42,
      completedCountGain: 2,
      taxiLegCount: 2,
    });
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.every((item) => Object.isFrozen(item))).toBe(true);
    expect(first.every((item) => Object.isFrozen(item.parameters))).toBe(true);
    expect(Object.isFrozen(reference)).toBe(true);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(reference.orderedProperties)).toBe(true);
    expect(Object.isFrozen(candidate.orderedProperties)).toBe(true);
    expect(Object.isFrozen(reference.simulation)).toBe(true);
    expect(Object.isFrozen(candidate.simulation)).toBe(true);
    expect(Object.isFrozen(reference.constraints)).toBe(true);
    expect(Object.isFrozen(candidate.constraints)).toBe(true);
    expect(Object.isFrozen(candidateTransitCounterfactual)).toBe(true);
    expect(Object.isFrozen(candidateTransitCounterfactual.simulation)).toBe(true);
    expect(Object.isFrozen(candidateTransitCounterfactual.constraints)).toBe(true);
    expect(Object.isFrozen(matrix)).toBe(true);
    expect(candidate.simulation.stops.every((stop) => stop.reasonCodes.length === 0)).toBe(true);
  });
});
