import { describe, expect, it } from "vitest";

import {
  calculateRouteRisk,
  calculateTransitLegRisk,
  type CalculateRouteRiskInput,
  type CalculateTransitLegRiskInput,
} from "../../src/lib/route/calculateRisk";
import { ROUTE_ENGINE_CONFIG } from "../../src/lib/route/config";
import type {
  NormalizedProperty,
  RouteStop,
  SimulationResult,
  TransportMode,
} from "../../src/lib/route/types";
import type {
  TransitTravelAlternative,
  TravelEdge,
  TravelMatrix,
} from "../../src/lib/travel/types";

const TRANSIT_RISK = ROUTE_ENGINE_CONFIG.transitRisk;
const EMPTY_MATRIX: TravelMatrix = Object.freeze({
  edgesByFrom: Object.freeze({}),
});

function transitInput(
  overrides: Partial<
    Extract<CalculateTransitLegRiskInput, { transportMode: "transit" }>
  > = {},
): Extract<CalculateTransitLegRiskInput, { transportMode: "transit" }> {
  return Object.freeze({
    transportMode: "transit" as const,
    fromLocationId: "origin",
    toLocationId: "property-a",
    transferCount: 0,
    walkMeters: 0,
    bufferMinutes: null,
    ...overrides,
  });
}

function createProperty(
  id: string,
  locationId = `property-${id.toLowerCase()}`,
): NormalizedProperty {
  return Object.freeze({
    id,
    address: `${id} address`,
    displayName: id,
    locationId,
    viewingTime: Object.freeze({ type: "unconfirmed" as const, window: null }),
    importance: "if_time",
    durationMinutes: 30,
    status: "pending",
  });
}

function createStop(
  property: NormalizedProperty,
  index: number,
  overrides: Partial<RouteStop> = {},
): RouteStop {
  return Object.freeze({
    propertyId: property.id,
    order: index + 1,
    travelFromLocationId: index === 0 ? "origin" : `property-${index}`,
    travelMode: "transit" as const,
    travelMinutes: 10,
    travelCost: 3,
    arrivalAt: 550 + index * 40,
    waitingMinutes: 0,
    viewingStartAt: 550 + index * 40,
    viewingEndAt: 580 + index * 40,
    bufferMinutes: null,
    reasonCodes: Object.freeze([]),
    riskCodes: Object.freeze([]),
    ...overrides,
  });
}

function createSimulation(stops: readonly RouteStop[]): SimulationResult {
  const frozenStops = Object.freeze([...stops]);
  const taxiStops = frozenStops.filter((stop) => stop.travelMode === "taxi");

  return Object.freeze({
    status: "simulated",
    departureAt: 540,
    stops: frozenStops,
    totals: Object.freeze({
      completedCount: frozenStops.length,
      mustCompletedCount: 0,
      totalTravelMinutes: frozenStops.reduce(
        (sum, stop) => sum + stop.travelMinutes,
        0,
      ),
      totalWaitingMinutes: frozenStops.reduce(
        (sum, stop) => sum + stop.waitingMinutes,
        0,
      ),
      estimatedEndAt:
        frozenStops.at(-1)?.viewingEndAt ?? 540,
      taxiCost: taxiStops.reduce((sum, stop) => sum + stop.travelCost, 0),
      taxiLegCount: taxiStops.length,
    }),
  });
}

function transitAlternative(
  overrides: Partial<
    Extract<TransitTravelAlternative, { status: "available" | "degraded" }>
  > = {},
): Extract<
  TransitTravelAlternative,
  { status: "available" | "degraded" }
> {
  return Object.freeze({
    status: "available" as const,
    durationMinutes: 10,
    cost: 3,
    transferCount: 0,
    walkMeters: 0,
    ...overrides,
  });
}

function createEdge(
  fromLocationId: string,
  toLocationId: string,
  transit: TransitTravelAlternative = transitAlternative(),
): TravelEdge {
  return Object.freeze({
    fromLocationId,
    toLocationId,
    transit,
    taxi: Object.freeze({
      status: "available" as const,
      durationMinutes: 5,
      cost: 20,
    }),
    dataStatus:
      transit.status === "available" ? "complete" : "degraded",
    failure: null,
  });
}

function createMatrix(...edges: readonly TravelEdge[]): TravelMatrix {
  const mutableRows: Record<string, Record<string, TravelEdge>> =
    Object.create(null);

  for (const edge of edges) {
    const row = mutableRows[edge.fromLocationId] ?? Object.create(null);
    row[edge.toLocationId] = edge;
    mutableRows[edge.fromLocationId] = row;
  }

  for (const row of Object.values(mutableRows)) {
    Object.freeze(row);
  }

  return Object.freeze({ edgesByFrom: Object.freeze(mutableRows) });
}

function routeInput(
  orderedProperties: readonly NormalizedProperty[],
  stops: readonly RouteStop[],
  travelMatrix: TravelMatrix,
): CalculateRouteRiskInput {
  return Object.freeze({
    orderedProperties: Object.freeze([...orderedProperties]),
    simulation: createSimulation(stops),
    travelMatrix,
  });
}

describe("calculateTransitLegRisk configured thresholds", () => {
  it("represents TEST_CASE 05 risky and safer transit alternatives without selecting one", () => {
    const risky = calculateTransitLegRisk(
      transitInput({ transferCount: 2, walkMeters: 900, bufferMinutes: 5 }),
    );
    const safer = calculateTransitLegRisk(
      transitInput({ transferCount: 0, walkMeters: 250, bufferMinutes: 15 }),
    );

    expect(risky).toEqual({
      fromLocationId: "origin",
      toLocationId: "property-a",
      transportMode: "transit",
      score: 5,
      level: "high",
      codes: ["multiple_transfers", "long_walk", "low_buffer", "late_risk"],
    });
    expect(safer).toMatchObject({ score: 0, level: "low", codes: [] });
    expect(risky.score).toBeGreaterThan(safer.score);
  });

  it("does not trigger transfer risk below the inclusive threshold", () => {
    expect(
      calculateTransitLegRisk(
        transitInput({
          transferCount: TRANSIT_RISK.transferCountThreshold - 1,
        }),
      ),
    ).toMatchObject({ score: 0, codes: [] });
  });

  it("triggers transfer risk exactly at the inclusive threshold", () => {
    expect(
      calculateTransitLegRisk(
        transitInput({ transferCount: TRANSIT_RISK.transferCountThreshold }),
      ),
    ).toMatchObject({
      score: TRANSIT_RISK.transferRiskPoints,
      codes: ["multiple_transfers"],
    });
  });

  it("adds transfer risk points only once above the threshold", () => {
    expect(
      calculateTransitLegRisk(
        transitInput({
          transferCount: TRANSIT_RISK.transferCountThreshold + 3,
        }),
      ).score,
    ).toBe(TRANSIT_RISK.transferRiskPoints);
  });

  it("does not trigger walking risk below the inclusive threshold", () => {
    expect(
      calculateTransitLegRisk(
        transitInput({
          walkMeters: TRANSIT_RISK.walkingDistanceThresholdMeters - 1,
        }),
      ),
    ).toMatchObject({ score: 0, codes: [] });
  });

  it("triggers walking risk exactly at the inclusive threshold", () => {
    expect(
      calculateTransitLegRisk(
        transitInput({
          walkMeters: TRANSIT_RISK.walkingDistanceThresholdMeters,
        }),
      ),
    ).toMatchObject({
      score: TRANSIT_RISK.walkingRiskPoints,
      codes: ["long_walk"],
    });
  });

  it("adds walking risk points only once above the threshold", () => {
    expect(
      calculateTransitLegRisk(
        transitInput({
          walkMeters: TRANSIT_RISK.walkingDistanceThresholdMeters + 500,
        }),
      ).score,
    ).toBe(TRANSIT_RISK.walkingRiskPoints);
  });

  it("uses the warning boundary as exclusive and applies warning points below it", () => {
    const below = calculateTransitLegRisk(
      transitInput({
        bufferMinutes: TRANSIT_RISK.bufferWarningThresholdMinutes - 1,
      }),
    );
    const boundary = calculateTransitLegRisk(
      transitInput({
        bufferMinutes: TRANSIT_RISK.bufferWarningThresholdMinutes,
      }),
    );

    expect(below).toMatchObject({
      score: TRANSIT_RISK.bufferWarningRiskPoints,
      codes: ["low_buffer"],
    });
    expect(boundary).toMatchObject({ score: 0, codes: [] });
  });

  it("uses the high-risk boundary as exclusive and emits late_risk only below it", () => {
    const below = calculateTransitLegRisk(
      transitInput({
        bufferMinutes: TRANSIT_RISK.highRiskBufferThresholdMinutes - 1,
      }),
    );
    const boundary = calculateTransitLegRisk(
      transitInput({
        bufferMinutes: TRANSIT_RISK.highRiskBufferThresholdMinutes,
      }),
    );

    expect(below).toMatchObject({
      score: TRANSIT_RISK.highRiskBufferPoints,
      codes: ["low_buffer", "late_risk"],
    });
    expect(boundary).toMatchObject({
      score: TRANSIT_RISK.bufferWarningRiskPoints,
      codes: ["low_buffer"],
    });
  });

  it("does not invent buffer risk when the authoritative buffer is null", () => {
    expect(
      calculateTransitLegRisk(
        transitInput({
          transferCount: TRANSIT_RISK.transferCountThreshold,
          walkMeters: TRANSIT_RISK.walkingDistanceThresholdMeters,
          bufferMinutes: null,
        }),
      ),
    ).toMatchObject({
      score:
        TRANSIT_RISK.transferRiskPoints + TRANSIT_RISK.walkingRiskPoints,
      codes: ["multiple_transfers", "long_walk"],
    });
  });

  it("derives low, medium, and high levels from configured score boundaries", () => {
    const low = calculateTransitLegRisk(
      transitInput({ walkMeters: TRANSIT_RISK.walkingDistanceThresholdMeters }),
    );
    const medium = calculateTransitLegRisk(
      transitInput({ transferCount: TRANSIT_RISK.transferCountThreshold }),
    );
    const high = calculateTransitLegRisk(
      transitInput({
        walkMeters: TRANSIT_RISK.walkingDistanceThresholdMeters,
        bufferMinutes: TRANSIT_RISK.highRiskBufferThresholdMinutes - 1,
      }),
    );

    expect([low.score, low.level]).toEqual([
      TRANSIT_RISK.lowRiskMaximumScore,
      "low",
    ]);
    expect([medium.score, medium.level]).toEqual([
      TRANSIT_RISK.mediumRiskScore,
      "medium",
    ]);
    expect([high.score, high.level]).toEqual([
      TRANSIT_RISK.highRiskMinimumScore,
      "high",
    ]);
  });

  it("returns zero low risk for taxi without transit-derived codes", () => {
    const result = calculateTransitLegRisk({
      transportMode: "taxi",
      fromLocationId: "origin",
      toLocationId: "property-a",
    });

    expect(result).toEqual({
      fromLocationId: "origin",
      toLocationId: "property-a",
      transportMode: "taxi",
      score: 0,
      level: "low",
      codes: [],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.codes)).toBe(true);
  });

  it("emits codes in stable transfer, walk, and buffer order", () => {
    expect(
      calculateTransitLegRisk(
        transitInput({
          transferCount: TRANSIT_RISK.transferCountThreshold,
          walkMeters: TRANSIT_RISK.walkingDistanceThresholdMeters,
          bufferMinutes: TRANSIT_RISK.highRiskBufferThresholdMinutes - 1,
        }),
      ).codes,
    ).toEqual([
      "multiple_transfers",
      "long_walk",
      "low_buffer",
      "late_risk",
    ]);
  });

  it("does not emit deferred complex-transfer or transit-detour signals", () => {
    const result = calculateTransitLegRisk(
      transitInput({
        transferCount: 10,
        walkMeters: 10_000,
        bufferMinutes: 0,
      }),
    );

    expect(result.codes).not.toContain("complex_transfer");
    expect(result.codes).not.toContain("transit_detour");
  });
});

describe("calculateTransitLegRisk validation", () => {
  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid transferCount %s",
    (transferCount) => {
      expect(() =>
        calculateTransitLegRisk(transitInput({ transferCount })),
      ).toThrow(RangeError);
    },
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid walkMeters %s",
    (walkMeters) => {
      expect(() =>
        calculateTransitLegRisk(transitInput({ walkMeters })),
      ).toThrow(RangeError);
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid numeric bufferMinutes %s",
    (bufferMinutes) => {
      expect(() =>
        calculateTransitLegRisk(transitInput({ bufferMinutes })),
      ).toThrow(RangeError);
    },
  );
});

describe("calculateRouteRisk selected-leg aggregation", () => {
  it("uses an available transit edge and the CE-07 stop buffer", () => {
    const property = createProperty("A");
    const stop = createStop(property, 0, { bufferMinutes: 9 });
    const matrix = createMatrix(createEdge("origin", property.locationId));

    expect(calculateRouteRisk(routeInput([property], [stop], matrix))).toEqual({
      score: TRANSIT_RISK.highRiskBufferPoints,
      level: "medium",
      legs: [
        {
          fromLocationId: "origin",
          toLocationId: property.locationId,
          transportMode: "transit",
          score: TRANSIT_RISK.highRiskBufferPoints,
          level: "medium",
          codes: ["low_buffer", "late_risk"],
        },
      ],
    });
  });

  it("treats degraded transit data as usable risk evidence", () => {
    const property = createProperty("A");
    const stop = createStop(property, 0);
    const matrix = createMatrix(
      createEdge(
        "origin",
        property.locationId,
        transitAlternative({
          status: "degraded",
          transferCount: TRANSIT_RISK.transferCountThreshold,
          walkMeters: TRANSIT_RISK.walkingDistanceThresholdMeters,
        }),
      ),
    );

    expect(calculateRouteRisk(routeInput([property], [stop], matrix))).toMatchObject({
      score: TRANSIT_RISK.transferRiskPoints + TRANSIT_RISK.walkingRiskPoints,
      level: "high",
      legs: [
        {
          codes: ["multiple_transfers", "long_walk"],
        },
      ],
    });
  });

  it("does not infer transit_detour risk from transit duration", () => {
    const property = createProperty("A");
    const stop = createStop(property, 0, { travelMinutes: 500 });
    const matrix = createMatrix(
      createEdge(
        "origin",
        property.locationId,
        transitAlternative({ durationMinutes: 500 }),
      ),
    );
    const result = calculateRouteRisk(routeInput([property], [stop], matrix));

    expect(result.score).toBe(0);
    expect(result.legs[0].codes).not.toContain("transit_detour");
  });

  it("uses the exact directed edge instead of reverse-edge metadata", () => {
    const property = createProperty("A");
    const stop = createStop(property, 0);
    const matrix = createMatrix(
      createEdge("origin", property.locationId, transitAlternative()),
      createEdge(
        property.locationId,
        "origin",
        transitAlternative({ transferCount: 9, walkMeters: 9_000 }),
      ),
    );

    expect(calculateRouteRisk(routeInput([property], [stop], matrix)).score).toBe(0);
  });

  it("throws for a missing directed edge without reverse fallback", () => {
    const property = createProperty("A");
    const stop = createStop(property, 0);
    const reverseOnly = createMatrix(
      createEdge(property.locationId, "origin"),
    );

    expect(() =>
      calculateRouteRisk(routeInput([property], [stop], reverseOnly)),
    ).toThrow("Missing directed travel edge from origin to property-a");
  });

  it("throws when selected transit is explicitly unavailable", () => {
    const property = createProperty("A");
    const stop = createStop(property, 0);
    const matrix = createMatrix(
      createEdge(
        "origin",
        property.locationId,
        Object.freeze({ status: "unavailable" as const }),
      ),
    );

    expect(() =>
      calculateRouteRisk(routeInput([property], [stop], matrix)),
    ).toThrow("Transit data is unavailable from origin to property-a");
  });

  it("sums leg scores and preserves supplied route order", () => {
    const first = createProperty("A");
    const second = createProperty("B");
    const firstStop = createStop(first, 0);
    const secondStop = createStop(second, 1, {
      travelFromLocationId: first.locationId,
    });
    const matrix = createMatrix(
      createEdge(
        "origin",
        first.locationId,
        transitAlternative({
          transferCount: TRANSIT_RISK.transferCountThreshold,
        }),
      ),
      createEdge(first.locationId, second.locationId),
    );
    const result = calculateRouteRisk(
      routeInput([first, second], [firstStop, secondStop], matrix),
    );

    expect(result.score).toBe(TRANSIT_RISK.transferRiskPoints);
    expect(result.level).toBe("medium");
    expect(result.legs.map((leg) => leg.toLocationId)).toEqual([
      first.locationId,
      second.locationId,
    ]);
  });

  it("includes taxi legs as zero-risk legs in a mixed route", () => {
    const first = createProperty("A");
    const second = createProperty("B");
    const firstStop = createStop(first, 0);
    const secondStop = createStop(second, 1, {
      travelFromLocationId: first.locationId,
      travelMode: "taxi",
      travelCost: 20,
    });
    const matrix = createMatrix(
      createEdge(
        "origin",
        first.locationId,
        transitAlternative({
          walkMeters: TRANSIT_RISK.walkingDistanceThresholdMeters,
        }),
      ),
    );
    const result = calculateRouteRisk(
      routeInput([first, second], [firstStop, secondStop], matrix),
    );

    expect(result.score).toBe(TRANSIT_RISK.walkingRiskPoints);
    expect(result.legs.map((leg) => [leg.transportMode, leg.score])).toEqual([
      ["transit", TRANSIT_RISK.walkingRiskPoints],
      ["taxi", 0],
    ]);
  });

  it("does not require matrix data for a selected taxi leg", () => {
    const property = createProperty("A");
    const stop = createStop(property, 0, {
      travelMode: "taxi",
      travelCost: 20,
    });

    expect(calculateRouteRisk(routeInput([property], [stop], EMPTY_MATRIX))).toEqual({
      score: 0,
      level: "low",
      legs: [
        {
          fromLocationId: "origin",
          toLocationId: property.locationId,
          transportMode: "taxi",
          score: 0,
          level: "low",
          codes: [],
        },
      ],
    });
  });

  it("returns a frozen zero-risk result for an empty route", () => {
    const result = calculateRouteRisk(routeInput([], [], EMPTY_MATRIX));

    expect(result).toEqual({
      score: 0,
      level: "low",
      legs: [],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.legs)).toBe(true);
  });

  it("throws for simulation stop-count mismatch", () => {
    const property = createProperty("A");

    expect(() =>
      calculateRouteRisk(routeInput([property], [], EMPTY_MATRIX)),
    ).toThrow("Simulation stop count must equal orderedProperties length");
  });

  it("throws for simulation property-order mismatch", () => {
    const property = createProperty("A");
    const wrongProperty = createProperty("B");
    const stop = createStop(wrongProperty, 0);

    expect(() =>
      calculateRouteRisk(routeInput([property], [stop], EMPTY_MATRIX)),
    ).toThrow("Simulation property order mismatch at index 0");
  });

  it("does not impose the core-scenario property count as a route cap", () => {
    const properties = Array.from({ length: 9 }, (_, index) =>
      createProperty(String(index + 1)),
    );
    const stops = properties.map((property, index) =>
      createStop(property, index, {
        travelFromLocationId:
          index === 0 ? "origin" : properties[index - 1].locationId,
        travelMode: "taxi",
      }),
    );

    expect(calculateRouteRisk(routeInput(properties, stops, EMPTY_MATRIX))).toMatchObject({
      score: 0,
      level: "low",
    });
  });
});

describe("calculateRouteRisk purity and risk separation", () => {
  it("does not mutate frozen ordered properties, simulation, or travel matrix", () => {
    const property = createProperty("A");
    const stop = createStop(property, 0, { bufferMinutes: 5 });
    const matrix = createMatrix(
      createEdge(
        "origin",
        property.locationId,
        transitAlternative({ transferCount: 2, walkMeters: 900 }),
      ),
    );
    const input = routeInput([property], [stop], matrix);
    const snapshot = JSON.stringify(input);

    calculateRouteRisk(input);

    expect(JSON.stringify(input)).toBe(snapshot);
    expect(input.orderedProperties[0]).toBe(property);
    expect(input.simulation.stops[0]).toBe(stop);
    expect(input.travelMatrix).toBe(matrix);
  });

  it("runtime-freezes route, legs, each leg, and every code array", () => {
    const property = createProperty("A");
    const stop = createStop(property, 0, { bufferMinutes: 5 });
    const matrix = createMatrix(createEdge("origin", property.locationId));
    const result = calculateRouteRisk(routeInput([property], [stop], matrix));

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.legs)).toBe(true);
    expect(Object.isFrozen(result.legs[0])).toBe(true);
    expect(Object.isFrozen(result.legs[0].codes)).toBe(true);
    expect(() =>
      (result.legs as Array<(typeof result.legs)[number]>).push(result.legs[0]),
    ).toThrow(TypeError);
    expect(() =>
      (result.legs[0].codes as string[]).push("late_risk"),
    ).toThrow(TypeError);
    expect(() => Object.assign(result.legs[0], { score: 99 })).toThrow(
      TypeError,
    );
  });

  it("returns deeply equal results for repeated identical input", () => {
    const property = createProperty("A");
    const stop = createStop(property, 0, { bufferMinutes: 5 });
    const matrix = createMatrix(createEdge("origin", property.locationId));
    const input = routeInput([property], [stop], matrix);

    expect(calculateRouteRisk(input)).toEqual(calculateRouteRisk(input));
  });

  it("keeps late_risk descriptive and out of feasibility and ranking metrics", () => {
    const property = createProperty("A");
    const stop = createStop(property, 0, { bufferMinutes: 0 });
    const matrix = createMatrix(createEdge("origin", property.locationId));
    const result = calculateRouteRisk(routeInput([property], [stop], matrix));

    expect(result.legs[0].codes).toContain("late_risk");
    expect(Object.keys(result).sort()).toEqual(["legs", "level", "score"]);
    expect(JSON.stringify(result)).not.toContain("violation");
    expect(JSON.stringify(result)).not.toContain("conflict");
    expect(JSON.stringify(result)).not.toContain("penalty");
  });
});

const transportModeTypeCheck: TransportMode = "transit";
void transportModeTypeCheck;
