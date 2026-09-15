import { describe, expect, it } from "vitest";

import {
  evaluateTimelineConstraints,
  evaluateTravelDataConstraints,
  type ConstraintEvaluation,
} from "../../src/lib/route/evaluateConstraints";
import { simulateTimeline } from "../../src/lib/route/simulateTimeline";
import type {
  ConflictCode,
  DayPlanSettings,
  NormalizedProperty,
  NormalizedViewingTime,
  SimulationResult,
  TransportMode,
} from "../../src/lib/route/types";
import type {
  TaxiTravelAlternative,
  TransitTravelAlternative,
  TravelEdge,
  TravelMatrix,
} from "../../src/lib/travel/types";
import {
  CASE16_PROVIDER_FAILURE,
  CASE16_TAXI_ONLY,
  TRANSIT_DEGRADED_SCENARIO,
  buildFixtureTravelMatrix,
} from "../fixtures/travel/scenarios";

const TARGET_DATE = "2026-09-20";
const EMPTY_ROUTE_PREFERENCES = Object.freeze([]);
const AVAILABLE_TAXI: TaxiTravelAlternative = Object.freeze({
  status: "available",
  durationMinutes: 5,
  cost: 20,
});

function createSettings(
  overrides: Partial<DayPlanSettings> = {},
): DayPlanSettings {
  return Object.freeze({
    date: TARGET_DATE,
    originLocationId: "origin",
    earliestStart: 540,
    latestEnd: 1080,
    transportStrategy: "transit_first",
    taxiBudget: Object.freeze({ type: "unset" as const }),
    fixedAppointmentBufferMinutes: 15,
    routePreferences: EMPTY_ROUTE_PREFERENCES,
    ...overrides,
  });
}

function freezeWindow(earliestStart: number, latestStart: number) {
  return Object.freeze({ earliestStart, latestStart });
}

function fixedViewingTime(start: number): NormalizedViewingTime {
  return Object.freeze({
    type: "fixed",
    window: freezeWindow(start, start),
  });
}

function windowViewingTime(
  earliestStart: number,
  latestStart: number,
  sourceConstraint: "start_between" | "finish_before" = "start_between",
): NormalizedViewingTime {
  return Object.freeze({
    type: "window",
    sourceConstraint,
    window: freezeWindow(earliestStart, latestStart),
  });
}

function flexibleViewingTime(
  earliestStart: number,
  latestStart: number,
): NormalizedViewingTime {
  return Object.freeze({
    type: "flexible",
    window: freezeWindow(earliestStart, latestStart),
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
    durationMinutes: 30,
    status: "pending",
    ...overrides,
  });
}

function availableTransit(
  durationMinutes: number,
  status: "available" | "degraded" = "available",
): TransitTravelAlternative {
  return Object.freeze({
    status,
    durationMinutes,
    cost: 3,
    transferCount: 0,
    walkMeters: 0,
  });
}

function createEdge(
  fromLocationId: string,
  toLocationId: string,
  options: Readonly<{
    transit?: TransitTravelAlternative;
    taxi?: TaxiTravelAlternative;
    providerFailure?: boolean;
  }> = {},
): TravelEdge {
  const transit = options.transit ?? availableTransit(10);
  const taxi = options.taxi ?? AVAILABLE_TAXI;
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
    failure: options.providerFailure
      ? Object.freeze({ kind: "provider_failure" as const })
      : null,
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

function createTransitMatrixForOrder(
  settings: DayPlanSettings,
  orderedProperties: readonly NormalizedProperty[],
  travelMinutes: readonly number[],
): TravelMatrix {
  return createMatrix(
    ...orderedProperties.map((property, index) =>
      createEdge(
        index === 0
          ? settings.originLocationId
          : orderedProperties[index - 1].locationId,
        property.locationId,
        { transit: availableTransit(travelMinutes[index]) },
      ),
    ),
  );
}

function simulateCandidate(
  settings: DayPlanSettings,
  orderedProperties: readonly NormalizedProperty[],
  travelMinutes: readonly number[],
): SimulationResult {
  return simulateTimeline({
    settings,
    orderedProperties,
    transportModes: orderedProperties.map(() => "transit" as const),
    travelMatrix: createTransitMatrixForOrder(
      settings,
      orderedProperties,
      travelMinutes,
    ),
  });
}

function evaluateTimeline(
  settings: DayPlanSettings,
  assignedProperties: readonly NormalizedProperty[],
  orderedProperties: readonly NormalizedProperty[],
  simulation: SimulationResult,
): ConstraintEvaluation {
  return evaluateTimelineConstraints({
    settings,
    assignedProperties,
    orderedProperties,
    simulation,
  });
}

function expectIssueCodes(
  evaluation: ConstraintEvaluation,
  codes: readonly ConflictCode[],
): void {
  expect(evaluation.hardViolationCount).toBe(codes.length);
  expect(evaluation.violations.map((issue) => issue.code)).toEqual(codes);
  expect(evaluation.conflicts.map((issue) => issue.code)).toEqual(codes);
  expect(evaluation.violations.every((issue) => issue.severity === "error")).toBe(
    true,
  );

  evaluation.violations.forEach((violation, index) => {
    expect(violation.kind).toBe("violation");
    expect(violation.propertyIds).toEqual(
      evaluation.conflicts[index].propertyIds,
    );
    expect(violation.parameters).toEqual(
      evaluation.conflicts[index].parameters,
    );
  });
}

describe("fixed appointment constraints", () => {
  it("passes two fixed appointments with sufficient travel and buffers", () => {
    const settings = createSettings();
    const properties = [
      createProperty("A", {
        viewingTime: fixedViewingTime(600),
        durationMinutes: 30,
      }),
      createProperty("B", {
        viewingTime: fixedViewingTime(680),
        durationMinutes: 30,
      }),
    ];
    const simulation = simulateCandidate(settings, properties, [40, 30]);

    expect(
      evaluateTimeline(settings, properties, properties, simulation),
    ).toEqual({ hardViolationCount: 0, violations: [], conflicts: [] });
  });

  it("passes when the actual fixed buffer equals the required buffer", () => {
    const settings = createSettings({ fixedAppointmentBufferMinutes: 15 });
    const property = createProperty("A", {
      viewingTime: fixedViewingTime(600),
    });
    const simulation = simulateCandidate(settings, [property], [45]);

    expect(simulation.stops[0].bufferMinutes).toBe(15);
    expect(
      evaluateTimeline(settings, [property], [property], simulation),
    ).toEqual({ hardViolationCount: 0, violations: [], conflicts: [] });
  });

  it("emits one appointment conflict for a fixed-buffer shortfall", () => {
    const settings = createSettings({ fixedAppointmentBufferMinutes: 15 });
    const property = createProperty("A", {
      viewingTime: fixedViewingTime(600),
    });
    const simulation = simulateCandidate(settings, [property], [46]);
    const evaluation = evaluateTimeline(
      settings,
      [property],
      [property],
      simulation,
    );

    expectIssueCodes(evaluation, ["appointment_conflict"]);
    expect(evaluation.conflicts[0]).toEqual({
      kind: "conflict",
      code: "appointment_conflict",
      propertyIds: ["A"],
      parameters: {
        fixedStart: 600,
        arrivalAt: 586,
        actualStart: 600,
        requiredBufferMinutes: 15,
        actualBufferMinutes: 14,
        lateByMinutes: 0,
        bufferShortfallMinutes: 1,
      },
    });
  });

  it("deduplicates late fixed timing and zero buffer into one logical issue", () => {
    const settings = createSettings({ fixedAppointmentBufferMinutes: 15 });
    const property = createProperty("A", {
      viewingTime: fixedViewingTime(600),
    });
    const simulation = simulateCandidate(settings, [property], [65]);
    const snapshot = JSON.stringify(simulation);
    const evaluation = evaluateTimeline(
      settings,
      [property],
      [property],
      simulation,
    );

    expectIssueCodes(evaluation, ["appointment_conflict"]);
    expect(evaluation.conflicts[0].parameters).toEqual({
      fixedStart: 600,
      arrivalAt: 605,
      actualStart: 605,
      requiredBufferMinutes: 15,
      actualBufferMinutes: 0,
      lateByMinutes: 5,
      bufferShortfallMinutes: 15,
    });
    expect(JSON.stringify(simulation)).toBe(snapshot);
  });

  it("uses the second CE-07 fixed stop as evidence for insufficient travel", () => {
    const settings = createSettings();
    const properties = [
      createProperty("A", {
        viewingTime: fixedViewingTime(600),
        durationMinutes: 30,
      }),
      createProperty("B", {
        viewingTime: fixedViewingTime(650),
        durationMinutes: 30,
      }),
    ];
    const simulation = simulateCandidate(settings, properties, [40, 25]);
    const firstStopSnapshot = JSON.stringify(simulation.stops[0]);
    const evaluation = evaluateTimeline(
      settings,
      properties,
      properties,
      simulation,
    );

    expectIssueCodes(evaluation, ["appointment_conflict"]);
    expect(evaluation.conflicts[0].propertyIds).toEqual(["B"]);
    expect(evaluation.conflicts[0].parameters.lateByMinutes).toBe(5);
    expect(JSON.stringify(simulation.stops[0])).toBe(firstStopSnapshot);
  });
});

describe("normalized window constraints", () => {
  it("treats an ordinary latestStart as an inclusive boundary", () => {
    const settings = createSettings({ earliestStart: 780 });
    const property = createProperty("A", {
      viewingTime: windowViewingTime(780, 900),
      durationMinutes: 10,
    });
    const simulation = simulateCandidate(settings, [property], [120]);

    expect(simulation.stops[0].viewingStartAt).toBe(900);
    expect(
      evaluateTimeline(settings, [property], [property], simulation),
    ).toEqual({ hardViolationCount: 0, violations: [], conflicts: [] });
  });

  it("emits a time-window conflict one minute after latestStart", () => {
    const settings = createSettings({ earliestStart: 780 });
    const property = createProperty("A", {
      viewingTime: windowViewingTime(780, 900),
      durationMinutes: 10,
    });
    const simulation = simulateCandidate(settings, [property], [121]);
    const evaluation = evaluateTimeline(
      settings,
      [property],
      [property],
      simulation,
    );

    expectIssueCodes(evaluation, ["time_window_conflict"]);
    expect(evaluation.conflicts[0].parameters).toEqual({
      earliestStart: 780,
      latestStart: 900,
      actualStart: 901,
      lateByMinutes: 1,
    });
  });

  it("uses an already normalized finish-before latestStart", () => {
    const settings = createSettings({ earliestStart: 780 });
    const property = createProperty("A", {
      viewingTime: windowViewingTime(780, 990, "finish_before"),
      durationMinutes: 30,
    });
    const boundarySimulation = simulateCandidate(
      settings,
      [property],
      [210],
    );
    const lateSimulation = simulateCandidate(settings, [property], [211]);

    expect(
      evaluateTimeline(
        settings,
        [property],
        [property],
        boundarySimulation,
      ),
    ).toEqual({ hardViolationCount: 0, violations: [], conflicts: [] });
    expectIssueCodes(
      evaluateTimeline(
        settings,
        [property],
        [property],
        lateSimulation,
      ),
      ["time_window_conflict"],
    );
  });

  it("enforces a normalized flexible window without treating it as fixed", () => {
    const settings = createSettings();
    const property = createProperty("A", {
      viewingTime: flexibleViewingTime(540, 600),
      durationMinutes: 10,
    });
    const boundarySimulation = simulateCandidate(settings, [property], [60]);
    const lateSimulation = simulateCandidate(settings, [property], [61]);

    expect(
      evaluateTimeline(
        settings,
        [property],
        [property],
        boundarySimulation,
      ),
    ).toEqual({ hardViolationCount: 0, violations: [], conflicts: [] });
    expectIssueCodes(
      evaluateTimeline(settings, [property], [property], lateSimulation),
      ["time_window_conflict"],
    );
  });

  it("does not invent a time constraint for unconfirmed input", () => {
    const settings = createSettings();
    const property = createProperty("A", {
      viewingTime: unconfirmedViewingTime(),
    });
    const simulation = simulateCandidate(settings, [property], [500]);

    expect(
      evaluateTimeline(settings, [property], [property], simulation),
    ).toEqual({ hardViolationCount: 0, violations: [], conflicts: [] });
  });
});

describe("latestEnd constraints", () => {
  it("passes when estimatedEndAt equals latestEnd", () => {
    const settings = createSettings({ latestEnd: 580 });
    const property = createProperty("A", { durationMinutes: 30 });
    const simulation = simulateCandidate(settings, [property], [10]);

    expect(simulation.totals.estimatedEndAt).toBe(580);
    expect(
      evaluateTimeline(settings, [property], [property], simulation),
    ).toEqual({ hardViolationCount: 0, violations: [], conflicts: [] });
  });

  it("emits one route-level issue at latestEnd plus one without mutation", () => {
    const settings = createSettings({ latestEnd: 579 });
    const property = createProperty("A", { durationMinutes: 30 });
    const simulation = simulateCandidate(settings, [property], [10]);
    const snapshot = JSON.stringify(simulation);
    const evaluation = evaluateTimeline(
      settings,
      [property],
      [property],
      simulation,
    );

    expectIssueCodes(evaluation, ["end_time_exceeded"]);
    expect(evaluation.conflicts[0]).toEqual({
      kind: "conflict",
      code: "end_time_exceeded",
      propertyIds: [],
      parameters: {
        latestEnd: 579,
        estimatedEndAt: 580,
        exceededByMinutes: 1,
      },
    });
    expect(JSON.stringify(simulation)).toBe(snapshot);
  });
});

describe("must-visit preservation", () => {
  it("does not emit must_visit_unscheduled for a present must property", () => {
    const settings = createSettings();
    const property = createProperty("A", { importance: "must" });
    const simulation = simulateCandidate(settings, [property], [10]);

    expect(
      evaluateTimeline(settings, [property], [property], simulation),
    ).toEqual({ hardViolationCount: 0, violations: [], conflicts: [] });
  });

  it("emits one issue for an omitted must and none for an omitted optional property", () => {
    const settings = createSettings();
    const mustProperty = createProperty("A", { importance: "must" });
    const candidateProperty = createProperty("B");
    const omittedOptionalProperty = createProperty("C");
    const simulation = simulateCandidate(
      settings,
      [candidateProperty],
      [10],
    );
    const evaluation = evaluateTimeline(
      settings,
      [mustProperty, candidateProperty, omittedOptionalProperty],
      [candidateProperty],
      simulation,
    );

    expectIssueCodes(evaluation, ["must_visit_unscheduled"]);
    expect(evaluation.conflicts[0]).toEqual({
      kind: "conflict",
      code: "must_visit_unscheduled",
      propertyIds: ["A"],
      parameters: { reason: "not_in_candidate" },
    });
  });

  it("allows an empty candidate when no assigned property is must", () => {
    const settings = createSettings();
    const optionalProperty = createProperty("A");
    const simulation = simulateCandidate(settings, [], []);

    expect(
      evaluateTimeline(settings, [optionalProperty], [], simulation),
    ).toEqual({ hardViolationCount: 0, violations: [], conflicts: [] });
  });

  it("does not add must_visit_unscheduled when a present must violates its window", () => {
    const settings = createSettings({ earliestStart: 780 });
    const property = createProperty("A", {
      importance: "must",
      viewingTime: windowViewingTime(780, 900),
      durationMinutes: 10,
    });
    const simulation = simulateCandidate(settings, [property], [121]);
    const evaluation = evaluateTimeline(
      settings,
      [property],
      [property],
      simulation,
    );

    expectIssueCodes(evaluation, ["time_window_conflict"]);
  });
});

describe("travel-data constraints", () => {
  it("emits missing-edge issues in candidate leg order without reverse fallback", () => {
    const settings = createSettings();
    const properties = [createProperty("A"), createProperty("B")];
    const reverseEdge = createEdge(
      properties[1].locationId,
      properties[0].locationId,
    );
    const evaluation = evaluateTravelDataConstraints({
      settings,
      orderedProperties: properties,
      transportModes: ["transit", "transit"],
      travelMatrix: createMatrix(reverseEdge),
    });

    expectIssueCodes(evaluation, [
      "travel_data_unavailable",
      "travel_data_unavailable",
    ]);
    expect(evaluation.conflicts.map((issue) => issue.propertyIds)).toEqual([
      ["A"],
      ["B"],
    ]);
    expect(evaluation.conflicts.map((issue) => issue.parameters.reason)).toEqual([
      "missing_edge",
      "missing_edge",
    ]);
  });

  it("reports an unavailable selected mode without switching to available taxi", async () => {
    const matrix = await buildFixtureTravelMatrix(CASE16_TAXI_ONLY);
    const property = createProperty("A", { locationId: "property-a" });
    const evaluation = evaluateTravelDataConstraints({
      settings: createSettings(),
      orderedProperties: [property],
      transportModes: ["transit"],
      travelMatrix: matrix,
    });

    expectIssueCodes(evaluation, ["travel_data_unavailable"]);
    expect(evaluation.conflicts[0].parameters).toEqual({
      fromLocationId: "origin",
      toLocationId: "property-a",
      transportMode: "transit",
      reason: "selected_mode_unavailable",
    });
  });

  it("passes when the selected other mode is usable", async () => {
    const matrix = await buildFixtureTravelMatrix(CASE16_TAXI_ONLY);
    const property = createProperty("A", { locationId: "property-a" });

    expect(
      evaluateTravelDataConstraints({
        settings: createSettings(),
        orderedProperties: [property],
        transportModes: ["taxi"],
        travelMatrix: matrix,
      }),
    ).toEqual({ hardViolationCount: 0, violations: [], conflicts: [] });
  });

  it("treats a degraded selected mode as usable without risk output", async () => {
    const matrix = await buildFixtureTravelMatrix(
      TRANSIT_DEGRADED_SCENARIO,
    );
    const property = createProperty("A", { locationId: "property-a" });
    const evaluation = evaluateTravelDataConstraints({
      settings: createSettings(),
      orderedProperties: [property],
      transportModes: ["transit"],
      travelMatrix: matrix,
    });

    expect(evaluation).toEqual({
      hardViolationCount: 0,
      violations: [],
      conflicts: [],
    });
    expect(JSON.stringify(evaluation)).not.toContain("risk");
  });

  it("reports provider failure once for the selected leg", async () => {
    const matrix = await buildFixtureTravelMatrix(CASE16_PROVIDER_FAILURE);
    const property = createProperty("A", { locationId: "property-a" });
    const evaluation = evaluateTravelDataConstraints({
      settings: createSettings(),
      orderedProperties: [property],
      transportModes: ["transit"],
      travelMatrix: matrix,
    });

    expectIssueCodes(evaluation, ["travel_data_unavailable"]);
    expect(evaluation.conflicts[0].parameters.reason).toBe(
      "provider_failure",
    );
  });

  it("rejects a mode-sequence length mismatch as evaluator wiring error", () => {
    const property = createProperty("A");

    expect(() =>
      evaluateTravelDataConstraints({
        settings: createSettings(),
        orderedProperties: [property],
        transportModes: [],
        travelMatrix: createMatrix(),
      }),
    ).toThrow("transportModes length must equal orderedProperties length");
  });

  it("does not enforce transport strategy or taxi budget", () => {
    const property = createProperty("A");
    const settings = createSettings({
      transportStrategy: "transit_only",
      taxiBudget: Object.freeze({ type: "capped", amount: 0 }),
    });
    const matrix = createMatrix(
      createEdge(settings.originLocationId, property.locationId),
    );

    expect(
      evaluateTravelDataConstraints({
        settings,
        orderedProperties: [property],
        transportModes: ["taxi"],
        travelMatrix: matrix,
      }),
    ).toEqual({ hardViolationCount: 0, violations: [], conflicts: [] });
  });
});

describe("constraint ordering and structural alignment", () => {
  it("orders must omission, stop timing, and latestEnd issues deterministically", () => {
    const settings = createSettings({ earliestStart: 780, latestEnd: 905 });
    const omittedMust = createProperty("M", { importance: "must" });
    const windowProperty = createProperty("W", {
      viewingTime: windowViewingTime(780, 900),
      durationMinutes: 10,
    });
    const simulation = simulateCandidate(settings, [windowProperty], [121]);
    const evaluation = evaluateTimeline(
      settings,
      [omittedMust, windowProperty],
      [windowProperty],
      simulation,
    );

    expectIssueCodes(evaluation, [
      "must_visit_unscheduled",
      "time_window_conflict",
      "end_time_exceeded",
    ]);
  });

  it("throws RangeError for stop count, property order, or departure mismatch", () => {
    const settings = createSettings();
    const property = createProperty("A");
    const simulation = simulateCandidate(settings, [property], [10]);
    const noStops: SimulationResult = Object.freeze({
      ...simulation,
      stops: Object.freeze([]),
    });
    const wrongProperty: SimulationResult = Object.freeze({
      ...simulation,
      stops: Object.freeze([
        Object.freeze({ ...simulation.stops[0], propertyId: "wrong" }),
      ]),
    });
    const wrongDeparture: SimulationResult = Object.freeze({
      ...simulation,
      departureAt: settings.earliestStart + 1,
    });

    expect(() =>
      evaluateTimeline(settings, [property], [property], noStops),
    ).toThrow("Simulation stop count must equal orderedProperties length");
    expect(() =>
      evaluateTimeline(settings, [property], [property], wrongProperty),
    ).toThrow("Simulation property order mismatch at index 0");
    expect(() =>
      evaluateTimeline(settings, [property], [property], wrongDeparture),
    ).toThrow("Simulation departureAt must equal settings.earliestStart");
  });

  it("never emits late_risk for a tight but compliant candidate", () => {
    const settings = createSettings({ earliestStart: 780 });
    const property = createProperty("A", {
      viewingTime: windowViewingTime(780, 900),
      durationMinutes: 10,
    });
    const simulation = simulateCandidate(settings, [property], [120]);
    const evaluation = evaluateTimeline(
      settings,
      [property],
      [property],
      simulation,
    );

    expect(evaluation).toEqual({
      hardViolationCount: 0,
      violations: [],
      conflicts: [],
    });
    expect(JSON.stringify(evaluation)).not.toContain("late_risk");
  });
});

describe("constraint purity and immutability", () => {
  it("does not mutate any frozen evaluator input", () => {
    const settings = createSettings({ earliestStart: 780, latestEnd: 905 });
    const omittedMust = createProperty("M", { importance: "must" });
    const property = createProperty("A", {
      viewingTime: windowViewingTime(780, 900),
      durationMinutes: 10,
    });
    const assignedProperties = Object.freeze([omittedMust, property]);
    const orderedProperties = Object.freeze([property]);
    const transportModes = Object.freeze(["transit" as const]);
    const travelMatrix = createTransitMatrixForOrder(
      settings,
      orderedProperties,
      [121],
    );
    const simulation = simulateTimeline({
      settings,
      orderedProperties,
      transportModes,
      travelMatrix,
    });
    const snapshot = JSON.stringify({
      settings,
      assignedProperties,
      orderedProperties,
      transportModes,
      travelMatrix,
      simulation,
    });

    evaluateTravelDataConstraints({
      settings,
      orderedProperties,
      transportModes,
      travelMatrix,
    });
    evaluateTimelineConstraints({
      settings,
      assignedProperties,
      orderedProperties,
      simulation,
    });

    expect(
      JSON.stringify({
        settings,
        assignedProperties,
        orderedProperties,
        transportModes,
        travelMatrix,
        simulation,
      }),
    ).toBe(snapshot);
  });

  it("runtime-freezes paired issues and every output collection", () => {
    const settings = createSettings();
    const mustProperty = createProperty("A", { importance: "must" });
    const simulation = simulateCandidate(settings, [], []);
    const evaluation = evaluateTimeline(
      settings,
      [mustProperty],
      [],
      simulation,
    );

    expect(Object.isFrozen(evaluation)).toBe(true);
    expect(Object.isFrozen(evaluation.violations)).toBe(true);
    expect(Object.isFrozen(evaluation.conflicts)).toBe(true);
    expect(Object.isFrozen(evaluation.violations[0])).toBe(true);
    expect(Object.isFrozen(evaluation.conflicts[0])).toBe(true);
    expect(Object.isFrozen(evaluation.violations[0].propertyIds)).toBe(true);
    expect(Object.isFrozen(evaluation.conflicts[0].propertyIds)).toBe(true);
    expect(Object.isFrozen(evaluation.violations[0].parameters)).toBe(true);
    expect(Object.isFrozen(evaluation.conflicts[0].parameters)).toBe(true);
  });

  it("returns deeply equal evaluations for repeated identical inputs", () => {
    const settings = createSettings({ earliestStart: 780, latestEnd: 905 });
    const omittedMust = createProperty("M", { importance: "must" });
    const property = createProperty("A", {
      viewingTime: windowViewingTime(780, 900),
      durationMinutes: 10,
    });
    const simulation = simulateCandidate(settings, [property], [121]);
    const input = {
      settings,
      assignedProperties: [omittedMust, property],
      orderedProperties: [property],
      simulation,
    };

    expect(evaluateTimelineConstraints(input)).toEqual(
      evaluateTimelineConstraints(input),
    );
  });
});

const transportModeTypeCheck: TransportMode = "transit";
void transportModeTypeCheck;
