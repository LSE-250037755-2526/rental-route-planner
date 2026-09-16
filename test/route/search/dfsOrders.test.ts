import { describe, expect, it } from "vitest";

import { generateDailyOrderCandidatesDfs } from "../../../src/lib/route/search/dfsOrders";
import type {
  DailyOrderSearchStrategy,
  DailyPropertyOrder,
  OrderSearchPrefixContext,
} from "../../../src/lib/route/search/types";
import type {
  NormalizedProperty,
  NormalizedViewingTime,
} from "../../../src/lib/route/types";

const FLEXIBLE_VIEWING_TIME: NormalizedViewingTime = Object.freeze({
  type: "flexible",
  window: Object.freeze({ earliestStart: 540, latestStart: 1080 }),
});

function fixedViewingTime(start: number): NormalizedViewingTime {
  return Object.freeze({
    type: "fixed",
    window: Object.freeze({ earliestStart: start, latestStart: start }),
  });
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
    viewingTime: FLEXIBLE_VIEWING_TIME,
    importance: "if_time",
    durationMinutes: 30,
    status: "pending",
    ...overrides,
  });
}

function generate(
  properties: readonly NormalizedProperty[],
  canExplorePrefix?: (context: OrderSearchPrefixContext) => boolean,
) {
  return generateDailyOrderCandidatesDfs({
    properties,
    ...(canExplorePrefix === undefined ? {} : { canExplorePrefix }),
  });
}

function fingerprints(orders: readonly DailyPropertyOrder[]): readonly string[] {
  return orders.map((order) => JSON.stringify(order));
}

describe("generateDailyOrderCandidatesDfs candidate space", () => {
  it("returns a frozen empty collection for empty input", () => {
    const result = generate([]);

    expect(result).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("emits exactly one non-empty order for one optional property", () => {
    expect(generate([createProperty("A")])).toEqual([["A"]]);
  });

  it("emits exactly one order for one must property", () => {
    expect(
      generate([createProperty("A", { importance: "must" })]),
    ).toEqual([["A"]]);
  });

  it("uses exact stable DFS traversal for two optional properties", () => {
    expect(generate([createProperty("A"), createProperty("B")])).toEqual([
      ["A"],
      ["A", "B"],
      ["B"],
      ["B", "A"],
    ]);
  });

  it("emits only full permutations for two must properties", () => {
    const result = generate([
      createProperty("A", { importance: "must" }),
      createProperty("B", { importance: "must" }),
    ]);

    expect(result).toEqual([
      ["A", "B"],
      ["B", "A"],
    ]);
    expect(result).not.toContainEqual(["A"]);
    expect(result).not.toContainEqual(["B"]);
  });

  it("preserves a must property while branching over one optional property", () => {
    expect(
      generate([
        createProperty("A", { importance: "must" }),
        createProperty("B"),
      ]),
    ).toEqual([
      ["A"],
      ["A", "B"],
      ["B", "A"],
    ]);
  });

  it("covers all 15 unique non-empty ordered subsets of three optional properties", () => {
    const result = generate([
      createProperty("A"),
      createProperty("B"),
      createProperty("C"),
    ]);
    const actualFingerprints = new Set(fingerprints(result));
    const expectedOrders = [
      ["A"],
      ["B"],
      ["C"],
      ["A", "B"],
      ["A", "C"],
      ["B", "A"],
      ["B", "C"],
      ["C", "A"],
      ["C", "B"],
      ["A", "B", "C"],
      ["A", "C", "B"],
      ["B", "A", "C"],
      ["B", "C", "A"],
      ["C", "A", "B"],
      ["C", "B", "A"],
    ];

    expect(result).toHaveLength(15);
    expect(actualFingerprints.size).toBe(15);
    expect(actualFingerprints).toEqual(
      new Set(expectedOrders.map((order) => JSON.stringify(order))),
    );
    expect(result).not.toContainEqual([]);
  });

  it("covers 11 stable orders for one must and two optional properties", () => {
    const result = generate([
      createProperty("A", { importance: "must" }),
      createProperty("B"),
      createProperty("C"),
    ]);

    expect(result).toEqual([
      ["A"],
      ["A", "B"],
      ["A", "B", "C"],
      ["A", "C"],
      ["A", "C", "B"],
      ["B", "A"],
      ["B", "A", "C"],
      ["B", "C", "A"],
      ["C", "A"],
      ["C", "A", "B"],
      ["C", "B", "A"],
    ]);
    expect(result).toHaveLength(11);
    expect(result.every((order) => order.includes("A"))).toBe(true);
    expect(new Set(fingerprints(result)).size).toBe(11);
  });

  it("does not pre-filter reverse chronological fixed-time orders", () => {
    const result = generate([
      createProperty("A", { viewingTime: fixedViewingTime(900) }),
      createProperty("B", { viewingTime: fixedViewingTime(600) }),
    ]);

    expect(result).toContainEqual(["A", "B"]);
    expect(result).toContainEqual(["B", "A"]);
  });

  it("provides Case 01 order coverage without deciding fixed feasibility", () => {
    const result = generate([
      createProperty("A", {
        importance: "must",
        viewingTime: fixedViewingTime(600),
      }),
      createProperty("B", {
        importance: "must",
        viewingTime: fixedViewingTime(680),
      }),
    ]);

    expect(result).toEqual([
      ["A", "B"],
      ["B", "A"],
    ]);
  });

  it("preserves Case 10 alternate orders without transport input", () => {
    const result = generate([
      createProperty("A", { importance: "must" }),
      createProperty("B", { importance: "must" }),
    ]);

    expect(result).toContainEqual(["A", "B"]);
    expect(result).toContainEqual(["B", "A"]);
  });

  it("preserves every Case 11 must property while retaining optional branches", () => {
    const result = generate([
      createProperty("M", { importance: "must" }),
      createProperty("B"),
      createProperty("C"),
    ]);

    expect(result.every((order) => order.includes("M"))).toBe(true);
    expect(result).toContainEqual(["M"]);
    expect(result).toContainEqual(["B", "M"]);
    expect(result).toContainEqual(["C", "B", "M"]);
  });
});

describe("generateDailyOrderCandidatesDfs prefix pruning", () => {
  it("prunes a rejected prefix and its descendants while preserving siblings", () => {
    const properties = [
      createProperty("A"),
      createProperty("B"),
      createProperty("C"),
    ];
    const result = generate(
      properties,
      ({ prefixPropertyIds }) =>
        JSON.stringify(prefixPropertyIds) !== JSON.stringify(["A", "B"]),
    );

    expect(result).not.toContainEqual(["A", "B"]);
    expect(result).not.toContainEqual(["A", "B", "C"]);
    expect(result).toEqual([
      ["A"],
      ["A", "C"],
      ["A", "C", "B"],
      ["B"],
      ["B", "A"],
      ["B", "A", "C"],
      ["B", "C"],
      ["B", "C", "A"],
      ["C"],
      ["C", "A"],
      ["C", "A", "B"],
      ["C", "B"],
      ["C", "B", "A"],
    ]);
  });

  it("passes exact fresh frozen prefix and remaining copies to the callback", () => {
    const contexts: OrderSearchPrefixContext[] = [];
    const result = generate(
      [createProperty("A"), createProperty("B")],
      (context) => {
        expect(Object.isFrozen(context)).toBe(true);
        expect(Object.isFrozen(context.prefixPropertyIds)).toBe(true);
        expect(Object.isFrozen(context.remainingPropertyIds)).toBe(true);
        expect(() =>
          (context.prefixPropertyIds as string[]).push("mutation"),
        ).toThrow(TypeError);
        expect(() =>
          (context.remainingPropertyIds as string[]).push("mutation"),
        ).toThrow(TypeError);
        contexts.push(context);
        return true;
      },
    );

    expect(
      contexts.map(({ prefixPropertyIds, remainingPropertyIds }) => ({
        prefixPropertyIds,
        remainingPropertyIds,
      })),
    ).toEqual([
      { prefixPropertyIds: ["A"], remainingPropertyIds: ["B"] },
      { prefixPropertyIds: ["A", "B"], remainingPropertyIds: [] },
      { prefixPropertyIds: ["B"], remainingPropertyIds: ["A"] },
      { prefixPropertyIds: ["B", "A"], remainingPropertyIds: [] },
    ]);
    expect(contexts[0].prefixPropertyIds).not.toBe(
      contexts[1].prefixPropertyIds,
    );
    expect(result).toEqual([
      ["A"],
      ["A", "B"],
      ["B"],
      ["B", "A"],
    ]);
  });

  it("repeats callback invocation order and candidate output exactly", () => {
    const properties = [
      createProperty("A"),
      createProperty("B"),
      createProperty("C"),
    ];

    function runWithTrace() {
      const trace: string[] = [];
      const result = generate(properties, ({ prefixPropertyIds }) => {
        trace.push(JSON.stringify(prefixPropertyIds));
        return prefixPropertyIds.length < 2;
      });

      return { trace, result };
    }

    expect(runWithTrace()).toEqual(runWithTrace());
  });
});

describe("generateDailyOrderCandidatesDfs determinism and boundaries", () => {
  it("deduplicates with collision-safe property-ID fingerprints", () => {
    const result = generate([
      createProperty("A|B"),
      createProperty("C"),
      createProperty("A"),
      createProperty("B|C"),
    ]);
    const resultFingerprints = fingerprints(result);

    expect(result).toContainEqual(["A|B", "C"]);
    expect(result).toContainEqual(["A", "B|C"]);
    expect(["A|B", "C"].join("|")).toBe(["A", "B|C"].join("|"));
    expect(JSON.stringify(["A|B", "C"])).not.toBe(
      JSON.stringify(["A", "B|C"]),
    );
    expect(new Set(resultFingerprints).size).toBe(result.length);
  });

  it("does not mutate frozen inputs or nested property data", () => {
    const viewingTime = fixedViewingTime(600);
    const properties = Object.freeze([
      createProperty("A", { viewingTime }),
      createProperty("B", { agentName: "Agent B" }),
    ]);
    const input = Object.freeze({ properties });
    const snapshot = JSON.stringify(input);

    generateDailyOrderCandidatesDfs(input);

    expect(JSON.stringify(input)).toBe(snapshot);
    expect(input.properties).toBe(properties);
    expect(properties[0].viewingTime).toBe(viewingTime);
  });

  it("runtime-freezes the outer result and every emitted order", () => {
    const result = generate([createProperty("A"), createProperty("B")]);

    expect(Object.isFrozen(result)).toBe(true);
    expect(result.every(Object.isFrozen)).toBe(true);
    expect(() =>
      (result as DailyPropertyOrder[]).push(Object.freeze(["mutation"])),
    ).toThrow(TypeError);
    expect(() => (result[0] as string[]).push("mutation")).toThrow(TypeError);
  });

  it("returns deeply equal output in identical DFS order for repeated input", () => {
    const properties = [
      createProperty("C"),
      createProperty("A"),
      createProperty("B"),
    ];

    expect(generate(properties)).toEqual(generate(properties));
    expect(generate(properties)[0]).toEqual(["C"]);
  });

  it("accepts nine properties without a hard cap using deterministic pruning", () => {
    const properties = Array.from({ length: 9 }, (_, index) =>
      createProperty(`P${index + 1}`),
    );
    const result = generate(
      properties,
      ({ prefixPropertyIds }) => prefixPropertyIds.length === 1,
    );

    expect(result).toEqual(
      properties.map((property) => [property.id]),
    );
    expect(result).toHaveLength(9);
    expect(generate(
      properties,
      ({ prefixPropertyIds }) => prefixPropertyIds.length === 1,
    )).toEqual(result);
  });

  it("does not filter or reorder properties by runtime status", () => {
    const result = generate([
      createProperty("C", { status: "cancelled" }),
      createProperty("A", { status: "completed" }),
      createProperty("B", { status: "en_route" }),
    ]);

    expect(result[0]).toEqual(["C"]);
    expect(result).toContainEqual(["C", "A", "B"]);
    expect(result).toContainEqual(["B", "A", "C"]);
  });

  it("does not alter traversal for same or different agent names", () => {
    const withoutAgents = [createProperty("B"), createProperty("A")];
    const withAgents = [
      createProperty("B", { agentName: "Shared Agent" }),
      createProperty("A", { agentName: "Other Agent" }),
    ];

    expect(generate(withAgents)).toEqual(generate(withoutAgents));
    expect(generate(withAgents)[0]).toEqual(["B"]);
  });

  it("supports a strategy-compatible alternate test double", () => {
    const alternateOrder: DailyPropertyOrder = Object.freeze(["alternate"]);
    const alternateStrategy: DailyOrderSearchStrategy = Object.freeze({
      generate: () => Object.freeze([alternateOrder]),
    });

    expect(alternateStrategy.generate({ properties: [] })).toEqual([
      ["alternate"],
    ]);
  });
});
