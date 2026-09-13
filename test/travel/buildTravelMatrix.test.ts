import { describe, expect, it } from "vitest";

import {
  buildTravelMatrix,
  getTravelEdge,
} from "../../src/lib/travel/buildTravelMatrix";
import type {
  TravelProviderResult,
  TravelTimeProvider,
  TravelTimeRequest,
} from "../../src/lib/travel/TravelTimeProvider";
import type {
  TravelEdge,
  TravelMatrix,
} from "../../src/lib/travel/types";

type ProviderResolver = (
  request: TravelTimeRequest,
) => TravelProviderResult | Promise<TravelProviderResult>;

function createAvailableResult(
  transitDurationMinutes = 20,
  taxiDurationMinutes = 10,
): TravelProviderResult {
  return {
    transit: {
      status: "available",
      durationMinutes: transitDurationMinutes,
      cost: 4,
      transferCount: 1,
      walkMeters: 300,
    },
    taxi: {
      status: "available",
      durationMinutes: taxiDurationMinutes,
      cost: 18,
    },
  };
}

function createRecordingProvider(
  resolver: ProviderResolver = () => createAvailableResult(),
): {
  readonly provider: TravelTimeProvider;
  readonly calls: TravelTimeRequest[];
} {
  const calls: TravelTimeRequest[] = [];

  return {
    calls,
    provider: {
      async getTravel(request) {
        calls.push({ ...request });
        return resolver(request);
      },
    },
  };
}

function requireEdge(
  matrix: TravelMatrix,
  fromLocationId: string,
  toLocationId: string,
): TravelEdge {
  const edge = getTravelEdge(matrix, fromLocationId, toLocationId);

  expect(edge).toBeDefined();

  if (edge === undefined) {
    throw new Error("Expected requested directed edge");
  }

  return edge;
}

describe("directed pair coverage", () => {
  it("requests only origin to property for one property", async () => {
    const { provider, calls } = createRecordingProvider();
    const matrix = await buildTravelMatrix({
      originLocationId: "O",
      propertyLocationIds: ["A"],
      provider,
    });

    expect(calls).toEqual([{ fromLocationId: "O", toLocationId: "A" }]);
    expect(requireEdge(matrix, "O", "A").fromLocationId).toBe("O");
    expect(getTravelEdge(matrix, "A", "O")).toBeUndefined();
    expect(getTravelEdge(matrix, "A", "A")).toBeUndefined();
    expect(getTravelEdge(matrix, "O", "O")).toBeUndefined();
  });

  it("requests four directed pairs for two properties in input order", async () => {
    const { provider, calls } = createRecordingProvider();

    await buildTravelMatrix({
      originLocationId: "O",
      propertyLocationIds: ["A", "B"],
      provider,
    });

    expect(calls).toEqual([
      { fromLocationId: "O", toLocationId: "A" },
      { fromLocationId: "O", toLocationId: "B" },
      { fromLocationId: "A", toLocationId: "B" },
      { fromLocationId: "B", toLocationId: "A" },
    ]);
    expect(calls).toHaveLength(4);
  });

  it("requests nine directed pairs for three properties in input order", async () => {
    const { provider, calls } = createRecordingProvider();

    await buildTravelMatrix({
      originLocationId: "O",
      propertyLocationIds: ["A", "B", "C"],
      provider,
    });

    expect(calls).toEqual([
      { fromLocationId: "O", toLocationId: "A" },
      { fromLocationId: "O", toLocationId: "B" },
      { fromLocationId: "O", toLocationId: "C" },
      { fromLocationId: "A", toLocationId: "B" },
      { fromLocationId: "A", toLocationId: "C" },
      { fromLocationId: "B", toLocationId: "A" },
      { fromLocationId: "B", toLocationId: "C" },
      { fromLocationId: "C", toLocationId: "A" },
      { fromLocationId: "C", toLocationId: "B" },
    ]);
    expect(calls).toHaveLength(9);
  });

  it("preserves independently acquired asymmetric directions", async () => {
    const { provider } = createRecordingProvider((request) =>
      createAvailableResult(
        request.fromLocationId === "A" && request.toLocationId === "B"
          ? 12
          : request.fromLocationId === "B" && request.toLocationId === "A"
            ? 27
            : 20,
      ),
    );
    const matrix = await buildTravelMatrix({
      originLocationId: "O",
      propertyLocationIds: ["A", "B"],
      provider,
    });
    const forward = requireEdge(matrix, "A", "B");
    const reverse = requireEdge(matrix, "B", "A");

    expect(forward.transit).toMatchObject({ durationMinutes: 12 });
    expect(reverse.transit).toMatchObject({ durationMinutes: 27 });
  });

  it("does not fall back to the reverse direction during lookup", async () => {
    const { provider } = createRecordingProvider();
    const matrix = await buildTravelMatrix({
      originLocationId: "A",
      propertyLocationIds: ["B"],
      provider,
    });

    expect(getTravelEdge(matrix, "A", "B")).toBeDefined();
    expect(getTravelEdge(matrix, "B", "A")).toBeUndefined();
  });

  it("deduplicates exact directed pairs after occurrence-based generation", async () => {
    const { provider, calls } = createRecordingProvider();

    await buildTravelMatrix({
      originLocationId: "O",
      propertyLocationIds: ["A", "A", "B"],
      provider,
    });

    expect(calls).toEqual([
      { fromLocationId: "O", toLocationId: "A" },
      { fromLocationId: "O", toLocationId: "B" },
      { fromLocationId: "A", toLocationId: "A" },
      { fromLocationId: "A", toLocationId: "B" },
      { fromLocationId: "B", toLocationId: "A" },
    ]);
  });
});

describe("travel data status", () => {
  it("derives complete when both alternatives are available", async () => {
    const { provider } = createRecordingProvider();
    const edge = requireEdge(
      await buildTravelMatrix({
        originLocationId: "O",
        propertyLocationIds: ["A"],
        provider,
      }),
      "O",
      "A",
    );

    expect(edge.dataStatus).toBe("complete");
    expect(edge.failure).toBeNull();
  });

  it("preserves taxi-only data as a degraded edge for Case 16", async () => {
    const { provider } = createRecordingProvider(() => ({
      transit: { status: "unavailable" },
      taxi: { status: "available", durationMinutes: 8, cost: 22 },
    }));
    const edge = requireEdge(
      await buildTravelMatrix({
        originLocationId: "O",
        propertyLocationIds: ["A"],
        provider,
      }),
      "O",
      "A",
    );

    expect(edge).toMatchObject({
      transit: { status: "unavailable" },
      taxi: { status: "available", durationMinutes: 8, cost: 22 },
      dataStatus: "degraded",
      failure: null,
    });
    expect(Object.keys(edge.transit)).toEqual(["status"]);
  });

  it("derives degraded when only transit is available", async () => {
    const { provider } = createRecordingProvider(() => ({
      transit: {
        status: "available",
        durationMinutes: 18,
        cost: 3,
        transferCount: 0,
        walkMeters: 250,
      },
      taxi: { status: "unavailable" },
    }));
    const edge = requireEdge(
      await buildTravelMatrix({
        originLocationId: "O",
        propertyLocationIds: ["A"],
        provider,
      }),
      "O",
      "A",
    );

    expect(edge.dataStatus).toBe("degraded");
    expect(edge.failure).toBeNull();
  });

  it("preserves explicitly degraded usable transit metrics", async () => {
    const { provider } = createRecordingProvider(() => ({
      transit: {
        status: "degraded",
        durationMinutes: 31,
        cost: 5.5,
        transferCount: 2,
        walkMeters: 920,
      },
      taxi: { status: "available", durationMinutes: 14, cost: 28 },
    }));
    const edge = requireEdge(
      await buildTravelMatrix({
        originLocationId: "O",
        propertyLocationIds: ["A"],
        provider,
      }),
      "O",
      "A",
    );

    expect(edge.transit).toEqual({
      status: "degraded",
      durationMinutes: 31,
      cost: 5.5,
      transferCount: 2,
      walkMeters: 920,
    });
    expect(edge.dataStatus).toBe("degraded");
  });

  it("stores an explicitly unavailable requested edge without failure", async () => {
    const { provider } = createRecordingProvider(() => ({
      transit: { status: "unavailable" },
      taxi: { status: "unavailable" },
    }));
    const edge = requireEdge(
      await buildTravelMatrix({
        originLocationId: "O",
        propertyLocationIds: ["A"],
        provider,
      }),
      "O",
      "A",
    );

    expect(edge).toEqual({
      fromLocationId: "O",
      toLocationId: "A",
      transit: { status: "unavailable" },
      taxi: { status: "unavailable" },
      dataStatus: "unavailable",
      failure: null,
    });
  });

  it("accepts zero-valued usable metrics", async () => {
    const { provider } = createRecordingProvider(() => ({
      transit: {
        status: "available",
        durationMinutes: 0,
        cost: 0,
        transferCount: 0,
        walkMeters: 0,
      },
      taxi: { status: "available", durationMinutes: 0, cost: 0 },
    }));
    const edge = requireEdge(
      await buildTravelMatrix({
        originLocationId: "O",
        propertyLocationIds: ["A"],
        provider,
      }),
      "O",
      "A",
    );

    expect(edge.dataStatus).toBe("complete");
  });
});

describe("provider failure boundary", () => {
  it("records a thrown pair failure and continues without reverse fallback", async () => {
    const { provider, calls } = createRecordingProvider((request) => {
      if (request.fromLocationId === "A" && request.toLocationId === "B") {
        throw new Error("SECRET provider message");
      }

      return createAvailableResult(
        request.fromLocationId === "B" && request.toLocationId === "A"
          ? 27
          : 20,
      );
    });
    const matrix = await buildTravelMatrix({
      originLocationId: "O",
      propertyLocationIds: ["A", "B"],
      provider,
    });

    expect(calls).toHaveLength(4);
    expect(requireEdge(matrix, "A", "B")).toEqual({
      fromLocationId: "A",
      toLocationId: "B",
      transit: { status: "unavailable" },
      taxi: { status: "unavailable" },
      dataStatus: "unavailable",
      failure: { kind: "provider_failure" },
    });
    expect(requireEdge(matrix, "B", "A").transit).toMatchObject({
      durationMinutes: 27,
    });
    expect(JSON.stringify(matrix)).not.toContain("SECRET provider message");
  });

  it("turns malformed transit payloads into provider-failure edges", async () => {
    const invalidTransitAlternatives: readonly unknown[] = [
      {
        status: "available",
        durationMinutes: -1,
        cost: 4,
        transferCount: 1,
        walkMeters: 300,
      },
      {
        status: "available",
        durationMinutes: 1.5,
        cost: 4,
        transferCount: 1,
        walkMeters: 300,
      },
      {
        status: "available",
        durationMinutes: Infinity,
        cost: 4,
        transferCount: 1,
        walkMeters: 300,
      },
      {
        status: "available",
        durationMinutes: 20,
        cost: -1,
        transferCount: 1,
        walkMeters: 300,
      },
      {
        status: "available",
        durationMinutes: 20,
        cost: 4,
        transferCount: 1.5,
        walkMeters: 300,
      },
      {
        status: "available",
        durationMinutes: 20,
        cost: 4,
        transferCount: 1,
        walkMeters: NaN,
      },
      {
        status: "degraded",
        durationMinutes: 20,
        cost: 4,
        transferCount: 1,
      },
    ];

    for (const transit of invalidTransitAlternatives) {
      const { provider } = createRecordingProvider(
        () =>
          ({
            transit,
            taxi: { status: "available", durationMinutes: 10, cost: 18 },
          }) as unknown as TravelProviderResult,
      );
      const edge = requireEdge(
        await buildTravelMatrix({
          originLocationId: "O",
          propertyLocationIds: ["A"],
          provider,
        }),
        "O",
        "A",
      );

      expect(edge.dataStatus).toBe("unavailable");
      expect(edge.failure).toEqual({ kind: "provider_failure" });
      expect(edge.transit).toEqual({ status: "unavailable" });
      expect(edge.taxi).toEqual({ status: "unavailable" });
    }
  });

  it("turns malformed taxi or result payloads into provider-failure edges", async () => {
    const invalidResults: readonly unknown[] = [
      {
        transit: createAvailableResult().transit,
        taxi: { status: "available", durationMinutes: -1, cost: 18 },
      },
      {
        transit: createAvailableResult().transit,
        taxi: { status: "degraded", durationMinutes: 10.5, cost: 18 },
      },
      {
        transit: createAvailableResult().transit,
        taxi: { status: "available", durationMinutes: 10, cost: NaN },
      },
      { transit: createAvailableResult().transit },
      null,
    ];

    for (const result of invalidResults) {
      const { provider } = createRecordingProvider(
        () => result as TravelProviderResult,
      );
      const edge = requireEdge(
        await buildTravelMatrix({
          originLocationId: "O",
          propertyLocationIds: ["A"],
          provider,
        }),
        "O",
        "A",
      );

      expect(edge).toMatchObject({
        transit: { status: "unavailable" },
        taxi: { status: "unavailable" },
        dataStatus: "unavailable",
        failure: { kind: "provider_failure" },
      });
    }
  });
});

describe("matrix immutability", () => {
  it("deeply freezes successful and failed matrix structures", async () => {
    const { provider } = createRecordingProvider((request) => {
      if (request.toLocationId === "B") {
        throw new Error("provider failed");
      }

      return createAvailableResult();
    });
    const matrix = await buildTravelMatrix({
      originLocationId: "O",
      propertyLocationIds: ["A", "B"],
      provider,
    });
    const successfulEdge = requireEdge(matrix, "O", "A");
    const failedEdge = requireEdge(matrix, "O", "B");

    expect(Object.isFrozen(matrix)).toBe(true);
    expect(Object.isFrozen(matrix.edgesByFrom)).toBe(true);
    expect(Object.isFrozen(matrix.edgesByFrom.O)).toBe(true);
    expect(Object.isFrozen(successfulEdge)).toBe(true);
    expect(Object.isFrozen(successfulEdge.transit)).toBe(true);
    expect(Object.isFrozen(successfulEdge.taxi)).toBe(true);
    expect(Object.isFrozen(failedEdge)).toBe(true);
    expect(Object.isFrozen(failedEdge.transit)).toBe(true);
    expect(Object.isFrozen(failedEdge.taxi)).toBe(true);
    expect(Object.isFrozen(failedEdge.failure)).toBe(true);
  });

  it("copies provider results instead of retaining mutable aliases", async () => {
    const providerResult = {
      transit: {
        status: "available" as const,
        durationMinutes: 20,
        cost: 4,
        transferCount: 1,
        walkMeters: 300,
      },
      taxi: {
        status: "available" as const,
        durationMinutes: 10,
        cost: 18,
      },
    };
    const provider: TravelTimeProvider = {
      async getTravel() {
        return providerResult;
      },
    };
    const matrix = await buildTravelMatrix({
      originLocationId: "O",
      propertyLocationIds: ["A"],
      provider,
    });

    providerResult.transit.durationMinutes = 999;
    providerResult.taxi.cost = 999;

    expect(requireEdge(matrix, "O", "A").transit).toMatchObject({
      durationMinutes: 20,
    });
    expect(requireEdge(matrix, "O", "A").taxi).toMatchObject({ cost: 18 });
  });
});

describe("builder input boundary", () => {
  it("returns a frozen empty matrix and makes no calls for no properties", async () => {
    const { provider, calls } = createRecordingProvider();
    const matrix = await buildTravelMatrix({
      originLocationId: "O",
      propertyLocationIds: [],
      provider,
    });

    expect(calls).toEqual([]);
    expect(Object.keys(matrix.edgesByFrom)).toEqual([]);
    expect(Object.isFrozen(matrix.edgesByFrom)).toBe(true);
    expect(Object.isFrozen(matrix)).toBe(true);
  });

  it("rejects blank origin identities before provider acquisition", async () => {
    for (const originLocationId of ["", "   "]) {
      const { provider, calls } = createRecordingProvider();

      await expect(
        buildTravelMatrix({
          originLocationId,
          propertyLocationIds: ["A"],
          provider,
        }),
      ).rejects.toThrow(RangeError);
      expect(calls).toEqual([]);
    }
  });

  it("rejects any blank property identity before provider acquisition", async () => {
    for (const invalidLocationId of ["", "   "]) {
      const { provider, calls } = createRecordingProvider();

      await expect(
        buildTravelMatrix({
          originLocationId: "O",
          propertyLocationIds: ["A", invalidLocationId],
          provider,
        }),
      ).rejects.toThrow(RangeError);
      expect(calls).toEqual([]);
    }
  });

  it("does not trim valid identities before requesting travel", async () => {
    const { provider, calls } = createRecordingProvider();

    await buildTravelMatrix({
      originLocationId: " O ",
      propertyLocationIds: [" A "],
      provider,
    });

    expect(calls).toEqual([
      { fromLocationId: " O ", toLocationId: " A " },
    ]);
  });
});
