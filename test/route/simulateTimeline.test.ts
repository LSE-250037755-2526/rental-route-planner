import { describe, expect, it } from "vitest";

import {
  simulateTimeline,
  type SimulateTimelineInput,
} from "../../src/lib/route/simulateTimeline";
import type {
  DayPlanSettings,
  NormalizedProperty,
  NormalizedViewingTime,
  RouteStop,
  TransportMode,
} from "../../src/lib/route/types";
import { travelFixture } from "../../src/lib/travel/MockTravelTimeProvider";
import type { TravelMatrix } from "../../src/lib/travel/types";
import { createFrozenTravelResult } from "../fixtures/travel/results";
import {
  ASYMMETRIC_TRAVEL_SCENARIO,
  CASE16_TAXI_ONLY,
  TRANSIT_DEGRADED_SCENARIO,
  buildFixtureTravelMatrix,
  createTravelFixtureScenario,
} from "../fixtures/travel/scenarios";

const TARGET_DATE = "2026-09-20";
const EMPTY_ROUTE_PREFERENCES = Object.freeze([]);
const EMPTY_TRAVEL_MATRIX: TravelMatrix = Object.freeze({
  edgesByFrom: Object.freeze({}),
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

function unconfirmedViewingTime(): NormalizedViewingTime {
  return Object.freeze({ type: "unconfirmed", window: null });
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

function createProperty(
  id: string,
  locationId: string,
  overrides: Partial<NormalizedProperty> = {},
): NormalizedProperty {
  return Object.freeze({
    id,
    address: `${id} address`,
    displayName: id,
    locationId,
    viewingTime: unconfirmedViewingTime(),
    importance: "if_time",
    durationMinutes: 30,
    status: "pending",
    ...overrides,
  });
}

function availableTravelResult(
  transitMinutes: number,
  options: Readonly<{
    transitCost?: number;
    transitStatus?: "available" | "degraded";
    taxiMinutes?: number;
    taxiCost?: number;
    taxiStatus?: "available" | "degraded";
  }> = {},
) {
  return createFrozenTravelResult({
    transit: {
      status: options.transitStatus ?? "available",
      durationMinutes: transitMinutes,
      cost: options.transitCost ?? 3,
      transferCount: 0,
      walkMeters: 0,
    },
    taxi: {
      status: options.taxiStatus ?? "available",
      durationMinutes: options.taxiMinutes ?? transitMinutes,
      cost: options.taxiCost ?? 10,
    },
  });
}

async function buildMatrix(
  propertyLocationIds: readonly string[],
  edges: readonly Readonly<{
    fromLocationId: string;
    toLocationId: string;
    transitMinutes: number;
    transitCost?: number;
    taxiMinutes?: number;
    taxiCost?: number;
  }>[],
  originLocationId = "origin",
): Promise<TravelMatrix> {
  return buildFixtureTravelMatrix(
    createTravelFixtureScenario({
      originLocationId,
      propertyLocationIds,
      fixtures: edges.map((edge) =>
        travelFixture(
          edge.fromLocationId,
          edge.toLocationId,
          availableTravelResult(edge.transitMinutes, {
            transitCost: edge.transitCost,
            taxiMinutes: edge.taxiMinutes,
            taxiCost: edge.taxiCost,
          }),
        ),
      ),
    }),
  );
}

function inputWith(
  travelMatrix: TravelMatrix,
  orderedProperties: readonly NormalizedProperty[],
  transportModes: readonly TransportMode[],
  settings: DayPlanSettings = createSettings(),
): SimulateTimelineInput {
  return { settings, orderedProperties, transportModes, travelMatrix };
}

describe("simulateTimeline basic mechanics", () => {
  it("simulates one unconfirmed stop from the daily departure", async () => {
    const matrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const property = createProperty("A", "property-a");

    expect(simulateTimeline(inputWith(matrix, [property], ["transit"]))).toEqual({
      status: "simulated",
      departureAt: 540,
      stops: [
        {
          propertyId: "A",
          order: 1,
          travelFromLocationId: "origin",
          travelMode: "transit",
          travelMinutes: 18,
          travelCost: 3,
          arrivalAt: 558,
          waitingMinutes: 0,
          viewingStartAt: 558,
          viewingEndAt: 588,
          bufferMinutes: null,
          reasonCodes: [],
          riskCodes: [],
        },
      ],
      totals: {
        completedCount: 1,
        mustCompletedCount: 0,
        totalTravelMinutes: 18,
        totalWaitingMinutes: 0,
        estimatedEndAt: 588,
        taxiCost: 0,
        taxiLegCount: 0,
      },
    });
  });

  it("chains each later leg from the prior viewing end and location", async () => {
    const matrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const properties = [
      createProperty("A", "property-a"),
      createProperty("B", "property-b", { durationMinutes: 20 }),
    ];

    const result = simulateTimeline(
      inputWith(matrix, properties, ["transit", "transit"]),
    );

    expect(result.stops.map((stop) => ({
      order: stop.order,
      from: stop.travelFromLocationId,
      mode: stop.travelMode,
      travel: stop.travelMinutes,
      arrival: stop.arrivalAt,
      start: stop.viewingStartAt,
      end: stop.viewingEndAt,
    }))).toEqual([
      {
        order: 1,
        from: "origin",
        mode: "transit",
        travel: 18,
        arrival: 558,
        start: 558,
        end: 588,
      },
      {
        order: 2,
        from: "property-a",
        mode: "transit",
        travel: 18,
        arrival: 606,
        start: 606,
        end: 626,
      },
    ]);
  });

  it("rejects a transport-mode length mismatch as a structural precondition", () => {
    const property = createProperty("A", "property-a");

    expect(() =>
      simulateTimeline(inputWith(EMPTY_TRAVEL_MATRIX, [property], [])),
    ).toThrow(RangeError);
    expect(() =>
      simulateTimeline(inputWith(EMPTY_TRAVEL_MATRIX, [], ["transit"])),
    ).toThrow("transportModes length must equal orderedProperties length");
  });
});

describe("simulateTimeline waiting and viewing windows", () => {
  it("waits exactly until an ordinary window earliest start", async () => {
    const matrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const property = createProperty("A", "property-a", {
      viewingTime: windowViewingTime(600, 660),
    });
    const result = simulateTimeline(
      inputWith(matrix, [property], ["transit"]),
    );

    expect(result.stops[0]).toMatchObject({
      arrivalAt: 558,
      waitingMinutes: 42,
      viewingStartAt: 600,
      viewingEndAt: 630,
      bufferMinutes: null,
    });
    expect(result.totals.totalWaitingMinutes).toBe(42);
  });

  it("starts immediately when arrival is inside an ordinary window", async () => {
    const matrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const property = createProperty("A", "property-a", {
      viewingTime: windowViewingTime(550, 600),
    });
    const stop = simulateTimeline(
      inputWith(matrix, [property], ["transit"]),
    ).stops[0];

    expect(stop).toMatchObject({
      arrivalAt: 558,
      waitingMinutes: 0,
      viewingStartAt: 558,
    });
  });

  it("keeps an arrival after latestStart mechanically visible", async () => {
    const matrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const property = createProperty("A", "property-a", {
      viewingTime: windowViewingTime(780, 900),
      durationMinutes: 20,
    });
    const result = simulateTimeline(
      inputWith(
        matrix,
        [property],
        ["transit"],
        createSettings({ earliestStart: 892 }),
      ),
    );

    expect(result.stops[0]).toMatchObject({
      arrivalAt: 910,
      waitingMinutes: 0,
      viewingStartAt: 910,
      viewingEndAt: 930,
    });
    expect(result.status).toBe("simulated");
    expect("conflicts" in result).toBe(false);
  });

  it("applies the same earliest-start waiting mechanics to flexible input", async () => {
    const matrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const property = createProperty("A", "property-a", {
      viewingTime: flexibleViewingTime(600, 900),
    });
    const stop = simulateTimeline(
      inputWith(matrix, [property], ["transit"]),
    ).stops[0];

    expect(stop).toMatchObject({
      arrivalAt: 558,
      waitingMinutes: 42,
      viewingStartAt: 600,
      bufferMinutes: null,
    });
  });

  it("uses an unconfirmed arrival immediately without inventing an anchor", async () => {
    const matrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const stop = simulateTimeline(
      inputWith(
        matrix,
        [createProperty("A", "property-a")],
        ["transit"],
      ),
    ).stops[0];

    expect(stop).toMatchObject({
      arrivalAt: 558,
      waitingMinutes: 0,
      viewingStartAt: 558,
      bufferMinutes: null,
    });
  });
});

describe("simulateTimeline fixed appointments", () => {
  it("waits for an early fixed appointment and records the actual buffer", async () => {
    const matrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const property = createProperty("A", "property-a", {
      viewingTime: fixedViewingTime(600),
    });
    const stop = simulateTimeline(
      inputWith(matrix, [property], ["transit"]),
    ).stops[0];

    expect(stop).toMatchObject({
      arrivalAt: 558,
      waitingMinutes: 42,
      viewingStartAt: 600,
      viewingEndAt: 630,
      bufferMinutes: 42,
    });
  });

  it("preserves a ten-minute fixed buffer shortfall without enforcement", async () => {
    const matrix = await buildMatrix(["property-a"], [
      {
        fromLocationId: "origin",
        toLocationId: "property-a",
        transitMinutes: 50,
      },
    ]);
    const property = createProperty("A", "property-a", {
      viewingTime: fixedViewingTime(600),
    });
    const result = simulateTimeline(
      inputWith(matrix, [property], ["transit"]),
    );

    expect(result.departureAt).toBe(540);
    expect(result.stops[0]).toMatchObject({
      arrivalAt: 590,
      waitingMinutes: 10,
      viewingStartAt: 600,
      bufferMinutes: 10,
      reasonCodes: [],
      riskCodes: [],
    });
  });

  it("keeps a late fixed appointment monotonic with zero buffer", async () => {
    const matrix = await buildMatrix(["property-a"], [
      {
        fromLocationId: "origin",
        toLocationId: "property-a",
        transitMinutes: 65,
      },
    ]);
    const property = createProperty("A", "property-a", {
      viewingTime: fixedViewingTime(600),
    });
    const result = simulateTimeline(
      inputWith(matrix, [property], ["transit"]),
    );

    expect(result.stops[0]).toMatchObject({
      arrivalAt: 605,
      waitingMinutes: 0,
      viewingStartAt: 605,
      viewingEndAt: 635,
      bufferMinutes: 0,
    });
    expect("conflicts" in result).toBe(false);
  });
});

describe("simulateTimeline transport data and totals", () => {
  it("sums both modes for travel but only taxi legs for taxi totals", async () => {
    const matrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const properties = [
      createProperty("A", "property-a"),
      createProperty("B", "property-b", { durationMinutes: 20 }),
    ];
    const result = simulateTimeline(
      inputWith(matrix, properties, ["transit", "taxi"]),
    );

    expect(result.stops.map((stop) => stop.travelCost)).toEqual([3, 18]);
    expect(result.stops.map((stop) => stop.travelMinutes)).toEqual([18, 8]);
    expect(result.totals).toMatchObject({
      completedCount: 2,
      totalTravelMinutes: 26,
      taxiCost: 18,
      taxiLegCount: 1,
    });
  });

  it("uses degraded selected-mode data exactly without emitting risk", async () => {
    const matrix = await buildFixtureTravelMatrix(
      TRANSIT_DEGRADED_SCENARIO,
    );
    const result = simulateTimeline(
      inputWith(
        matrix,
        [createProperty("A", "property-a")],
        ["transit"],
      ),
    );

    expect(result.stops[0]).toMatchObject({
      travelMinutes: 31,
      travelCost: 5.5,
      arrivalAt: 571,
      riskCodes: [],
    });
  });

  it("rejects an unavailable selected mode without falling back", async () => {
    const matrix = await buildFixtureTravelMatrix(CASE16_TAXI_ONLY);
    const input = inputWith(
      matrix,
      [createProperty("A", "property-a")],
      ["transit"],
    );

    expect(() => simulateTimeline(input)).toThrow(
      "Selected transit mode is unavailable for origin -> property-a",
    );
    expect(() => simulateTimeline(input)).toThrow(RangeError);
  });

  it("rejects a missing directed edge without using the reverse edge", async () => {
    const reverseOnlyMatrix = await buildMatrix(
      ["origin"],
      [
        {
          fromLocationId: "property-a",
          toLocationId: "origin",
          transitMinutes: 18,
        },
      ],
      "property-a",
    );
    const input = inputWith(
      reverseOnlyMatrix,
      [createProperty("A", "property-a")],
      ["transit"],
    );

    expect(() => simulateTimeline(input)).toThrow(
      "Missing directed TravelEdge for origin -> property-a",
    );
  });

  it("does not enforce transport strategy or taxi budget during simulation", async () => {
    const matrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const settings = createSettings({
      transportStrategy: "transit_only",
      taxiBudget: Object.freeze({ type: "capped", amount: 0 }),
    });
    const result = simulateTimeline(
      inputWith(
        matrix,
        [createProperty("A", "property-a")],
        ["taxi"],
        settings,
      ),
    );

    expect(result.stops[0]).toMatchObject({
      travelMode: "taxi",
      travelMinutes: 8,
      travelCost: 18,
    });
    expect(result.totals).toMatchObject({ taxiCost: 18, taxiLegCount: 1 });
  });

  it("counts mechanically simulated must properties without filtering status", async () => {
    const matrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const property = createProperty("A", "property-a", {
      importance: "must",
      status: "cancelled",
    });
    const result = simulateTimeline(
      inputWith(matrix, [property], ["transit"]),
    );

    expect(result.stops.map((stop) => stop.propertyId)).toEqual(["A"]);
    expect(result.totals).toMatchObject({
      completedCount: 1,
      mustCompletedCount: 1,
    });
  });
});

describe("simulateTimeline full recomputation", () => {
  it("recomputes every affected downstream timestamp from an earlier leg", async () => {
    const shortMatrix = await buildMatrix(
      ["property-a", "property-b"],
      [
        {
          fromLocationId: "origin",
          toLocationId: "property-a",
          transitMinutes: 10,
        },
        {
          fromLocationId: "property-a",
          toLocationId: "property-b",
          transitMinutes: 5,
        },
      ],
    );
    const longerMatrix = await buildMatrix(
      ["property-a", "property-b"],
      [
        {
          fromLocationId: "origin",
          toLocationId: "property-a",
          transitMinutes: 20,
        },
        {
          fromLocationId: "property-a",
          toLocationId: "property-b",
          transitMinutes: 5,
        },
      ],
    );
    const properties = [
      createProperty("A", "property-a", { durationMinutes: 10 }),
      createProperty("B", "property-b", { durationMinutes: 10 }),
    ];
    const modes = ["transit", "transit"] as const;

    const shortResult = simulateTimeline(
      inputWith(shortMatrix, properties, modes),
    );
    const longerResult = simulateTimeline(
      inputWith(longerMatrix, properties, modes),
    );

    expect(shortResult.stops.map((stop) => [
      stop.arrivalAt,
      stop.viewingStartAt,
      stop.viewingEndAt,
    ])).toEqual([
      [550, 550, 560],
      [565, 565, 575],
    ]);
    expect(longerResult.stops.map((stop) => [
      stop.arrivalAt,
      stop.viewingStartAt,
      stop.viewingEndAt,
    ])).toEqual([
      [560, 560, 570],
      [575, 575, 585],
    ]);
    expect(shortResult.totals).toMatchObject({
      totalTravelMinutes: 15,
      estimatedEndAt: 575,
    });
    expect(longerResult.totals).toMatchObject({
      totalTravelMinutes: 25,
      estimatedEndAt: 585,
    });
  });

  it("recomputes waiting so it can absorb an upstream delay", async () => {
    const earlyMatrix = await buildMatrix(["property-a"], [
      {
        fromLocationId: "origin",
        toLocationId: "property-a",
        transitMinutes: 30,
      },
    ]);
    const delayedMatrix = await buildMatrix(["property-a"], [
      {
        fromLocationId: "origin",
        toLocationId: "property-a",
        transitMinutes: 40,
      },
    ]);
    const property = createProperty("A", "property-a", {
      viewingTime: windowViewingTime(600, 660),
      durationMinutes: 10,
    });

    const earlyStop = simulateTimeline(
      inputWith(earlyMatrix, [property], ["transit"]),
    ).stops[0];
    const delayedStop = simulateTimeline(
      inputWith(delayedMatrix, [property], ["transit"]),
    ).stops[0];

    expect(earlyStop).toMatchObject({
      arrivalAt: 570,
      waitingMinutes: 30,
      viewingStartAt: 600,
      viewingEndAt: 610,
    });
    expect(delayedStop).toMatchObject({
      arrivalAt: 580,
      waitingMinutes: 20,
      viewingStartAt: 600,
      viewingEndAt: 610,
    });
  });
});

describe("simulateTimeline same-day boundaries", () => {
  it("does not truncate a mechanically valid route at settings.latestEnd", async () => {
    const matrix = await buildMatrix(["property-a"], [
      {
        fromLocationId: "origin",
        toLocationId: "property-a",
        transitMinutes: 20,
      },
    ]);
    const result = simulateTimeline(
      inputWith(
        matrix,
        [createProperty("A", "property-a")],
        ["transit"],
        createSettings({ earliestStart: 1050, latestEnd: 1080 }),
      ),
    );

    expect(result.totals.estimatedEndAt).toBe(1100);
    expect(result.stops).toHaveLength(1);
    expect(result.status).toBe("simulated");
  });

  it("accepts a final viewing end exactly at minute 1439", async () => {
    const matrix = await buildMatrix(["property-a"], [
      {
        fromLocationId: "origin",
        toLocationId: "property-a",
        transitMinutes: 9,
      },
    ]);
    const result = simulateTimeline(
      inputWith(
        matrix,
        [createProperty("A", "property-a")],
        ["transit"],
        createSettings({ earliestStart: 1400, latestEnd: 1439 }),
      ),
    );

    expect(result.stops[0].viewingEndAt).toBe(1439);
    expect(result.totals.estimatedEndAt).toBe(1439);
  });

  it("throws instead of wrapping or clamping travel and viewing at minute 1440", async () => {
    const travelOverflowMatrix = await buildMatrix(["property-a"], [
      {
        fromLocationId: "origin",
        toLocationId: "property-a",
        transitMinutes: 10,
      },
    ]);
    const viewingOverflowMatrix = await buildMatrix(["property-a"], [
      {
        fromLocationId: "origin",
        toLocationId: "property-a",
        transitMinutes: 0,
      },
    ]);
    const travelOverflowInput = inputWith(
      travelOverflowMatrix,
      [createProperty("A", "property-a", { durationMinutes: 0 })],
      ["transit"],
      createSettings({ earliestStart: 1430, latestEnd: 1439 }),
    );
    const viewingOverflowInput = inputWith(
      viewingOverflowMatrix,
      [createProperty("A", "property-a", { durationMinutes: 10 })],
      ["transit"],
      createSettings({ earliestStart: 1430, latestEnd: 1439 }),
    );

    expect(() => simulateTimeline(travelOverflowInput)).toThrow(RangeError);
    expect(() => simulateTimeline(viewingOverflowInput)).toThrow(RangeError);
    expect(() => simulateTimeline(travelOverflowInput)).toThrow(
      "Travel to property A crosses the same-day boundary",
    );
    expect(() => simulateTimeline(viewingOverflowInput)).toThrow(
      "Viewing at property A crosses the same-day boundary",
    );
  });
});

describe("simulateTimeline purity and immutability", () => {
  it("returns an immutable zero-stop simulation for an empty supplied order", () => {
    const result = simulateTimeline(
      inputWith(EMPTY_TRAVEL_MATRIX, [], [], createSettings({ earliestStart: 615 })),
    );

    expect(result).toEqual({
      status: "simulated",
      departureAt: 615,
      stops: [],
      totals: {
        completedCount: 0,
        mustCompletedCount: 0,
        totalTravelMinutes: 0,
        totalWaitingMinutes: 0,
        estimatedEndAt: 615,
        taxiCost: 0,
        taxiLegCount: 0,
      },
    });
  });

  it("does not mutate frozen settings, properties, modes, or matrix", async () => {
    const settings = createSettings();
    const property = createProperty("A", "property-a", {
      viewingTime: windowViewingTime(600, 660, "finish_before"),
    });
    const orderedProperties = Object.freeze([property]);
    const transportModes = Object.freeze(["transit" as const]);
    const travelMatrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const matrixSnapshot: unknown = JSON.parse(JSON.stringify(travelMatrix));
    const input = Object.freeze({
      settings,
      orderedProperties,
      transportModes,
      travelMatrix,
    });

    simulateTimeline(input);

    expect(settings).toEqual(createSettings());
    expect(orderedProperties).toEqual([property]);
    expect(transportModes).toEqual(["transit"]);
    expect(travelMatrix).toEqual(matrixSnapshot);
    expect(input.settings).toBe(settings);
    expect(input.orderedProperties).toBe(orderedProperties);
    expect(input.transportModes).toBe(transportModes);
    expect(input.travelMatrix).toBe(travelMatrix);
  });

  it("runtime-freezes the result, totals, stops, and code arrays", async () => {
    const matrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const result = simulateTimeline(
      inputWith(
        matrix,
        [createProperty("A", "property-a")],
        ["transit"],
      ),
    );
    const stop = result.stops[0];

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.stops)).toBe(true);
    expect(Object.isFrozen(stop)).toBe(true);
    expect(Object.isFrozen(result.totals)).toBe(true);
    expect(Object.isFrozen(stop.reasonCodes)).toBe(true);
    expect(Object.isFrozen(stop.riskCodes)).toBe(true);
    expect(() => (result.stops as RouteStop[]).push(stop)).toThrow(TypeError);
  });

  it("returns deeply equal results for repeated identical inputs", async () => {
    const matrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const input = inputWith(
      matrix,
      [createProperty("A", "property-a")],
      ["transit"],
    );

    expect(simulateTimeline(input)).toEqual(simulateTimeline(input));
  });
});
