import { describe, expect, it } from "vitest";

import {
  enumerateModeSequences,
  exhaustiveModeCombinationSearchStrategy,
  type EnumerateModeSequencesInput,
  type TransportModeCombinationSearchStrategy,
  type TransportModeSequence,
} from "../../../src/lib/route/search/enumerateModes";
import type {
  NormalizedProperty,
  TransportStrategy,
} from "../../../src/lib/route/types";
import type {
  TaxiTravelAlternative,
  TransitTravelAlternative,
  TravelEdge,
  TravelMatrix,
} from "../../../src/lib/travel/types";

const UNAVAILABLE_TRANSIT: TransitTravelAlternative = Object.freeze({
  status: "unavailable",
});
const UNAVAILABLE_TAXI: TaxiTravelAlternative = Object.freeze({
  status: "unavailable",
});

function usableTransit(
  overrides: Readonly<{
    status?: "available" | "degraded";
    durationMinutes?: number;
    cost?: number;
    transferCount?: number;
    walkMeters?: number;
  }> = {},
): TransitTravelAlternative {
  return Object.freeze({
    status: overrides.status ?? "available",
    durationMinutes: overrides.durationMinutes ?? 20,
    cost: overrides.cost ?? 3,
    transferCount: overrides.transferCount ?? 0,
    walkMeters: overrides.walkMeters ?? 100,
  });
}

function usableTaxi(
  overrides: Readonly<{
    status?: "available" | "degraded";
    durationMinutes?: number;
    cost?: number;
  }> = {},
): TaxiTravelAlternative {
  return Object.freeze({
    status: overrides.status ?? "available",
    durationMinutes: overrides.durationMinutes ?? 10,
    cost: overrides.cost ?? 20,
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

function createEdge(
  fromLocationId: string,
  toLocationId: string,
  options: Readonly<{
    transit?: TransitTravelAlternative;
    taxi?: TaxiTravelAlternative;
    providerFailure?: boolean;
  }> = {},
): TravelEdge {
  const transit = options.transit ?? usableTransit();
  const taxi = options.taxi ?? usableTaxi();
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

function createRouteEdges(
  properties: readonly NormalizedProperty[],
  alternatives: Readonly<{
    transit?: TransitTravelAlternative;
    taxi?: TaxiTravelAlternative;
  }> = {},
): readonly TravelEdge[] {
  return properties.map((property, index) =>
    createEdge(
      index === 0 ? "origin" : properties[index - 1].locationId,
      property.locationId,
      alternatives,
    ),
  );
}

function enumerate(
  orderedProperties: readonly NormalizedProperty[],
  travelMatrix: TravelMatrix,
  transportStrategy: TransportStrategy = "transit_first",
): readonly TransportModeSequence[] {
  return enumerateModeSequences({
    transportStrategy,
    originLocationId: "origin",
    orderedProperties,
    travelMatrix,
  });
}

describe("enumerateModeSequences empty and one-property orders", () => {
  it("returns exactly one frozen empty assignment for an empty order", () => {
    const result = enumerate([], createMatrix());

    expect(result).toEqual([[]]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
  });

  it("emits only transit for transit-only data under every strategy", () => {
    const property = createProperty("A");
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        taxi: UNAVAILABLE_TAXI,
      }),
    );

    for (const strategy of [
      "transit_only",
      "transit_first",
      "efficiency_first",
    ] as const) {
      expect(enumerate([property], matrix, strategy)).toEqual([["transit"]]);
    }
  });

  it("emits no sequence for taxi-only data under transit_only", () => {
    const property = createProperty("A");
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: UNAVAILABLE_TRANSIT,
      }),
    );

    expect(enumerate([property], matrix, "transit_only")).toEqual([]);
  });

  it("emits taxi for taxi-only available data under taxi-permitting strategies", () => {
    const property = createProperty("A");
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: UNAVAILABLE_TRANSIT,
      }),
    );

    expect(enumerate([property], matrix, "transit_first")).toEqual([["taxi"]]);
    expect(enumerate([property], matrix, "efficiency_first")).toEqual([
      ["taxi"],
    ]);
  });

  it("provides the Case 06 transit-first foundation with both one-leg modes", () => {
    const property = createProperty("A");
    const matrix = createMatrix(createEdge("origin", property.locationId));

    expect(enumerate([property], matrix)).toEqual([
      ["transit"],
      ["taxi"],
    ]);
  });

  it("excludes taxi from a dual-usable leg under transit_only", () => {
    const property = createProperty("A");
    const matrix = createMatrix(createEdge("origin", property.locationId));

    expect(enumerate([property], matrix, "transit_only")).toEqual([
      ["transit"],
    ]);
  });

  it("emits no sequence when both alternatives are unavailable", () => {
    const property = createProperty("A");
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: UNAVAILABLE_TRANSIT,
        taxi: UNAVAILABLE_TAXI,
      }),
    );

    expect(enumerate([property], matrix)).toEqual([]);
  });

  it("treats degraded transit as usable", () => {
    const property = createProperty("A");
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: usableTransit({ status: "degraded" }),
        taxi: UNAVAILABLE_TAXI,
      }),
    );

    expect(enumerate([property], matrix, "transit_only")).toEqual([
      ["transit"],
    ]);
  });

  it("treats degraded taxi-only data as usable when strategy permits taxi", () => {
    const property = createProperty("A");
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: UNAVAILABLE_TRANSIT,
        taxi: usableTaxi({ status: "degraded" }),
      }),
    );

    expect(enumerate([property], matrix, "transit_first")).toEqual([["taxi"]]);
    expect(enumerate([property], matrix, "efficiency_first")).toEqual([
      ["taxi"],
    ]);
  });

  it("does not invent a mode for a provider-failure edge", () => {
    const property = createProperty("A");
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: UNAVAILABLE_TRANSIT,
        taxi: UNAVAILABLE_TAXI,
        providerFailure: true,
      }),
    );

    expect(enumerate([property], matrix)).toEqual([]);
  });
});

describe("enumerateModeSequences directed traversal and case foundations", () => {
  it("does not use an available reverse edge when the selected direction is missing", () => {
    const property = createProperty("A");
    const reverseOnly = createMatrix(
      createEdge(property.locationId, "origin"),
    );

    expect(enumerate([property], reverseOnly)).toEqual([]);
  });

  it("terminates every complete branch when a later directed edge is missing", () => {
    const first = createProperty("A");
    const second = createProperty("B");
    const matrix = createMatrix(createEdge("origin", first.locationId));

    expect(enumerate([first, second], matrix)).toEqual([]);
  });

  it("uses origin for the first leg, the previous property later, and no return leg", () => {
    const first = createProperty("A");
    const second = createProperty("B");
    const matrix = createMatrix(
      createEdge("origin", first.locationId, { taxi: UNAVAILABLE_TAXI }),
      createEdge(first.locationId, second.locationId, {
        taxi: UNAVAILABLE_TAXI,
      }),
      createEdge("origin", second.locationId, {
        transit: UNAVAILABLE_TRANSIT,
      }),
    );

    expect(enumerate([first, second], matrix)).toEqual([
      ["transit", "transit"],
    ]);
  });

  it("emits the exact Case 09 DFS order for two dual-usable legs", () => {
    const properties = [createProperty("A"), createProperty("B")];
    const matrix = createMatrix(...createRouteEdges(properties));

    expect(enumerate(properties, matrix)).toEqual([
      ["transit", "transit"],
      ["transit", "taxi"],
      ["taxi", "transit"],
      ["taxi", "taxi"],
    ]);
  });

  it("emits all eight combinations including three taxis for three dual-usable legs", () => {
    const properties = [
      createProperty("A"),
      createProperty("B"),
      createProperty("C"),
    ];
    const matrix = createMatrix(...createRouteEdges(properties));
    const result = enumerate(properties, matrix);

    expect(result).toHaveLength(8);
    expect(result).toContainEqual(["taxi", "taxi", "taxi"]);
  });

  it("allows efficiency_first to explore the same exhaustive legal space", () => {
    const properties = [
      createProperty("A"),
      createProperty("B"),
      createProperty("C"),
    ];
    const matrix = createMatrix(...createRouteEdges(properties));

    expect(enumerate(properties, matrix, "efficiency_first")).toEqual(
      enumerate(properties, matrix, "transit_first"),
    );
  });

  it("preserves the Case 08 taxi-containing sequence for later completion evaluation", () => {
    const first = createProperty("A");
    const second = createProperty("B");
    const matrix = createMatrix(
      createEdge("origin", first.locationId, { taxi: UNAVAILABLE_TAXI }),
      createEdge(first.locationId, second.locationId),
    );

    expect(enumerate([first, second], matrix)).toEqual([
      ["transit", "transit"],
      ["transit", "taxi"],
    ]);
  });

  it("provides independent directed mode spaces for both Case 10 property orders", () => {
    const first = createProperty("A");
    const second = createProperty("B");
    const matrix = createMatrix(
      createEdge("origin", first.locationId, { taxi: UNAVAILABLE_TAXI }),
      createEdge("origin", second.locationId, { taxi: UNAVAILABLE_TAXI }),
      createEdge(first.locationId, second.locationId, {
        transit: UNAVAILABLE_TRANSIT,
      }),
      createEdge(second.locationId, first.locationId, {
        taxi: UNAVAILABLE_TAXI,
      }),
    );

    expect(enumerate([first, second], matrix)).toEqual([
      ["transit", "taxi"],
    ]);
    expect(enumerate([second, first], matrix)).toEqual([
      ["transit", "transit"],
    ]);
  });

  it("keeps transit before taxi without inspecting Case 07 durations", () => {
    const property = createProperty("A");
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: usableTransit({ durationMinutes: 55 }),
        taxi: usableTaxi({ durationMinutes: 18 }),
      }),
    );

    expect(enumerate([property], matrix)).toEqual([
      ["transit"],
      ["taxi"],
    ]);
  });

  it("does not use transfer or walking risk metadata to prune legal modes", () => {
    const property = createProperty("A");
    const matrix = createMatrix(
      createEdge("origin", property.locationId, {
        transit: usableTransit({ transferCount: 20, walkMeters: 20_000 }),
      }),
    );

    expect(enumerate([property], matrix)).toEqual([
      ["transit"],
      ["taxi"],
    ]);
  });
});

describe("enumerateModeSequences boundaries and determinism", () => {
  it("accepts more than eight legs without a hard property cap", () => {
    const properties = Array.from({ length: 9 }, (_, index) =>
      createProperty(`P${index + 1}`),
    );
    const matrix = createMatrix(
      ...createRouteEdges(properties, { taxi: UNAVAILABLE_TAXI }),
    );
    const result = enumerate(properties, matrix, "transit_only");

    expect(result).toEqual([Array.from({ length: 9 }, () => "transit")]);
  });

  it("does not mutate frozen properties, matrix rows, edges, or alternatives", () => {
    const properties = Object.freeze([
      createProperty("A"),
      createProperty("B"),
    ]);
    const edges = createRouteEdges(properties);
    const matrix = createMatrix(...edges);
    const input: EnumerateModeSequencesInput = Object.freeze({
      transportStrategy: "transit_first",
      originLocationId: "origin",
      orderedProperties: properties,
      travelMatrix: matrix,
    });
    const snapshot = JSON.stringify(input);

    enumerateModeSequences(input);

    expect(JSON.stringify(input)).toBe(snapshot);
    expect(input.orderedProperties).toBe(properties);
    expect(input.travelMatrix).toBe(matrix);
    expect(Object.isFrozen(edges[0])).toBe(true);
    expect(Object.isFrozen(edges[0].transit)).toBe(true);
    expect(Object.isFrozen(edges[0].taxi)).toBe(true);
  });

  it("runtime-freezes the outer result and every emitted sequence", () => {
    const property = createProperty("A");
    const result = enumerate(
      [property],
      createMatrix(createEdge("origin", property.locationId)),
    );

    expect(Object.isFrozen(result)).toBe(true);
    expect(result.every(Object.isFrozen)).toBe(true);
    expect(() =>
      (result as TransportModeSequence[]).push(Object.freeze(["transit"])),
    ).toThrow(TypeError);
    expect(() => (result[0] as string[]).push("taxi")).toThrow(TypeError);
  });

  it("returns deeply equal sequences in identical order for repeated input", () => {
    const properties = [createProperty("A"), createProperty("B")];
    const matrix = createMatrix(...createRouteEdges(properties));
    const input: EnumerateModeSequencesInput = {
      transportStrategy: "transit_first",
      originLocationId: "origin",
      orderedProperties: properties,
      travelMatrix: matrix,
    };

    expect(enumerateModeSequences(input)).toEqual(enumerateModeSequences(input));
  });

  it("emits no duplicate sequences in a four-leg binary legal space", () => {
    const properties = [
      createProperty("A"),
      createProperty("B"),
      createProperty("C"),
      createProperty("D"),
    ];
    const result = enumerate(
      properties,
      createMatrix(...createRouteEdges(properties)),
    );
    const fingerprints = result.map((sequence) => JSON.stringify(sequence));

    expect(result).toHaveLength(16);
    expect(new Set(fingerprints).size).toBe(result.length);
  });

  it("exposes a frozen replaceable strategy backed by exhaustive enumeration", () => {
    const strategy: TransportModeCombinationSearchStrategy =
      exhaustiveModeCombinationSearchStrategy;
    const property = createProperty("A");
    const input: EnumerateModeSequencesInput = {
      transportStrategy: "transit_first",
      originLocationId: "origin",
      orderedProperties: [property],
      travelMatrix: createMatrix(createEdge("origin", property.locationId)),
    };

    expect(Object.isFrozen(strategy)).toBe(true);
    expect(strategy.generate(input)).toEqual(enumerateModeSequences(input));
  });
});
