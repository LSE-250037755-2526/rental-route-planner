import { describe, expect, it } from "vitest";

import {
  MockTravelTimeProvider,
  providerFailureFixture,
  travelFixture,
  type MockDirectedTravelFixture,
} from "../../src/lib/travel/MockTravelTimeProvider";
import {
  buildTravelMatrix,
  getTravelEdge,
} from "../../src/lib/travel/buildTravelMatrix";
import type {
  TravelProviderResult,
  TravelTimeRequest,
} from "../../src/lib/travel/TravelTimeProvider";
import type {
  TravelEdge,
  TravelMatrix,
} from "../../src/lib/travel/types";
import {
  TRAVEL_RESULT_BOTH_UNAVAILABLE,
  TRAVEL_RESULT_COMPLETE_MEDIUM,
  TRAVEL_RESULT_COMPLETE_SHORT,
  TRAVEL_RESULT_TAXI_DEGRADED,
  TRAVEL_RESULT_TAXI_ONLY,
  TRAVEL_RESULT_TRANSIT_DEGRADED,
  TRAVEL_RESULT_TRANSIT_DETOUR,
  TRAVEL_RESULT_TRANSIT_DIRECT,
  TRAVEL_RESULT_TRANSIT_ONLY,
  TRAVEL_RESULT_TRANSIT_RISKY,
} from "../fixtures/travel/results";
import {
  ASYMMETRIC_TRAVEL_SCENARIO,
  CASE16_BOTH_UNAVAILABLE,
  CASE16_PROVIDER_FAILURE,
  CASE16_TAXI_ONLY,
  CASE19_RAW_TRAVEL_ASYMMETRY,
  TRANSIT_DEGRADED_SCENARIO,
  buildFixtureTravelMatrix,
  createTravelFixtureScenario,
} from "../fixtures/travel/scenarios";

function requireEdge(
  matrix: TravelMatrix,
  fromLocationId: string,
  toLocationId: string,
): TravelEdge {
  const edge = getTravelEdge(matrix, fromLocationId, toLocationId);

  expect(edge).toBeDefined();

  if (edge === undefined) {
    throw new Error("Expected requested directed travel edge");
  }

  return edge;
}

describe("MockTravelTimeProvider directed lookup", () => {
  it("returns the exact configured directed result", async () => {
    const provider = new MockTravelTimeProvider([
      travelFixture("A", "B", TRAVEL_RESULT_COMPLETE_SHORT),
    ]);

    await expect(
      provider.getTravel({ fromLocationId: "A", toLocationId: "B" }),
    ).resolves.toEqual({
      transit: {
        status: "available",
        durationMinutes: 18,
        cost: 3,
        transferCount: 0,
        walkMeters: 220,
      },
      taxi: {
        status: "available",
        durationMinutes: 8,
        cost: 18,
      },
    });
  });

  it("keeps A-to-B and B-to-A fixtures independent", async () => {
    const provider = new MockTravelTimeProvider([
      travelFixture("A", "B", TRAVEL_RESULT_COMPLETE_SHORT),
      travelFixture("B", "A", TRAVEL_RESULT_COMPLETE_MEDIUM),
    ]);
    const forward = await provider.getTravel({
      fromLocationId: "A",
      toLocationId: "B",
    });
    const reverse = await provider.getTravel({
      fromLocationId: "B",
      toLocationId: "A",
    });

    expect(forward.transit).toMatchObject({ durationMinutes: 18 });
    expect(reverse.transit).toMatchObject({ durationMinutes: 32 });
  });

  it("throws when only the reverse direction is configured", async () => {
    const provider = new MockTravelTimeProvider([
      travelFixture("A", "B", TRAVEL_RESULT_COMPLETE_SHORT),
    ]);

    await expect(
      provider.getTravel({ fromLocationId: "B", toLocationId: "A" }),
    ).rejects.toThrow("No mock travel fixture for directed pair B -> A");
  });

  it("returns the same internally owned frozen result repeatedly", async () => {
    const provider = new MockTravelTimeProvider([
      travelFixture("A", "B", TRAVEL_RESULT_COMPLETE_SHORT),
    ]);
    const first = await provider.getTravel({
      fromLocationId: "A",
      toLocationId: "B",
    });
    const second = await provider.getTravel({
      fromLocationId: "A",
      toLocationId: "B",
    });
    const third = await provider.getTravel({
      fromLocationId: "A",
      toLocationId: "B",
    });

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(second).toEqual(TRAVEL_RESULT_COMPLETE_SHORT);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.transit)).toBe(true);
    expect(Object.isFrozen(first.taxi)).toBe(true);
  });

  it("records copied requests in deterministic order without exposing its array", async () => {
    const provider = new MockTravelTimeProvider([
      travelFixture("O", "A", TRAVEL_RESULT_COMPLETE_SHORT),
      travelFixture("A", "B", TRAVEL_RESULT_COMPLETE_MEDIUM),
      travelFixture("B", "A", TRAVEL_RESULT_COMPLETE_SHORT),
    ]);

    await provider.getTravel({ fromLocationId: "O", toLocationId: "A" });
    await provider.getTravel({ fromLocationId: "A", toLocationId: "B" });
    await provider.getTravel({ fromLocationId: "B", toLocationId: "A" });

    const history = provider.getRequests();
    expect(history).toEqual([
      { fromLocationId: "O", toLocationId: "A" },
      { fromLocationId: "A", toLocationId: "B" },
      { fromLocationId: "B", toLocationId: "A" },
    ]);
    expect(Object.isFrozen(history)).toBe(true);
    expect(history.every(Object.isFrozen)).toBe(true);
    expect(() =>
      (history as TravelTimeRequest[]).push({
        fromLocationId: "X",
        toLocationId: "Y",
      }),
    ).toThrow(TypeError);
    expect(provider.getRequests()).toEqual(history);
  });

  it("rejects duplicate exact pairs but accepts opposing directions", () => {
    expect(
      () =>
        new MockTravelTimeProvider([
          travelFixture("A", "B", TRAVEL_RESULT_COMPLETE_SHORT),
          travelFixture("A", "B", TRAVEL_RESULT_COMPLETE_MEDIUM),
        ]),
    ).toThrow(RangeError);

    expect(
      () =>
        new MockTravelTimeProvider([
          travelFixture("A", "B", TRAVEL_RESULT_COMPLETE_SHORT),
          travelFixture("B", "A", TRAVEL_RESULT_COMPLETE_MEDIUM),
        ]),
    ).not.toThrow();
  });
});

describe("canonical deterministic travel results", () => {
  it("locks the exact canonical result values", () => {
    expect({
      completeShort: TRAVEL_RESULT_COMPLETE_SHORT,
      completeMedium: TRAVEL_RESULT_COMPLETE_MEDIUM,
      transitRisky: TRAVEL_RESULT_TRANSIT_RISKY,
      transitDetour: TRAVEL_RESULT_TRANSIT_DETOUR,
      transitOnly: TRAVEL_RESULT_TRANSIT_ONLY,
      taxiOnly: TRAVEL_RESULT_TAXI_ONLY,
      bothUnavailable: TRAVEL_RESULT_BOTH_UNAVAILABLE,
      transitDegraded: TRAVEL_RESULT_TRANSIT_DEGRADED,
      taxiDegraded: TRAVEL_RESULT_TAXI_DEGRADED,
      transitDirect: TRAVEL_RESULT_TRANSIT_DIRECT,
    }).toEqual({
      completeShort: {
        transit: {
          status: "available",
          durationMinutes: 18,
          cost: 3,
          transferCount: 0,
          walkMeters: 220,
        },
        taxi: { status: "available", durationMinutes: 8, cost: 18 },
      },
      completeMedium: {
        transit: {
          status: "available",
          durationMinutes: 32,
          cost: 4,
          transferCount: 1,
          walkMeters: 420,
        },
        taxi: { status: "available", durationMinutes: 15, cost: 28 },
      },
      transitRisky: {
        transit: {
          status: "available",
          durationMinutes: 28,
          cost: 4,
          transferCount: 2,
          walkMeters: 900,
        },
        taxi: { status: "available", durationMinutes: 14, cost: 30 },
      },
      transitDetour: {
        transit: {
          status: "available",
          durationMinutes: 55,
          cost: 4,
          transferCount: 2,
          walkMeters: 650,
        },
        taxi: { status: "available", durationMinutes: 18, cost: 32 },
      },
      transitOnly: {
        transit: {
          status: "available",
          durationMinutes: 24,
          cost: 3,
          transferCount: 1,
          walkMeters: 350,
        },
        taxi: { status: "unavailable" },
      },
      taxiOnly: {
        transit: { status: "unavailable" },
        taxi: { status: "available", durationMinutes: 12, cost: 26 },
      },
      bothUnavailable: {
        transit: { status: "unavailable" },
        taxi: { status: "unavailable" },
      },
      transitDegraded: {
        transit: {
          status: "degraded",
          durationMinutes: 31,
          cost: 5.5,
          transferCount: 2,
          walkMeters: 920,
        },
        taxi: { status: "available", durationMinutes: 14, cost: 28 },
      },
      taxiDegraded: {
        transit: {
          status: "available",
          durationMinutes: 26,
          cost: 4,
          transferCount: 1,
          walkMeters: 300,
        },
        taxi: { status: "degraded", durationMinutes: 13, cost: 24 },
      },
      transitDirect: {
        transit: {
          status: "available",
          durationMinutes: 31,
          cost: 4,
          transferCount: 0,
          walkMeters: 250,
        },
        taxi: { status: "available", durationMinutes: 15, cost: 28 },
      },
    });
  });

  it("deeply freezes every exported canonical result", () => {
    const results = [
      TRAVEL_RESULT_COMPLETE_SHORT,
      TRAVEL_RESULT_COMPLETE_MEDIUM,
      TRAVEL_RESULT_TRANSIT_RISKY,
      TRAVEL_RESULT_TRANSIT_DETOUR,
      TRAVEL_RESULT_TRANSIT_ONLY,
      TRAVEL_RESULT_TAXI_ONLY,
      TRAVEL_RESULT_BOTH_UNAVAILABLE,
      TRAVEL_RESULT_TRANSIT_DEGRADED,
      TRAVEL_RESULT_TAXI_DEGRADED,
      TRAVEL_RESULT_TRANSIT_DIRECT,
    ];

    for (const result of results) {
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.transit)).toBe(true);
      expect(Object.isFrozen(result.taxi)).toBe(true);
    }
  });
});

describe("provider failure and Case 16 fixtures", () => {
  it("throws for an explicit failure fixture and delegates conversion to CE-05", async () => {
    const provider = new MockTravelTimeProvider([
      providerFailureFixture("A", "B"),
    ]);

    await expect(
      provider.getTravel({ fromLocationId: "A", toLocationId: "B" }),
    ).rejects.toThrow("Configured mock travel provider failure for A -> B");

    const matrix = await buildTravelMatrix({
      originLocationId: "A",
      propertyLocationIds: ["B"],
      provider,
    });
    expect(requireEdge(matrix, "A", "B")).toMatchObject({
      transit: { status: "unavailable" },
      taxi: { status: "unavailable" },
      dataStatus: "unavailable",
      failure: { kind: "provider_failure" },
    });
  });

  it("keeps ordinary both-unavailable data distinct from provider failure", async () => {
    const unavailableEdge = requireEdge(
      await buildFixtureTravelMatrix(CASE16_BOTH_UNAVAILABLE),
      "origin",
      "property-a",
    );
    const failedEdge = requireEdge(
      await buildFixtureTravelMatrix(CASE16_PROVIDER_FAILURE),
      "origin",
      "property-a",
    );

    expect(unavailableEdge).toMatchObject({
      transit: { status: "unavailable" },
      taxi: { status: "unavailable" },
      dataStatus: "unavailable",
      failure: null,
    });
    expect(failedEdge.failure).toEqual({ kind: "provider_failure" });
  });

  it("builds the taxi-only Case 16 fixture as degraded without transit values", async () => {
    const edge = requireEdge(
      await buildFixtureTravelMatrix(CASE16_TAXI_ONLY),
      "origin",
      "property-a",
    );

    expect(edge).toMatchObject({
      transit: { status: "unavailable" },
      taxi: { status: "available", durationMinutes: 12, cost: 26 },
      dataStatus: "degraded",
      failure: null,
    });
    expect(Object.keys(edge.transit)).toEqual(["status"]);
  });

  it("builds transit-only and explicitly degraded fixtures without alteration", async () => {
    const transitOnlyProvider = new MockTravelTimeProvider([
      travelFixture("O", "A", TRAVEL_RESULT_TRANSIT_ONLY),
    ]);
    const transitOnlyEdge = requireEdge(
      await buildTravelMatrix({
        originLocationId: "O",
        propertyLocationIds: ["A"],
        provider: transitOnlyProvider,
      }),
      "O",
      "A",
    );
    const degradedEdge = requireEdge(
      await buildFixtureTravelMatrix(TRANSIT_DEGRADED_SCENARIO),
      "origin",
      "property-a",
    );

    expect(transitOnlyEdge).toMatchObject({
      transit: {
        status: "available",
        durationMinutes: 24,
        cost: 3,
        transferCount: 1,
        walkMeters: 350,
      },
      taxi: { status: "unavailable" },
      dataStatus: "degraded",
      failure: null,
    });
    expect(degradedEdge.transit).toEqual({
      status: "degraded",
      durationMinutes: 31,
      cost: 5.5,
      transferCount: 2,
      walkMeters: 920,
    });
    expect(degradedEdge.dataStatus).toBe("degraded");
  });
});

describe("fixture configuration isolation", () => {
  it("copies mutable constructor input and does not retain external aliases", async () => {
    const mutableResult = {
      transit: {
        status: "available" as const,
        durationMinutes: 18,
        cost: 3,
        transferCount: 0,
        walkMeters: 220,
      },
      taxi: {
        status: "available" as const,
        durationMinutes: 8,
        cost: 18,
      },
    };
    const mutableFixtures = [
      {
        fromLocationId: "A",
        toLocationId: "B",
        response: { type: "result" as const, result: mutableResult },
      },
    ];
    const provider = new MockTravelTimeProvider(mutableFixtures);

    mutableResult.transit.durationMinutes = 999;
    mutableResult.taxi.cost = 999;
    mutableFixtures.splice(0, 1);

    await expect(
      provider.getTravel({ fromLocationId: "A", toLocationId: "B" }),
    ).resolves.toEqual(TRAVEL_RESULT_COMPLETE_SHORT);
  });
});

describe("reusable fixture matrix scenarios", () => {
  it("builds the full two-property directed matrix through CE-05", async () => {
    const matrix = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );

    expect(requireEdge(matrix, "origin", "property-a").transit).toMatchObject({
      durationMinutes: 18,
    });
    expect(requireEdge(matrix, "origin", "property-b").transit).toMatchObject({
      durationMinutes: 32,
    });
    expect(requireEdge(matrix, "property-a", "property-b").transit).toMatchObject({
      durationMinutes: 18,
    });
    expect(requireEdge(matrix, "property-b", "property-a").transit).toMatchObject({
      durationMinutes: 32,
    });
    expect(getTravelEdge(matrix, "property-a", "origin")).toBeUndefined();
  });

  it("makes an omitted required fixture visible as provider failure", async () => {
    const incompleteScenario = createTravelFixtureScenario({
      originLocationId: "O",
      propertyLocationIds: ["A", "B"],
      fixtures: [
        travelFixture("O", "A", TRAVEL_RESULT_COMPLETE_SHORT),
        travelFixture("O", "B", TRAVEL_RESULT_COMPLETE_SHORT),
        travelFixture("A", "B", TRAVEL_RESULT_COMPLETE_SHORT),
      ],
    });
    const matrix = await buildFixtureTravelMatrix(incompleteScenario);

    expect(requireEdge(matrix, "B", "A")).toMatchObject({
      transit: { status: "unavailable" },
      taxi: { status: "unavailable" },
      dataStatus: "unavailable",
      failure: { kind: "provider_failure" },
    });
  });

  it("preserves the future Case 19 raw 60-versus-10 transit data only", async () => {
    const matrix = await buildFixtureTravelMatrix(
      CASE19_RAW_TRAVEL_ASYMMETRY,
    );

    expect(requireEdge(matrix, "property-a", "property-c").transit).toMatchObject({
      durationMinutes: 60,
      cost: 5,
      transferCount: 1,
      walkMeters: 500,
    });
    expect(requireEdge(matrix, "property-b", "property-c").transit).toMatchObject({
      durationMinutes: 10,
      cost: 3,
      transferCount: 0,
      walkMeters: 180,
    });
  });

  it("builds deeply equal matrices from the same scenario repeatedly", async () => {
    const first = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );
    const second = await buildFixtureTravelMatrix(
      ASYMMETRIC_TRAVEL_SCENARIO,
    );

    expect(second).toEqual(first);
  });
});

const fixtureTypeCheck: readonly MockDirectedTravelFixture[] = [
  travelFixture("A", "B", TRAVEL_RESULT_COMPLETE_SHORT),
];
const resultTypeCheck: TravelProviderResult = TRAVEL_RESULT_COMPLETE_SHORT;

void fixtureTypeCheck;
void resultTypeCheck;
