import { describe, expect, it } from "vitest";

import {
  optimizeDayRoute,
  type OptimizeDayRouteInput,
} from "../../src/lib/route/optimizeDayRoute";
import type {
  DayPlanSettings,
  DayRouteOptimizationResult,
  Property,
  RouteOption,
  TaxiBudget,
  ViewingTimeInput,
} from "../../src/lib/route/types";
import type {
  TaxiTravelAlternative,
  TransitTravelAlternative,
  TravelEdge,
  TravelMatrix,
} from "../../src/lib/travel/types";

const DATE = "2026-09-20";
const EMPTY_ROUTE_PREFERENCES = Object.freeze([]);
const UNAVAILABLE_TRANSIT: TransitTravelAlternative = Object.freeze({
  status: "unavailable",
});
const UNAVAILABLE_TAXI: TaxiTravelAlternative = Object.freeze({
  status: "unavailable",
});

function createSettings(
  overrides: Partial<DayPlanSettings> = {},
): DayPlanSettings {
  return Object.freeze({
    date: DATE,
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

function flexibleViewingTime(): ViewingTimeInput {
  return Object.freeze({ type: "flexible" });
}

function fixedViewingTime(startTime: string): ViewingTimeInput {
  return Object.freeze({ type: "fixed", date: DATE, startTime });
}

function startWindowViewingTime(
  earliestStart: string,
  latestStart: string,
): ViewingTimeInput {
  return Object.freeze({
    type: "window",
    constraint: "start_between",
    date: DATE,
    earliestStart,
    latestStart,
  });
}

function finishBeforeViewingTime(finishBy: string): ViewingTimeInput {
  return Object.freeze({
    type: "window",
    constraint: "finish_before",
    date: DATE,
    finishBy,
  });
}

function createProperty(
  id: string,
  overrides: Partial<Property> = {},
): Property {
  return Object.freeze({
    id,
    address: `${id} address`,
    locationId: `location-${id.toLowerCase()}`,
    viewingTime: flexibleViewingTime(),
    importance: "if_time",
    durationMinutes: 20,
    status: "pending",
    ...overrides,
  });
}

function transit(
  durationMinutes: number,
  overrides: Readonly<{
    status?: "available" | "degraded";
    cost?: number;
    transferCount?: number;
    walkMeters?: number;
  }> = {},
): TransitTravelAlternative {
  return Object.freeze({
    status: overrides.status ?? "available",
    durationMinutes,
    cost: overrides.cost ?? 3,
    transferCount: overrides.transferCount ?? 0,
    walkMeters: overrides.walkMeters ?? 100,
  });
}

function taxi(
  durationMinutes: number,
  cost = 20,
  status: "available" | "degraded" = "available",
): TaxiTravelAlternative {
  return Object.freeze({ status, durationMinutes, cost });
}

function createEdge(
  fromLocationId: string,
  toLocationId: string,
  alternatives: Readonly<{
    transit?: TransitTravelAlternative;
    taxi?: TaxiTravelAlternative;
    providerFailure?: boolean;
  }> = {},
): TravelEdge {
  const transitAlternative = alternatives.transit ?? transit(10);
  const taxiAlternative = alternatives.taxi ?? taxi(5);
  const dataStatus =
    transitAlternative.status === "available" &&
    taxiAlternative.status === "available"
      ? "complete"
      : transitAlternative.status === "unavailable" &&
          taxiAlternative.status === "unavailable"
        ? "unavailable"
        : "degraded";

  return Object.freeze({
    fromLocationId,
    toLocationId,
    transit: transitAlternative,
    taxi: taxiAlternative,
    dataStatus,
    failure: alternatives.providerFailure
      ? Object.freeze({ kind: "provider_failure" as const })
      : null,
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

function transitOnlyEdge(
  fromLocationId: string,
  toLocationId: string,
  durationMinutes: number,
  overrides: Parameters<typeof transit>[1] = {},
): TravelEdge {
  return createEdge(fromLocationId, toLocationId, {
    transit: transit(durationMinutes, overrides),
    taxi: UNAVAILABLE_TAXI,
  });
}

function recommendedOption(
  result: DayRouteOptimizationResult,
): RouteOption {
  if (result.status === "failure") {
    throw new Error("Expected a Daily Route option");
  }

  const option = result.options.find(({ objectiveLabels }) =>
    objectiveLabels.includes("recommended"),
  );

  if (option === undefined) {
    throw new Error("Expected Recommended option");
  }

  return option;
}

function optionWithMode(
  result: DayRouteOptimizationResult,
  mode: "transit" | "taxi",
): RouteOption {
  if (result.status === "failure") {
    throw new Error("Expected a Daily Route option");
  }

  const option = result.options.find(({ transportModes }) =>
    transportModes.includes(mode),
  );

  if (option === undefined) {
    throw new Error(`Expected option containing ${mode}`);
  }

  return option;
}

function conflictCodes(option: RouteOption): readonly string[] {
  return option.conflicts.map(({ code }) => code);
}

describe("optimizeDayRoute integrated time and order behavior", () => {
  it("implements Case 01 fixed appointments with required buffers", () => {
    const propertyA = createProperty("A", {
      importance: "must",
      durationMinutes: 20,
      viewingTime: fixedViewingTime("10:00"),
    });
    const propertyB = createProperty("B", {
      importance: "must",
      durationMinutes: 20,
      viewingTime: fixedViewingTime("11:30"),
    });
    const result = optimizeDayRoute({
      settings: createSettings({
        transportStrategy: "transit_only",
        fixedAppointmentBufferMinutes: 15,
      }),
      properties: Object.freeze([propertyA, propertyB]),
      travelMatrix: createMatrix(
        transitOnlyEdge("origin", propertyA.locationId!, 30),
        transitOnlyEdge(propertyA.locationId!, propertyB.locationId!, 30),
      ),
    });
    const recommended = recommendedOption(result);

    expect(result.status).toBe("success");
    expect(result.consideredCandidateCount).toBe(1);
    expect(recommended.status).toBe("feasible");
    expect(recommended.propertyOrder).toEqual(["A", "B"]);
    expect(recommended.simulation.stops).toMatchObject([
      { viewingStartAt: 600, viewingEndAt: 620, bufferMinutes: 30 },
      { viewingStartAt: 690, viewingEndAt: 710, bufferMinutes: 40 },
    ]);
    expect(recommended.conflicts).toEqual([]);
  });

  it("implements Case 02 by applying a normalized start window to simulation", () => {
    const property = createProperty("A", {
      viewingTime: startWindowViewingTime("10:00", "10:30"),
    });
    const result = optimizeDayRoute({
      settings: createSettings({ transportStrategy: "transit_only" }),
      properties: Object.freeze([property]),
      travelMatrix: createMatrix(
        transitOnlyEdge("origin", property.locationId!, 10),
      ),
    });
    const stop = recommendedOption(result).simulation.stops[0];

    expect(result.status).toBe("success");
    expect(stop.arrivalAt).toBe(550);
    expect(stop.waitingMinutes).toBe(50);
    expect(stop.viewingStartAt).toBe(600);
  });

  it("implements Case 03 by enforcing the derived finish-before latest start", () => {
    const property = createProperty("A", {
      durationMinutes: 30,
      viewingTime: finishBeforeViewingTime("10:00"),
    });
    const result = optimizeDayRoute({
      settings: createSettings({ transportStrategy: "transit_only" }),
      properties: Object.freeze([property]),
      travelMatrix: createMatrix(
        transitOnlyEdge("origin", property.locationId!, 40),
      ),
    });
    const recommended = recommendedOption(result);

    expect(result.status).toBe("partial");
    expect(recommended.status).toBe("conflicted");
    expect(recommended.conflicts).toMatchObject([
      {
        code: "time_window_conflict",
        propertyIds: ["A"],
        parameters: { latestStart: 570, actualStart: 580 },
      },
    ]);
    expect(result.conflicts).toBe(recommended.conflicts);
  });

  it("implements Case 04 by exploring and validating a between-anchor order", () => {
    const propertyA = createProperty("A", {
      importance: "must",
      durationMinutes: 15,
      viewingTime: fixedViewingTime("10:00"),
    });
    const propertyB = createProperty("B", {
      durationMinutes: 20,
      viewingTime: flexibleViewingTime(),
    });
    const propertyC = createProperty("C", {
      importance: "must",
      durationMinutes: 15,
      viewingTime: fixedViewingTime("12:00"),
    });
    const result = optimizeDayRoute({
      settings: createSettings({
        transportStrategy: "transit_only",
        fixedAppointmentBufferMinutes: 15,
      }),
      properties: Object.freeze([propertyA, propertyB, propertyC]),
      travelMatrix: createMatrix(
        transitOnlyEdge("origin", propertyA.locationId!, 30),
        transitOnlyEdge(propertyA.locationId!, propertyB.locationId!, 10),
        transitOnlyEdge(propertyB.locationId!, propertyC.locationId!, 30),
      ),
    });
    const recommended = recommendedOption(result);

    expect(result.status).toBe("success");
    expect(recommended.propertyOrder).toEqual(["A", "B", "C"]);
    expect(recommended.simulation.stops[2]).toMatchObject({
      propertyId: "C",
      arrivalAt: 675,
      viewingStartAt: 720,
      bufferMinutes: 45,
    });
    expect(recommended.conflicts).toEqual([]);
  });

  it("implements Case 05 by preferring lower real transit risk over shorter travel", () => {
    const propertyA = createProperty("A", {
      viewingTime: fixedViewingTime("09:33"),
    });
    const propertyB = createProperty("B", {
      viewingTime: fixedViewingTime("09:46"),
    });
    const result = optimizeDayRoute({
      settings: createSettings({
        transportStrategy: "transit_only",
        fixedAppointmentBufferMinutes: 5,
      }),
      properties: Object.freeze([propertyA, propertyB]),
      travelMatrix: createMatrix(
        transitOnlyEdge("origin", propertyA.locationId!, 28, {
          transferCount: 2,
          walkMeters: 900,
        }),
        transitOnlyEdge("origin", propertyB.locationId!, 31, {
          transferCount: 0,
          walkMeters: 100,
        }),
      ),
    });
    const recommended = recommendedOption(result);

    if (result.status === "failure") {
      throw new Error("Expected route options");
    }

    const fasterRisky = result.options.find(
      ({ propertyOrder }) => propertyOrder.join(",") === "A",
    );
    const safer = result.options.find(
      ({ propertyOrder }) => propertyOrder.join(",") === "B",
    );

    expect(result.status).toBe("success");
    expect(result.consideredCandidateCount).toBe(2);
    expect(fasterRisky).toMatchObject({
      status: "feasible",
      metrics: { hardViolationCount: 0, riskPenalty: 5 },
      simulation: {
        stops: [{ bufferMinutes: 5 }],
        totals: { totalTravelMinutes: 28 },
      },
    });
    expect(safer).toMatchObject({
      status: "feasible",
      metrics: { hardViolationCount: 0, riskPenalty: 0 },
      simulation: {
        stops: [{ bufferMinutes: 15 }],
        totals: { totalTravelMinutes: 31 },
      },
    });
    expect(recommended).toBe(safer);
    expect(recommended.propertyOrder).toEqual(["B"]);
    expect(recommended.metrics.riskPenalty).toBe(0);
    expect(recommended.simulation.totals.totalTravelMinutes).toBe(31);
  });
});

describe("optimizeDayRoute integrated taxi behavior", () => {
  it("implements Case 06 by explaining a taxi that avoids lateness", () => {
    const property = createProperty("A", {
      durationMinutes: 10,
      viewingTime: fixedViewingTime("09:15"),
    });
    const result = optimizeDayRoute({
      settings: createSettings({
        taxiBudget: Object.freeze({ type: "capped", amount: 20 }),
      }),
      properties: Object.freeze([property]),
      travelMatrix: createMatrix(
        createEdge("origin", property.locationId!, {
          transit: transit(20),
          taxi: taxi(10, 20),
        }),
      ),
    });
    const recommended = recommendedOption(result);

    expect(result.status).toBe("success");
    expect(recommended.transportModes).toEqual(["taxi"]);
    expect(recommended.explanations).toContainEqual(
      expect.objectContaining({
        code: "avoid_late",
        parameters: expect.objectContaining({
          lateIssuesAvoided: 1,
          maximumLateByMinutesAvoided: 5,
        }),
      }),
    );
  });

  it("implements Case 07 while keeping taxi value independent from budget validity", () => {
    const property = createProperty("A", {
      durationMinutes: 10,
      viewingTime: fixedViewingTime("09:50"),
    });
    const result = optimizeDayRoute({
      settings: createSettings({
        taxiBudget: Object.freeze({ type: "capped", amount: 20 }),
      }),
      properties: Object.freeze([property]),
      travelMatrix: createMatrix(
        createEdge("origin", property.locationId!, {
          transit: transit(55, { transferCount: 2 }),
          taxi: taxi(18, 32),
        }),
      ),
    });
    const recommended = recommendedOption(result);

    expect(result.status).toBe("partial");
    expect(recommended.transportModes).toEqual(["taxi"]);
    expect(conflictCodes(recommended)).toEqual(["taxi_budget_exceeded"]);
    expect(recommended.explanations.map(({ code }) => code)).toEqual([
      "avoid_late",
      "transit_detour",
    ]);
  });

  it("implements Case 08 with distinct reference, candidate, and counterfactual roles", () => {
    const propertyA = createProperty("A", { durationMinutes: 20 });
    const propertyB = createProperty("B", { durationMinutes: 20 });
    const result = optimizeDayRoute({
      settings: createSettings({
        latestEnd: 620,
        taxiBudget: Object.freeze({ type: "unlimited" }),
      }),
      properties: Object.freeze([propertyA, propertyB]),
      travelMatrix: createMatrix(
        createEdge("origin", propertyA.locationId!, {
          transit: transit(10),
          taxi: UNAVAILABLE_TAXI,
        }),
        createEdge(propertyA.locationId!, propertyB.locationId!, {
          transit: transit(40),
          taxi: taxi(10, 25),
        }),
      ),
    });
    const recommended = recommendedOption(result);
    const unlock = recommended.explanations.find(
      ({ code }) => code === "unlock_extra_viewing",
    );

    expect(result.status).toBe("success");
    expect(recommended.propertyOrder).toEqual(["A", "B"]);
    expect(recommended.transportModes).toEqual(["transit", "taxi"]);
    expect(unlock).toMatchObject({
      scope: "route",
      parameters: {
        completedCountGain: 1,
        mustCompletedCountGain: 0,
        taxiLegCount: 1,
      },
    });
    expect(result.consideredCandidateCount).toBe(3);
  });

  it("suppresses Case 08 unlock when the same-order transit route is feasible", () => {
    const propertyA = createProperty("A", { durationMinutes: 20 });
    const propertyB = createProperty("B", { durationMinutes: 20 });
    const result = optimizeDayRoute({
      settings: createSettings({
        latestEnd: 640,
        taxiBudget: Object.freeze({ type: "unlimited" }),
      }),
      properties: Object.freeze([propertyA, propertyB]),
      travelMatrix: createMatrix(
        createEdge("origin", propertyA.locationId!, {
          transit: transit(10),
          taxi: UNAVAILABLE_TAXI,
        }),
        createEdge(propertyA.locationId!, propertyB.locationId!, {
          transit: transit(40),
          taxi: taxi(10, 25),
        }),
      ),
    });
    const taxiOption = optionWithMode(result, "taxi");

    expect(taxiOption.explanations.map(({ code }) => code)).toContain(
      "transit_detour",
    );
    expect(taxiOption.explanations.map(({ code }) => code)).not.toContain(
      "unlock_extra_viewing",
    );
  });

  it("implements Case 09 by assembling all four legal two-leg mode sequences", () => {
    const propertyA = createProperty("A", {
      importance: "must",
      durationMinutes: 0,
    });
    const propertyB = createProperty("B", {
      importance: "must",
      durationMinutes: 0,
    });
    const result = optimizeDayRoute({
      settings: createSettings(),
      properties: Object.freeze([propertyA, propertyB]),
      travelMatrix: createMatrix(
        createEdge("origin", propertyA.locationId!, {
          transit: transit(10),
          taxi: taxi(9, 5),
        }),
        createEdge(propertyA.locationId!, propertyB.locationId!, {
          transit: transit(10),
          taxi: taxi(9, 5),
        }),
      ),
    });

    expect(result.consideredCandidateCount).toBe(4);
    expect(recommendedOption(result).transportModes).toEqual([
      "taxi",
      "taxi",
    ]);

    if (result.status === "failure") {
      throw new Error("Expected route options");
    }

    expect(result.options).toContainEqual(
      expect.objectContaining({ transportModes: ["transit", "transit"] }),
    );
  });
});

describe("optimizeDayRoute integrated ranking, must, and options", () => {
  it("implements Case 10 by evaluating property order and mode jointly", () => {
    const propertyA = createProperty("A", {
      importance: "must",
      durationMinutes: 0,
    });
    const propertyB = createProperty("B", {
      importance: "must",
      durationMinutes: 0,
    });
    const result = optimizeDayRoute({
      settings: createSettings(),
      properties: Object.freeze([propertyA, propertyB]),
      travelMatrix: createMatrix(
        transitOnlyEdge("origin", propertyA.locationId!, 10),
        createEdge(propertyA.locationId!, propertyB.locationId!, {
          transit: transit(60),
          taxi: taxi(10, 20),
        }),
        transitOnlyEdge("origin", propertyB.locationId!, 10),
        transitOnlyEdge(propertyB.locationId!, propertyA.locationId!, 30),
      ),
    });
    const recommended = recommendedOption(result);

    expect(result.consideredCandidateCount).toBe(3);
    expect(recommended.propertyOrder).toEqual(["A", "B"]);
    expect(recommended.transportModes).toEqual(["transit", "taxi"]);

    if (result.status === "failure") {
      throw new Error("Expected route options");
    }

    expect(result.options).toContainEqual(
      expect.objectContaining({
        propertyOrder: ["B", "A"],
        transportModes: ["transit", "transit"],
        objectiveLabels: ["cheapest"],
      }),
    );
  });

  it("implements Case 11 by preserving must and conflict evidence in the winning route", () => {
    const unconfirmedViewingTime = Object.freeze({
      type: "unconfirmed" as const,
    });
    const mustProperty = createProperty("A", {
      importance: "must",
      durationMinutes: 20,
      viewingTime: unconfirmedViewingTime,
    });
    const optionalProperty = createProperty("B", {
      durationMinutes: 20,
      viewingTime: unconfirmedViewingTime,
    });
    const result = optimizeDayRoute({
      settings: createSettings({
        latestEnd: 570,
        transportStrategy: "transit_only",
      }),
      properties: Object.freeze([mustProperty, optionalProperty]),
      travelMatrix: createMatrix(
        transitOnlyEdge("origin", mustProperty.locationId!, 20),
        transitOnlyEdge(
          mustProperty.locationId!,
          optionalProperty.locationId!,
          5,
        ),
      ),
    });
    const recommended = recommendedOption(result);

    expect(result.status).toBe("partial");
    expect(result.consideredCandidateCount).toBe(2);
    expect(recommended.status).toBe("conflicted");
    expect(recommended.propertyOrder).toEqual(["A", "B"]);
    expect(recommended.propertyOrder).toContain(mustProperty.id);
    expect(recommended.propertyOrder).toContain(optionalProperty.id);
    expect(recommended.conflicts).toContainEqual(
      expect.objectContaining({
        code: "end_time_exceeded",
        propertyIds: [],
      }),
    );
    expect(result.conflicts).toBe(recommended.conflicts);

    if (result.status === "failure") {
      throw new Error("Expected route options");
    }

    expect(
      result.options.every(({ propertyOrder }) =>
        propertyOrder.includes(mustProperty.id),
      ),
    ).toBe(true);
  });

  it("implements Case 13 by merging all labels on one exact route", () => {
    const property = createProperty("A");
    const result = optimizeDayRoute({
      settings: createSettings({ transportStrategy: "transit_only" }),
      properties: Object.freeze([property]),
      travelMatrix: createMatrix(
        transitOnlyEdge("origin", property.locationId!, 10),
      ),
    });

    expect(result.status).toBe("success");

    if (result.status === "failure") {
      throw new Error("Expected route options");
    }

    expect(result.options).toHaveLength(1);
    expect(result.options[0].objectiveLabels).toEqual([
      "recommended",
      "cheapest",
      "fastest",
    ]);
  });

  it("emits only feasible or conflicted candidates and maps all-conflicted output to partial", () => {
    const property = createProperty("A", {
      viewingTime: fixedViewingTime("09:00"),
    });
    const result = optimizeDayRoute({
      settings: createSettings({ transportStrategy: "transit_only" }),
      properties: Object.freeze([property]),
      travelMatrix: createMatrix(
        transitOnlyEdge("origin", property.locationId!, 10),
      ),
    });
    const recommended = recommendedOption(result);

    expect(result.status).toBe("partial");
    expect(recommended.status).toBe("conflicted");
    expect(result.conflicts).toBe(recommended.conflicts);
    expect(recommended.objectiveLabels).toEqual(["recommended"]);
  });
});

describe("optimizeDayRoute travel-data and failure behavior", () => {
  it("implements Case 16 by accepting degraded usable transit", () => {
    const property = createProperty("A");
    const result = optimizeDayRoute({
      settings: createSettings({ transportStrategy: "transit_only" }),
      properties: Object.freeze([property]),
      travelMatrix: createMatrix(
        transitOnlyEdge("origin", property.locationId!, 20, {
          status: "degraded",
        }),
      ),
    });

    expect(result.status).toBe("success");
    expect(recommendedOption(result).transportModes).toEqual(["transit"]);
  });

  it("implements Case 16 by accepting taxi-only data only when strategy permits", () => {
    const property = createProperty("A");
    const matrix = createMatrix(
      createEdge("origin", property.locationId!, {
        transit: UNAVAILABLE_TRANSIT,
        taxi: taxi(12, 26, "degraded"),
      }),
    );
    const permitted = optimizeDayRoute({
      settings: createSettings({ transportStrategy: "transit_first" }),
      properties: Object.freeze([property]),
      travelMatrix: matrix,
    });
    const rejected = optimizeDayRoute({
      settings: createSettings({ transportStrategy: "transit_only" }),
      properties: Object.freeze([property]),
      travelMatrix: matrix,
    });

    expect(permitted.status).toBe("success");
    expect(recommendedOption(permitted).transportModes).toEqual(["taxi"]);
    expect(rejected).toEqual({
      status: "failure",
      options: [],
      conflicts: [
        {
          kind: "conflict",
          code: "travel_data_unavailable",
          propertyIds: [],
          parameters: { reason: "no_legal_mode_sequence" },
        },
      ],
      consideredCandidateCount: 0,
    });
  });

  it("implements Case 16 without reverse fallback or fabricated missing travel", () => {
    const property = createProperty("A");
    const reverseOnly = createMatrix(
      transitOnlyEdge(property.locationId!, "origin", 10),
    );
    const result = optimizeDayRoute({
      settings: createSettings({ transportStrategy: "transit_only" }),
      properties: Object.freeze([property]),
      travelMatrix: reverseOnly,
    });

    expect(result.status).toBe("failure");
    expect(result.conflicts).toMatchObject([
      {
        code: "travel_data_unavailable",
        parameters: { reason: "no_legal_mode_sequence" },
      },
    ]);
  });

  it("keeps provider-failure data unavailable instead of inventing a route", () => {
    const property = createProperty("A");
    const result = optimizeDayRoute({
      settings: createSettings(),
      properties: Object.freeze([property]),
      travelMatrix: createMatrix(
        createEdge("origin", property.locationId!, {
          transit: UNAVAILABLE_TRANSIT,
          taxi: UNAVAILABLE_TAXI,
          providerFailure: true,
        }),
      ),
    });

    expect(result.status).toBe("failure");
    expect(result.conflicts[0]).toMatchObject({
      code: "travel_data_unavailable",
      parameters: { reason: "no_legal_mode_sequence" },
    });
  });

  it("skips an overflowing mode while preserving another assembled candidate", () => {
    const property = createProperty("A", { durationMinutes: 0 });
    const result = optimizeDayRoute({
      settings: createSettings({ earliestStart: 1380, latestEnd: 1439 }),
      properties: Object.freeze([property]),
      travelMatrix: createMatrix(
        createEdge("origin", property.locationId!, {
          transit: transit(70),
          taxi: taxi(5, 20),
        }),
      ),
    });
    const recommended = recommendedOption(result);

    expect(result.status).toBe("success");
    expect(result.consideredCandidateCount).toBe(1);
    expect(recommended.transportModes).toEqual(["taxi"]);
    expect(recommended.explanations.map(({ code }) => code)).toEqual([
      "transit_detour",
    ]);
    expect(recommended.simulation.totals.estimatedEndAt).toBe(1385);
  });

  it("returns same-day-overflow failure when every legal attempt overflows", () => {
    const property = createProperty("A", { durationMinutes: 0 });
    const result = optimizeDayRoute({
      settings: createSettings({
        earliestStart: 1430,
        latestEnd: 1439,
        transportStrategy: "transit_only",
      }),
      properties: Object.freeze([property]),
      travelMatrix: createMatrix(
        transitOnlyEdge("origin", property.locationId!, 20),
      ),
    });

    expect(result).toEqual({
      status: "failure",
      options: [],
      conflicts: [
        {
          kind: "conflict",
          code: "end_time_exceeded",
          propertyIds: [],
          parameters: { reason: "same_day_overflow" },
        },
      ],
      consideredCandidateCount: 0,
    });
  });
});

describe("optimizeDayRoute validation, assembly, and determinism", () => {
  it("implements Case 17 for one property with configured default duration", () => {
    const property = createProperty("A", { durationMinutes: undefined });
    const result = optimizeDayRoute({
      settings: createSettings({ transportStrategy: "transit_only" }),
      properties: Object.freeze([property]),
      travelMatrix: createMatrix(
        transitOnlyEdge("origin", property.locationId!, 10),
      ),
    });
    const recommended = recommendedOption(result);

    expect(result.status).toBe("success");
    expect(result.consideredCandidateCount).toBe(1);
    expect(recommended.simulation.stops[0]).toMatchObject({
      viewingStartAt: 550,
      viewingEndAt: 580,
    });
    expect(recommended.metrics).toEqual({
      hardViolationCount: 0,
      riskPenalty: recommended.risk.score,
      experiencePenalty: 0,
    });
    expect(recommended.id).toBe(
      JSON.stringify([["A"], ["transit"]]),
    );
  });

  it("maps every invalid CE-04 issue to an ordered frozen conflict", () => {
    const property = createProperty("A", {
      address: "",
      locationId: undefined,
      durationMinutes: -1,
    });
    const result = optimizeDayRoute({
      settings: createSettings(),
      properties: Object.freeze([property]),
      travelMatrix: createMatrix(),
    });

    expect(result).toEqual({
      status: "failure",
      options: [],
      conflicts: [
        {
          kind: "conflict",
          code: "invalid_input",
          propertyIds: ["A"],
          parameters: {
            validationCode: "invalid_property_address",
            scope: "property",
            propertyIndex: 0,
          },
        },
        {
          kind: "conflict",
          code: "invalid_input",
          propertyIds: ["A"],
          parameters: {
            validationCode: "invalid_property_location_id",
            scope: "property",
            propertyIndex: 0,
          },
        },
        {
          kind: "conflict",
          code: "invalid_input",
          propertyIds: ["A"],
          parameters: {
            validationCode: "invalid_property_duration",
            scope: "property",
            propertyIndex: 0,
          },
        },
      ],
      consideredCandidateCount: 0,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.options)).toBe(true);
    expect(Object.isFrozen(result.conflicts)).toBe(true);
    expect(result.conflicts.every(Object.isFrozen)).toBe(true);
    expect(
      result.conflicts.every(({ propertyIds, parameters }) =>
        Object.isFrozen(propertyIds) && Object.isFrozen(parameters),
      ),
    ).toBe(true);
  });

  it("merges timeline then travel then budget hard evidence without deduplication", () => {
    const property = createProperty("A", {
      viewingTime: fixedViewingTime("09:10"),
    });
    const taxiBudget: TaxiBudget = Object.freeze({
      type: "capped",
      amount: 0,
    });
    const result = optimizeDayRoute({
      settings: createSettings({ taxiBudget }),
      properties: Object.freeze([property]),
      travelMatrix: createMatrix(
        createEdge("origin", property.locationId!, {
          transit: UNAVAILABLE_TRANSIT,
          taxi: taxi(20, 10),
        }),
      ),
    });
    const recommended = recommendedOption(result);

    expect(result.status).toBe("partial");
    expect(recommended.metrics.hardViolationCount).toBe(2);
    expect(conflictCodes(recommended)).toEqual([
      "appointment_conflict",
      "taxi_budget_exceeded",
    ]);
    expect(recommended.violations.map(({ code }) => code)).toEqual([
      "appointment_conflict",
      "taxi_budget_exceeded",
    ]);
    expect(recommended.explanations).toEqual([]);
  });

  it("does not mutate frozen inputs and freezes newly owned result structures", () => {
    const property = createProperty("A", { agentName: "Captured only" });
    const settings = createSettings({ transportStrategy: "transit_only" });
    const properties = Object.freeze([property]);
    const travelMatrix = createMatrix(
      transitOnlyEdge("origin", property.locationId!, 10),
    );
    const input: OptimizeDayRouteInput = Object.freeze({
      settings,
      properties,
      travelMatrix,
    });
    const snapshot = JSON.stringify(input);
    const result = optimizeDayRoute(input);
    const recommended = recommendedOption(result);

    expect(JSON.stringify(input)).toBe(snapshot);
    expect(input.settings).toBe(settings);
    expect(input.properties).toBe(properties);
    expect(input.travelMatrix).toBe(travelMatrix);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.options)).toBe(true);
    expect(Object.isFrozen(recommended)).toBe(true);
    expect(Object.isFrozen(recommended.propertyOrder)).toBe(true);
    expect(Object.isFrozen(recommended.transportModes)).toBe(true);
    expect(Object.isFrozen(recommended.metrics)).toBe(true);
    expect(Object.isFrozen(recommended.explanations)).toBe(true);
    expect(Object.isFrozen(recommended.violations)).toBe(true);
    expect(Object.isFrozen(recommended.conflicts)).toBe(true);
  });

  it("is deeply repeatable for identical frozen input", () => {
    const propertyA = createProperty("A", { durationMinutes: 20 });
    const propertyB = createProperty("B", { durationMinutes: 20 });
    const input: OptimizeDayRouteInput = Object.freeze({
      settings: createSettings({
        latestEnd: 620,
        taxiBudget: Object.freeze({ type: "unlimited" }),
      }),
      properties: Object.freeze([propertyA, propertyB]),
      travelMatrix: createMatrix(
        createEdge("origin", propertyA.locationId!, {
          transit: transit(10),
          taxi: UNAVAILABLE_TAXI,
        }),
        createEdge(propertyA.locationId!, propertyB.locationId!, {
          transit: transit(40),
          taxi: taxi(10, 25),
        }),
      ),
    });
    const first = optimizeDayRoute(input);
    const second = optimizeDayRoute(input);

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
