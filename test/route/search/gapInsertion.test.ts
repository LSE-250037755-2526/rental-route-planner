import { describe, expect, it } from "vitest";

import {
  deriveAnchors,
  type TimeAnchor,
} from "../../../src/lib/route/deriveAnchors";
import {
  generateGapInsertionCandidates,
  type GapInsertionPoint,
  type GenerateGapInsertionCandidatesInput,
  type ResolveTravelLowerBoundMinutes,
} from "../../../src/lib/route/search/gapInsertion";
import type { DailyPropertyOrder } from "../../../src/lib/route/search/types";
import type {
  DayPlanSettings,
  NormalizedProperty,
  NormalizedViewingTime,
} from "../../../src/lib/route/types";

const FLEXIBLE_VIEWING_TIME: NormalizedViewingTime = Object.freeze({
  type: "flexible",
  window: Object.freeze({ earliestStart: 540, latestStart: 1080 }),
});
const EMPTY_ROUTE_PREFERENCES = Object.freeze([]);

function createSettings(): DayPlanSettings {
  return Object.freeze({
    date: "2026-09-20",
    originLocationId: "origin",
    earliestStart: 540,
    latestEnd: 1080,
    transportStrategy: "transit_first",
    taxiBudget: Object.freeze({ type: "unset" as const }),
    fixedAppointmentBufferMinutes: 15,
    routePreferences: EMPTY_ROUTE_PREFERENCES,
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
    viewingTime: FLEXIBLE_VIEWING_TIME,
    importance: "if_time",
    durationMinutes: 30,
    status: "pending",
    ...overrides,
  });
}

function createAnchor(
  propertyId: string,
  overrides: Partial<TimeAnchor> = {},
): TimeAnchor {
  return Object.freeze({
    propertyId,
    locationId: `location-${propertyId}`,
    kind: "fixed",
    earliestStart: 670,
    latestStart: 670,
    requiredBufferMinutes: 10,
    ...overrides,
  });
}

function createResolver(
  values: Readonly<Record<string, number | null>>,
  trace?: string[],
): ResolveTravelLowerBoundMinutes {
  return (fromLocationId, toLocationId) => {
    const key = `${fromLocationId}->${toLocationId}`;
    trace?.push(key);

    return values[key] ?? null;
  };
}

function generate(
  overrides: Partial<GenerateGapInsertionCandidatesInput> = {},
): readonly DailyPropertyOrder[] {
  const priorAnchor = createAnchor("A", {
    earliestStart: 550,
    latestStart: 550,
  });
  const nextAnchor = createAnchor("C");

  return generateGapInsertionCandidates({
    baseOrder: Object.freeze(["A", "C"]),
    candidateProperties: Object.freeze([createProperty("B")]),
    anchors: Object.freeze([priorAnchor, nextAnchor]),
    gaps: Object.freeze([
      Object.freeze({
        insertionIndex: 1,
        fromLocationId: "location-A",
        currentEnd: 600,
        boundary: Object.freeze({
          kind: "anchor" as const,
          anchor: nextAnchor,
        }),
      }),
    ]),
    resolveTravelLowerBoundMinutes: createResolver({
      "location-A->location-B": 10,
      "location-B->location-C": 20,
    }),
    ...overrides,
  });
}

describe("generateGapInsertionCandidates boundaries", () => {
  it("inserts between two anchors when the full arithmetic exactly fits", () => {
    expect(generate()).toEqual([["A", "B", "C"]]);
  });

  it("emits no insertion when the next appointment would be one minute late", () => {
    expect(
      generate({
        resolveTravelLowerBoundMinutes: createResolver({
          "location-A->location-B": 10,
          "location-B->location-C": 21,
        }),
      }),
    ).toEqual([]);
  });

  it("rejects a wide-window insertion when waiting makes the next fixed anchor late", () => {
    const priorProperty = createProperty("A", {
      viewingTime: fixedViewingTime(550),
    });
    const candidate = createProperty("B", {
      viewingTime: windowViewingTime(700, 900),
    });
    const nextProperty = createProperty("C", {
      viewingTime: fixedViewingTime(750),
    });
    const anchors = deriveAnchors({
      settings: createSettings(),
      properties: [priorProperty, candidate, nextProperty],
    });
    const nextAnchor = anchors.find(({ propertyId }) => propertyId === "C");

    expect(anchors.map(({ propertyId }) => propertyId)).toEqual(["A", "C"]);
    expect(nextAnchor).toBeDefined();
    expect(
      generateGapInsertionCandidates({
        baseOrder: Object.freeze(["A", "C"]),
        candidateProperties: Object.freeze([candidate]),
        anchors,
        gaps: Object.freeze([
          Object.freeze({
            insertionIndex: 1,
            fromLocationId: "location-A",
            currentEnd: 600,
            boundary: Object.freeze({
              kind: "anchor" as const,
              anchor: nextAnchor!,
            }),
          }),
        ]),
        resolveTravelLowerBoundMinutes: createResolver({
          "location-A->location-B": 10,
          "location-B->location-C": 10,
        }),
      }),
    ).toEqual([]);
  });

  it("inserts a wide-window candidate when waiting reaches the exact next-anchor boundary", () => {
    const priorProperty = createProperty("A", {
      viewingTime: fixedViewingTime(550),
    });
    const candidate = createProperty("B", {
      viewingTime: windowViewingTime(700, 900),
    });
    const nextProperty = createProperty("C", {
      viewingTime: fixedViewingTime(755),
    });
    const anchors = deriveAnchors({
      settings: createSettings(),
      properties: [priorProperty, candidate, nextProperty],
    });
    const nextAnchor = anchors.find(({ propertyId }) => propertyId === "C");

    expect(anchors.map(({ propertyId }) => propertyId)).toEqual(["A", "C"]);
    expect(nextAnchor).toBeDefined();
    expect(
      generateGapInsertionCandidates({
        baseOrder: Object.freeze(["A", "C"]),
        candidateProperties: Object.freeze([candidate]),
        anchors,
        gaps: Object.freeze([
          Object.freeze({
            insertionIndex: 1,
            fromLocationId: "location-A",
            currentEnd: 600,
            boundary: Object.freeze({
              kind: "anchor" as const,
              anchor: nextAnchor!,
            }),
          }),
        ]),
        resolveTravelLowerBoundMinutes: createResolver({
          "location-A->location-B": 10,
          "location-B->location-C": 10,
        }),
      }),
    ).toEqual([["A", "B", "C"]]);
  });

  it("rejects a wide-window candidate reached after its own latest start", () => {
    const candidate = createProperty("B", {
      viewingTime: windowViewingTime(600, 810),
    });
    const anchors = deriveAnchors({
      settings: createSettings(),
      properties: [candidate],
    });

    expect(anchors).toEqual([]);
    expect(
      generateGapInsertionCandidates({
        baseOrder: Object.freeze(["A"]),
        candidateProperties: Object.freeze([candidate]),
        anchors,
        gaps: Object.freeze([
          Object.freeze({
            insertionIndex: 1,
            fromLocationId: "location-A",
            currentEnd: 800,
            boundary: Object.freeze({
              kind: "day_end" as const,
              latestEnd: 1000,
            }),
          }),
        ]),
        resolveTravelLowerBoundMinutes: createResolver({
          "location-A->location-B": 11,
        }),
      }),
    ).toEqual([]);
  });

  it("applies a flexible candidate's normalized earliest start", () => {
    const candidate = createProperty("B", {
      viewingTime: Object.freeze({
        type: "flexible",
        window: Object.freeze({ earliestStart: 700, latestStart: 900 }),
      }),
    });

    expect(
      generateGapInsertionCandidates({
        baseOrder: Object.freeze(["A"]),
        candidateProperties: Object.freeze([candidate]),
        anchors: Object.freeze([]),
        gaps: Object.freeze([
          Object.freeze({
            insertionIndex: 1,
            fromLocationId: "location-A",
            currentEnd: 600,
            boundary: Object.freeze({
              kind: "day_end" as const,
              latestEnd: 729,
            }),
          }),
        ]),
        resolveTravelLowerBoundMinutes: createResolver({
          "location-A->location-B": 10,
        }),
      }),
    ).toEqual([]);
  });

  it("inserts before the first anchor using the caller-supplied origin and current end", () => {
    const anchor = createAnchor("A", {
      latestStart: 600,
      earliestStart: 600,
      requiredBufferMinutes: 0,
    });
    const gap: GapInsertionPoint = Object.freeze({
      insertionIndex: 0,
      fromLocationId: "origin",
      currentEnd: 540,
      boundary: Object.freeze({ kind: "anchor", anchor }),
    });

    expect(
      generate({
        baseOrder: Object.freeze(["A"]),
        anchors: Object.freeze([anchor]),
        gaps: Object.freeze([gap]),
        resolveTravelLowerBoundMinutes: createResolver({
          "origin->location-B": 10,
          "location-B->location-A": 10,
        }),
      }),
    ).toEqual([["B", "A"]]);
  });

  it("inserts after the last anchor without resolving onward travel", () => {
    const trace: string[] = [];

    expect(
      generate({
        baseOrder: Object.freeze(["A"]),
        anchors: Object.freeze([]),
        gaps: Object.freeze([
          Object.freeze({
            insertionIndex: 1,
            fromLocationId: "location-A",
            currentEnd: 600,
            boundary: Object.freeze({
              kind: "day_end" as const,
              latestEnd: 640,
            }),
          }),
        ]),
        resolveTravelLowerBoundMinutes: createResolver(
          { "location-A->location-B": 10 },
          trace,
        ),
      }),
    ).toEqual([["A", "B"]]);
    expect(trace).toEqual(["location-A->location-B"]);
  });

  it("passes the next fixed anchor's required buffer to the rule", () => {
    const anchor = createAnchor("C", {
      latestStart: 650,
      earliestStart: 650,
      requiredBufferMinutes: 15,
    });

    expect(
      generate({
        anchors: Object.freeze([anchor]),
        gaps: Object.freeze([
          Object.freeze({
            insertionIndex: 1,
            fromLocationId: "location-A",
            currentEnd: 600,
            boundary: Object.freeze({ kind: "anchor" as const, anchor }),
          }),
        ]),
        resolveTravelLowerBoundMinutes: createResolver({
          "location-A->location-B": 5,
          "location-B->location-C": 10,
        }),
      }),
    ).toEqual([]);
  });

  it("does not invent a buffer for a narrow-window anchor", () => {
    const anchor = createAnchor("C", {
      kind: "narrow_window",
      earliestStart: 640,
      latestStart: 650,
      requiredBufferMinutes: 0,
    });

    expect(
      generate({
        anchors: Object.freeze([anchor]),
        gaps: Object.freeze([
          Object.freeze({
            insertionIndex: 1,
            fromLocationId: "location-A",
            currentEnd: 600,
            boundary: Object.freeze({ kind: "anchor" as const, anchor }),
          }),
        ]),
        resolveTravelLowerBoundMinutes: createResolver({
          "location-A->location-B": 5,
          "location-B->location-C": 15,
        }),
      }),
    ).toEqual([["A", "B", "C"]]);
  });

  it("rejects an insertion when onward travel alone makes it miss", () => {
    expect(
      generate({
        resolveTravelLowerBoundMinutes: createResolver({
          "location-A->location-B": 10,
          "location-B->location-C": 31,
        }),
      }),
    ).toEqual([]);
  });
});

describe("generateGapInsertionCandidates travel boundary", () => {
  it("skips an attempt when travel to the candidate is unavailable", () => {
    expect(
      generate({
        resolveTravelLowerBoundMinutes: createResolver({
          "location-A->location-B": null,
          "location-B->location-C": 0,
        }),
      }),
    ).toEqual([]);
  });

  it("skips an attempt when onward travel is unavailable", () => {
    expect(
      generate({
        resolveTravelLowerBoundMinutes: createResolver({
          "location-A->location-B": 0,
          "location-B->location-C": null,
        }),
      }),
    ).toEqual([]);
  });

  it("invokes anchor travel legs in deterministic order", () => {
    function run() {
      const trace: string[] = [];
      const result = generate({
        resolveTravelLowerBoundMinutes: createResolver(
          {
            "location-A->location-B": 10,
            "location-B->location-C": 20,
          },
          trace,
        ),
      });

      return { result, trace };
    }

    expect(run()).toEqual(run());
    expect(run().trace).toEqual([
      "location-A->location-B",
      "location-B->location-C",
    ]);
  });
});

describe("generateGapInsertionCandidates traversal and eligibility", () => {
  it("traverses gaps first and candidates second without sorting either", () => {
    const candidateProperties = Object.freeze([
      createProperty("C"),
      createProperty("B"),
    ]);
    const gaps: readonly GapInsertionPoint[] = Object.freeze([
      Object.freeze({
        insertionIndex: 0,
        fromLocationId: "origin",
        currentEnd: 540,
        boundary: Object.freeze({ kind: "day_end" as const, latestEnd: 900 }),
      }),
      Object.freeze({
        insertionIndex: 1,
        fromLocationId: "location-A",
        currentEnd: 600,
        boundary: Object.freeze({ kind: "day_end" as const, latestEnd: 900 }),
      }),
    ]);

    expect(
      generate({
        baseOrder: Object.freeze(["A"]),
        candidateProperties,
        anchors: Object.freeze([]),
        gaps,
        resolveTravelLowerBoundMinutes: () => 0,
      }),
    ).toEqual([
      ["C", "A"],
      ["B", "A"],
      ["A", "C"],
      ["A", "B"],
    ]);
  });

  it("deduplicates equivalent gap results and retains the first occurrence", () => {
    const gap = Object.freeze({
      insertionIndex: 1,
      fromLocationId: "location-A",
      currentEnd: 600,
      boundary: Object.freeze({ kind: "day_end" as const, latestEnd: 900 }),
    });

    expect(
      generate({
        baseOrder: Object.freeze(["A"]),
        anchors: Object.freeze([]),
        gaps: Object.freeze([gap, Object.freeze({ ...gap })]),
        resolveTravelLowerBoundMinutes: () => 0,
      }),
    ).toEqual([["A", "B"]]);
  });

  it("skips a property already present in the base order before travel resolution", () => {
    const trace: string[] = [];

    expect(
      generate({
        baseOrder: Object.freeze(["A", "B"]),
        candidateProperties: Object.freeze([createProperty("B")]),
        anchors: Object.freeze([]),
        gaps: Object.freeze([
          Object.freeze({
            insertionIndex: 1,
            fromLocationId: "location-A",
            currentEnd: 600,
            boundary: Object.freeze({ kind: "day_end" as const, latestEnd: 900 }),
          }),
        ]),
        resolveTravelLowerBoundMinutes: createResolver({}, trace),
      }),
    ).toEqual([]);
    expect(trace).toEqual([]);
  });

  it("inserts only flexible and wide-window candidates", () => {
    const narrowAnchor = createAnchor("N", {
      kind: "narrow_window",
      requiredBufferMinutes: 0,
    });
    const candidates = Object.freeze([
      createProperty("F", { viewingTime: fixedViewingTime(700) }),
      createProperty("N", { viewingTime: windowViewingTime(600, 630) }),
      createProperty("U", { viewingTime: unconfirmedViewingTime() }),
      createProperty("L"),
      createProperty("W", { viewingTime: windowViewingTime(600, 900) }),
    ]);

    expect(
      generate({
        baseOrder: Object.freeze(["A"]),
        candidateProperties: candidates,
        anchors: Object.freeze([narrowAnchor]),
        gaps: Object.freeze([
          Object.freeze({
            insertionIndex: 1,
            fromLocationId: "location-A",
            currentEnd: 600,
            boundary: Object.freeze({ kind: "day_end" as const, latestEnd: 900 }),
          }),
        ]),
        resolveTravelLowerBoundMinutes: () => 0,
      }),
    ).toEqual([
      ["A", "L"],
      ["A", "W"],
    ]);
  });

  it("does not filter or reorder candidates by status", () => {
    expect(
      generate({
        baseOrder: Object.freeze(["A"]),
        candidateProperties: Object.freeze([
          createProperty("C", { status: "cancelled" }),
          createProperty("B", { status: "completed" }),
        ]),
        anchors: Object.freeze([]),
        gaps: Object.freeze([
          Object.freeze({
            insertionIndex: 1,
            fromLocationId: "location-A",
            currentEnd: 600,
            boundary: Object.freeze({ kind: "day_end" as const, latestEnd: 900 }),
          }),
        ]),
        resolveTravelLowerBoundMinutes: () => 0,
      }),
    ).toEqual([
      ["A", "C"],
      ["A", "B"],
    ]);
  });

  it("does not use agent names as an insertion preference", () => {
    const withoutAgents = generate({
      candidateProperties: Object.freeze([
        createProperty("B"),
        createProperty("D"),
      ]),
      resolveTravelLowerBoundMinutes: () => 0,
    });
    const withAgents = generate({
      candidateProperties: Object.freeze([
        createProperty("B", { agentName: "Shared Agent" }),
        createProperty("D", { agentName: "Other Agent" }),
      ]),
      resolveTravelLowerBoundMinutes: () => 0,
    });

    expect(withAgents).toEqual(withoutAgents);
  });

  it("evaluates must and if-time candidates identically", () => {
    expect(
      generate({
        baseOrder: Object.freeze(["A"]),
        candidateProperties: Object.freeze([
          createProperty("M", { importance: "must" }),
          createProperty("O", { importance: "if_time" }),
        ]),
        anchors: Object.freeze([]),
        gaps: Object.freeze([
          Object.freeze({
            insertionIndex: 1,
            fromLocationId: "location-A",
            currentEnd: 600,
            boundary: Object.freeze({ kind: "day_end" as const, latestEnd: 900 }),
          }),
        ]),
        resolveTravelLowerBoundMinutes: () => 0,
      }),
    ).toEqual([
      ["A", "M"],
      ["A", "O"],
    ]);
  });

  it("accepts more than eight candidate properties without a hard cap", () => {
    const candidateProperties = Object.freeze(
      Array.from({ length: 9 }, (_, index) => createProperty(`P${index + 1}`)),
    );
    const result = generate({
      baseOrder: Object.freeze(["A"]),
      candidateProperties,
      anchors: Object.freeze([]),
      gaps: Object.freeze([
        Object.freeze({
          insertionIndex: 1,
          fromLocationId: "location-A",
          currentEnd: 600,
          boundary: Object.freeze({ kind: "day_end" as const, latestEnd: 900 }),
        }),
      ]),
      resolveTravelLowerBoundMinutes: () => 0,
    });

    expect(result).toHaveLength(9);
    expect(result[0]).toEqual(["A", "P1"]);
    expect(result[8]).toEqual(["A", "P9"]);
  });
});

describe("generateGapInsertionCandidates structural and purity boundaries", () => {
  it("throws RangeError for a non-integer or out-of-range insertion index", () => {
    for (const insertionIndex of [-1, 0.5, 3]) {
      expect(() =>
        generate({
          gaps: Object.freeze([
            Object.freeze({
              insertionIndex,
              fromLocationId: "location-A",
              currentEnd: 600,
              boundary: Object.freeze({
                kind: "day_end" as const,
                latestEnd: 900,
              }),
            }),
          ]),
        }),
      ).toThrow(RangeError);
    }
  });

  it("does not mutate frozen input or any nested contract", () => {
    const anchor = createAnchor("C");
    const property = createProperty("B");
    const baseOrder = Object.freeze(["A", "C"]);
    const candidateProperties = Object.freeze([property]);
    const anchors = Object.freeze([anchor]);
    const boundary = Object.freeze({ kind: "anchor" as const, anchor });
    const gaps = Object.freeze([
      Object.freeze({
        insertionIndex: 1,
        fromLocationId: "location-A",
        currentEnd: 600,
        boundary,
      }),
    ]);
    const input = Object.freeze({
      baseOrder,
      candidateProperties,
      anchors,
      gaps,
      resolveTravelLowerBoundMinutes: createResolver({
        "location-A->location-B": 10,
        "location-B->location-C": 20,
      }),
    });
    const snapshot = JSON.stringify(input);

    generateGapInsertionCandidates(input);

    expect(JSON.stringify(input)).toBe(snapshot);
    expect(input.baseOrder).toBe(baseOrder);
    expect(input.candidateProperties[0]).toBe(property);
    expect(input.anchors[0]).toBe(anchor);
    expect(input.gaps[0].boundary).toBe(boundary);
  });

  it("runtime-freezes the result and every emitted order", () => {
    const result = generate();

    expect(Object.isFrozen(result)).toBe(true);
    expect(result.every(Object.isFrozen)).toBe(true);
    expect(() =>
      (result as DailyPropertyOrder[]).push(Object.freeze(["mutation"])),
    ).toThrow(TypeError);
    expect(() => (result[0] as string[]).push("mutation")).toThrow(TypeError);
  });

  it("returns deeply equal candidates in the same order for repeated input", () => {
    expect(generate()).toEqual(generate());
  });
});
