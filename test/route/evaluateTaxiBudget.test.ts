import { describe, expect, it } from "vitest";

import { evaluateTaxiBudget } from "../../src/lib/route/evaluateTaxiBudget";
import { simulateTimeline } from "../../src/lib/route/simulateTimeline";
import type {
  DayPlanSettings,
  NormalizedProperty,
  SimulationResult,
  TaxiBudget,
} from "../../src/lib/route/types";
import type {
  TravelEdge,
  TravelMatrix,
} from "../../src/lib/travel/types";

function createSimulation(taxiCost: number): SimulationResult {
  return Object.freeze({
    status: "simulated",
    departureAt: 540,
    stops: Object.freeze([]),
    totals: Object.freeze({
      completedCount: 0,
      mustCompletedCount: 0,
      totalTravelMinutes: 0,
      totalWaitingMinutes: 0,
      estimatedEndAt: 540,
      taxiCost,
      taxiLegCount: taxiCost > 0 ? 1 : 0,
    }),
  });
}

function createProperty(id: string): NormalizedProperty {
  return Object.freeze({
    id,
    address: `${id} address`,
    displayName: id,
    locationId: `location-${id}`,
    viewingTime: Object.freeze({ type: "unconfirmed" as const, window: null }),
    importance: "if_time",
    durationMinutes: 10,
    status: "pending",
  });
}

function createTaxiEdge(
  fromLocationId: string,
  toLocationId: string,
  taxiCost: number,
): TravelEdge {
  return Object.freeze({
    fromLocationId,
    toLocationId,
    transit: Object.freeze({ status: "unavailable" as const }),
    taxi: Object.freeze({
      status: "available" as const,
      durationMinutes: 5,
      cost: taxiCost,
    }),
    dataStatus: "degraded" as const,
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

function evaluate(taxiBudget: TaxiBudget, taxiCost: number) {
  return evaluateTaxiBudget({
    taxiBudget,
    simulation: createSimulation(taxiCost),
  });
}

describe("evaluateTaxiBudget daily policy", () => {
  it("keeps unset distinct while allowing positive spend above the example cap", () => {
    const taxiBudget = Object.freeze({ type: "unset" as const });
    const result = evaluate(taxiBudget, 75);

    expect(result).toEqual({
      hardViolationCount: 0,
      violations: [],
      conflicts: [],
    });
    expect(taxiBudget).toEqual({ type: "unset" });
  });

  it("keeps unlimited distinct while allowing positive spend", () => {
    const taxiBudget = Object.freeze({ type: "unlimited" as const });
    const result = evaluate(taxiBudget, 125);

    expect(result.hardViolationCount).toBe(0);
    expect(taxiBudget).toEqual({ type: "unlimited" });
  });

  it.each([0, 59, 60])(
    "passes capped amount 60 for taxiCost %s",
    (taxiCost) => {
      expect(
        evaluate(Object.freeze({ type: "capped", amount: 60 }), taxiCost),
      ).toEqual({
        hardViolationCount: 0,
        violations: [],
        conflicts: [],
      });
    },
  );

  it("emits one hard route-level issue immediately above the cap", () => {
    const result = evaluate(
      Object.freeze({ type: "capped", amount: 60 }),
      60.01,
    );

    expect(result).toMatchObject({
      hardViolationCount: 1,
      violations: [{
        kind: "violation",
        code: "taxi_budget_exceeded",
        severity: "error",
        propertyIds: [],
        parameters: {
          budgetAmount: 60,
          taxiCost: 60.01,
          budgetType: "capped",
        },
      }],
      conflicts: [{
        kind: "conflict",
        code: "taxi_budget_exceeded",
        propertyIds: [],
        parameters: {
          budgetAmount: 60,
          taxiCost: 60.01,
          budgetType: "capped",
        },
      }],
    });
    expect(result.violations[0].parameters.exceededBy).toBeCloseTo(0.01);
    expect(result.conflicts[0].parameters.exceededBy).toBeCloseTo(0.01);
  });

  it("passes a zero cap at zero spend", () => {
    expect(
      evaluate(Object.freeze({ type: "capped", amount: 0 }), 0)
        .hardViolationCount,
    ).toBe(0);
  });

  it("fails a zero cap for positive spend", () => {
    expect(
      evaluate(Object.freeze({ type: "capped", amount: 0 }), 0.01),
    ).toMatchObject({
      hardViolationCount: 1,
      conflicts: [{ code: "taxi_budget_exceeded" }],
    });
  });

  it("uses the aggregate CE-07 taxi total across any number of taxi legs", () => {
    const properties = Object.freeze([
      createProperty("A"),
      createProperty("B"),
      createProperty("C"),
    ]);
    const matrix = createMatrix(
      createTaxiEdge("origin", "location-A", 25),
      createTaxiEdge("location-A", "location-B", 30),
      createTaxiEdge("location-B", "location-C", 10),
    );
    const settings: DayPlanSettings = Object.freeze({
      date: "2026-09-20",
      originLocationId: "origin",
      earliestStart: 540,
      latestEnd: 1080,
      transportStrategy: "efficiency_first",
      taxiBudget: Object.freeze({ type: "capped", amount: 60 }),
      fixedAppointmentBufferMinutes: 15,
      routePreferences: Object.freeze([]),
    });
    const twoLegSimulation = simulateTimeline({
      settings,
      orderedProperties: properties.slice(0, 2),
      transportModes: Object.freeze(["taxi", "taxi"]),
      travelMatrix: matrix,
    });
    const threeLegSimulation = simulateTimeline({
      settings,
      orderedProperties: properties,
      transportModes: Object.freeze(["taxi", "taxi", "taxi"]),
      travelMatrix: matrix,
    });

    expect(twoLegSimulation.totals.taxiCost).toBe(55);
    expect(
      evaluateTaxiBudget({
        taxiBudget: settings.taxiBudget,
        simulation: twoLegSimulation,
      }).hardViolationCount,
    ).toBe(0);
    expect(threeLegSimulation.totals.taxiCost).toBe(65);
    expect(
      evaluateTaxiBudget({
        taxiBudget: settings.taxiBudget,
        simulation: threeLegSimulation,
      }).conflicts[0].parameters,
    ).toMatchObject({ taxiCost: 65, budgetAmount: 60, exceededBy: 5 });
  });
});

describe("evaluateTaxiBudget internal evidence protection", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects malformed authoritative taxiCost %s",
    (taxiCost) => {
      expect(() =>
        evaluate(Object.freeze({ type: "unset" }), taxiCost),
      ).toThrow(RangeError);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects malformed capped amount %s",
    (amount) => {
      expect(() =>
        evaluate(Object.freeze({ type: "capped", amount }), 10),
      ).toThrow(RangeError);
    },
  );

  it("freezes all output, preserves frozen input, and is repeatable", () => {
    const taxiBudget = Object.freeze({ type: "capped" as const, amount: 20 });
    const simulation = createSimulation(25);
    const input = Object.freeze({ taxiBudget, simulation });
    const first = evaluateTaxiBudget(input);
    const second = evaluateTaxiBudget(input);

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.violations)).toBe(true);
    expect(Object.isFrozen(first.conflicts)).toBe(true);
    expect(Object.isFrozen(first.violations[0])).toBe(true);
    expect(Object.isFrozen(first.conflicts[0])).toBe(true);
    expect(Object.isFrozen(first.violations[0].propertyIds)).toBe(true);
    expect(Object.isFrozen(first.conflicts[0].propertyIds)).toBe(true);
    expect(Object.isFrozen(first.violations[0].parameters)).toBe(true);
    expect(Object.isFrozen(first.conflicts[0].parameters)).toBe(true);
    expect(input.taxiBudget).toEqual({ type: "capped", amount: 20 });
    expect(input.simulation.totals.taxiCost).toBe(25);
  });
});
