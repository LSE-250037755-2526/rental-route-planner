import { describe, expect, it } from "vitest";

import { extractRouteOptions } from "../../src/lib/route/extractRouteOptions";
import type {
  Conflict,
  ConflictCode,
  Explanation,
  RiskLevel,
  RouteCandidate,
  RouteOption,
  TransportMode,
  Violation,
} from "../../src/lib/route/types";

type CandidateStatus = RouteCandidate["status"];

interface CandidateOverrides {
  readonly id?: string;
  readonly status?: CandidateStatus;
  readonly hardViolationCount?: number;
  readonly mustCompletedCount?: number;
  readonly completedCount?: number;
  readonly riskPenalty?: number;
  readonly totalTravelMinutes?: number;
  readonly taxiCost?: number;
  readonly experiencePenalty?: number;
  readonly totalWaitingMinutes?: number;
  readonly estimatedEndAt?: number;
  readonly taxiLegCount?: number;
  readonly propertyOrder?: readonly string[];
  readonly transportModes?: readonly TransportMode[];
  readonly riskScore?: number;
  readonly riskLevel?: RiskLevel;
  readonly explanations?: readonly Explanation[];
  readonly issueCode?: ConflictCode;
}

type CountField =
  | "hardViolationCount"
  | "mustCompletedCount"
  | "completedCount";

type FiniteField = "taxiCost" | "totalTravelMinutes";

const EMPTY_PROPERTY_IDS: readonly string[] = Object.freeze([]);
const EMPTY_PARAMETERS = Object.freeze({});

function createExplanation(): Explanation {
  return Object.freeze({
    scope: "route",
    code: "earlier_finish",
    parameters: Object.freeze({ source: "fixture" }),
  });
}

function createCandidate(
  overrides: CandidateOverrides = {},
): RouteCandidate {
  const issueCode = overrides.issueCode ?? "end_time_exceeded";
  const violation: Violation = Object.freeze({
    kind: "violation",
    code: issueCode,
    severity: "error",
    propertyIds: EMPTY_PROPERTY_IDS,
    parameters: EMPTY_PARAMETERS,
  });
  const conflict: Conflict = Object.freeze({
    kind: "conflict",
    code: issueCode,
    propertyIds: EMPTY_PROPERTY_IDS,
    parameters: EMPTY_PARAMETERS,
  });
  const base = Object.freeze({
    id: overrides.id ?? "candidate",
    propertyOrder: Object.freeze([
      ...(overrides.propertyOrder ?? [overrides.id ?? "property-a"]),
    ]),
    transportModes: Object.freeze([
      ...(overrides.transportModes ?? ["transit"]),
    ]),
    simulation: Object.freeze({
      status: "simulated" as const,
      departureAt: 540,
      stops: Object.freeze([]),
      totals: Object.freeze({
        completedCount: overrides.completedCount ?? 2,
        mustCompletedCount: overrides.mustCompletedCount ?? 1,
        totalTravelMinutes: overrides.totalTravelMinutes ?? 30,
        totalWaitingMinutes: overrides.totalWaitingMinutes ?? 5,
        estimatedEndAt: overrides.estimatedEndAt ?? 660,
        taxiCost: overrides.taxiCost ?? 10,
        taxiLegCount: overrides.taxiLegCount ?? 1,
      }),
    }),
    metrics: Object.freeze({
      hardViolationCount: overrides.hardViolationCount ?? 0,
      riskPenalty: overrides.riskPenalty ?? 1,
      experiencePenalty: overrides.experiencePenalty ?? 1,
    }),
    risk: Object.freeze({
      score: overrides.riskScore ?? 1,
      level: overrides.riskLevel ?? "low",
      legs: Object.freeze([]),
    }),
    explanations: Object.freeze([...(overrides.explanations ?? [])]),
  });

  if (overrides.status === "partial") {
    return Object.freeze({
      ...base,
      status: "partial" as const,
      violations: Object.freeze([violation]),
      conflicts: Object.freeze([conflict]),
    });
  }

  if (overrides.status === "conflicted") {
    const conflicts: readonly [Conflict] = Object.freeze([conflict]);

    return Object.freeze({
      ...base,
      status: "conflicted" as const,
      violations: Object.freeze([violation]),
      conflicts,
    });
  }

  const violations: readonly [] = Object.freeze([]);
  const conflicts: readonly [] = Object.freeze([]);

  return Object.freeze({
    ...base,
    status: "feasible" as const,
    violations,
    conflicts,
  });
}

function ids(options: readonly RouteOption[]): readonly string[] {
  return options.map((option) => option.id);
}

function labelsFor(
  options: readonly RouteOption[],
  id: string,
): RouteOption["objectiveLabels"] {
  const option = options.find((candidate) => candidate.id === id);

  if (option === undefined) {
    throw new Error(`Missing option ${id}`);
  }

  return option.objectiveLabels;
}

describe("extractRouteOptions basic selection", () => {
  it("returns a new frozen empty array", () => {
    const input: readonly RouteCandidate[] = Object.freeze([]);
    const result = extractRouteOptions(input);

    expect(result).toEqual([]);
    expect(result).not.toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("gives one feasible candidate all three canonical labels", () => {
    const candidate = createCandidate({ id: "only" });
    const result = extractRouteOptions(Object.freeze([candidate]));

    expect(ids(result)).toEqual(["only"]);
    expect(result[0].objectiveLabels).toEqual([
      "recommended",
      "cheapest",
      "fastest",
    ]);
  });

  it("gives one partial candidate only the recommended label", () => {
    const candidate = createCandidate({ id: "partial", status: "partial" });
    const result = extractRouteOptions([candidate]);

    expect(ids(result)).toEqual(["partial"]);
    expect(result[0].objectiveLabels).toEqual(["recommended"]);
  });

  it("returns only the first ranked conflicted route when none is feasible", () => {
    const first = createCandidate({ id: "first", status: "conflicted" });
    const second = createCandidate({ id: "second", status: "partial" });
    const result = extractRouteOptions([first, second]);

    expect(ids(result)).toEqual(["first"]);
    expect(result[0].objectiveLabels).toEqual(["recommended"]);
  });

  it("keeps a partial Recommended while selecting feasible objectives separately", () => {
    const partial = createCandidate({ id: "partial", status: "partial" });
    const feasible = createCandidate({
      id: "feasible",
      taxiCost: 5,
      estimatedEndAt: 650,
    });
    const result = extractRouteOptions([partial, feasible]);

    expect(ids(result)).toEqual(["partial", "feasible"]);
    expect(labelsFor(result, "partial")).toEqual(["recommended"]);
    expect(labelsFor(result, "feasible")).toEqual(["cheapest", "fastest"]);
  });

  it("does not rerank Recommended by lower risk, cost, or finish time", () => {
    const first = createCandidate({
      id: "first",
      riskPenalty: 100,
      taxiCost: 100,
      estimatedEndAt: 900,
    });
    const later = createCandidate({
      id: "later",
      riskPenalty: 0,
      taxiCost: 0,
      estimatedEndAt: 600,
    });
    const result = extractRouteOptions([first, later]);

    expect(labelsFor(result, "first")).toContain("recommended");
    expect(labelsFor(result, "later")).not.toContain("recommended");
  });
});

describe("feasible-only eligibility frontier", () => {
  it("excludes a dramatically cheaper conflicted candidate", () => {
    const feasible = createCandidate({ id: "feasible", taxiCost: 50 });
    const conflicted = createCandidate({
      id: "conflicted",
      status: "conflicted",
      taxiCost: 0,
    });
    const result = extractRouteOptions([feasible, conflicted]);

    expect(labelsFor(result, "feasible")).toContain("cheapest");
    expect(ids(result)).not.toContain("conflicted");
  });

  it("excludes a dramatically earlier partial candidate", () => {
    const feasible = createCandidate({ id: "feasible", estimatedEndAt: 800 });
    const partial = createCandidate({
      id: "partial",
      status: "partial",
      estimatedEndAt: 600,
    });
    const result = extractRouteOptions([feasible, partial]);

    expect(labelsFor(result, "feasible")).toContain("fastest");
    expect(ids(result)).not.toContain("partial");
  });

  it("excludes a cheaper and faster feasible route with more hard violations", () => {
    const best = createCandidate({
      id: "best",
      hardViolationCount: 0,
      taxiCost: 50,
      estimatedEndAt: 800,
    });
    const worse = createCandidate({
      id: "worse",
      hardViolationCount: 1,
      taxiCost: 0,
      estimatedEndAt: 600,
    });
    const result = extractRouteOptions([best, worse]);

    expect(ids(result)).toEqual(["best"]);
    expect(labelsFor(result, "best")).toEqual([
      "recommended",
      "cheapest",
      "fastest",
    ]);
  });

  it("excludes a cheaper and faster feasible route with fewer must completions", () => {
    const best = createCandidate({
      id: "best",
      mustCompletedCount: 2,
      taxiCost: 50,
      estimatedEndAt: 800,
    });
    const worse = createCandidate({
      id: "worse",
      mustCompletedCount: 1,
      taxiCost: 0,
      estimatedEndAt: 600,
    });
    const result = extractRouteOptions([best, worse]);

    expect(ids(result)).toEqual(["best"]);
  });

  it("excludes a cheaper and faster feasible route with fewer total completions", () => {
    const best = createCandidate({
      id: "best",
      completedCount: 3,
      taxiCost: 50,
      estimatedEndAt: 800,
    });
    const worse = createCandidate({
      id: "worse",
      completedCount: 2,
      taxiCost: 0,
      estimatedEndAt: 600,
    });
    const result = extractRouteOptions([best, worse]);

    expect(ids(result)).toEqual(["best"]);
  });

  it("uses the first feasible candidate as the frontier when Recommended is partial", () => {
    const recommended = createCandidate({
      id: "recommended",
      status: "partial",
      hardViolationCount: 0,
      mustCompletedCount: 9,
      completedCount: 9,
    });
    const bestFeasible = createCandidate({
      id: "best-feasible",
      mustCompletedCount: 2,
      completedCount: 3,
      taxiCost: 20,
      estimatedEndAt: 700,
    });
    const eligible = createCandidate({
      id: "eligible",
      mustCompletedCount: 2,
      completedCount: 3,
      taxiCost: 0,
      estimatedEndAt: 650,
    });
    const result = extractRouteOptions([
      recommended,
      bestFeasible,
      eligible,
    ]);

    expect(labelsFor(result, "recommended")).toEqual(["recommended"]);
    expect(labelsFor(result, "eligible")).toEqual(["cheapest", "fastest"]);
  });

  it("allows worse risk within the same feasible tier to win Cheapest", () => {
    const recommended = createCandidate({
      id: "recommended",
      riskPenalty: 0,
      taxiCost: 30,
    });
    const cheaper = createCandidate({
      id: "cheaper",
      riskPenalty: 100,
      taxiCost: 0,
    });
    const result = extractRouteOptions([recommended, cheaper]);

    expect(labelsFor(result, "recommended")).toContain("recommended");
    expect(labelsFor(result, "cheaper")).toContain("cheapest");
  });

  it("allows worse risk within the same feasible tier to win Fastest", () => {
    const recommended = createCandidate({
      id: "recommended",
      riskPenalty: 0,
      estimatedEndAt: 700,
    });
    const faster = createCandidate({
      id: "faster",
      riskPenalty: 100,
      estimatedEndAt: 680,
    });
    const result = extractRouteOptions([recommended, faster]);

    expect(labelsFor(result, "faster")).toContain("fastest");
  });
});

describe("Cheapest and Fastest objective rules", () => {
  it("selects minimum taxi cost without moving Recommended", () => {
    const recommended = createCandidate({ id: "recommended", taxiCost: 30 });
    const cheapest = createCandidate({ id: "cheapest", taxiCost: 0 });
    const result = extractRouteOptions([recommended, cheapest]);

    expect(labelsFor(result, "recommended")).toContain("recommended");
    expect(labelsFor(result, "cheapest")).toContain("cheapest");
  });

  it("selects earliest estimated end without moving Recommended", () => {
    const recommended = createCandidate({
      id: "recommended",
      estimatedEndAt: 700,
    });
    const fastest = createCandidate({ id: "fastest", estimatedEndAt: 680 });
    const result = extractRouteOptions([recommended, fastest]);

    expect(labelsFor(result, "recommended")).toContain("recommended");
    expect(labelsFor(result, "fastest")).toContain("fastest");
  });

  it("prioritizes estimated end over total travel minutes", () => {
    const earlierEnd = createCandidate({
      id: "earlier-end",
      estimatedEndAt: 680,
      totalTravelMinutes: 50,
    });
    const shorterTravel = createCandidate({
      id: "shorter-travel",
      estimatedEndAt: 690,
      totalTravelMinutes: 10,
    });
    const result = extractRouteOptions([earlierEnd, shorterTravel]);

    expect(labelsFor(result, "earlier-end")).toContain("fastest");
  });

  it("uses travel time when estimated end ties", () => {
    const longerTravel = createCandidate({
      id: "longer-travel",
      estimatedEndAt: 680,
      totalTravelMinutes: 40,
    });
    const shorterTravel = createCandidate({
      id: "shorter-travel",
      estimatedEndAt: 680,
      totalTravelMinutes: 30,
    });
    const result = extractRouteOptions([longerTravel, shorterTravel]);

    expect(labelsFor(result, "shorter-travel")).toContain("fastest");
  });

  it("preserves ranked order when both Fastest fields tie", () => {
    const first = createCandidate({
      id: "z",
      estimatedEndAt: 680,
      totalTravelMinutes: 30,
      taxiCost: 20,
      riskPenalty: 100,
      taxiLegCount: 9,
    });
    const second = createCandidate({
      id: "a",
      estimatedEndAt: 680,
      totalTravelMinutes: 30,
      taxiCost: 0,
      riskPenalty: 0,
      taxiLegCount: 0,
    });
    const result = extractRouteOptions([first, second]);

    expect(labelsFor(result, "z")).toContain("fastest");
    expect(labelsFor(result, "a")).not.toContain("fastest");
  });

  it("preserves ranked order when taxi cost ties", () => {
    const first = createCandidate({ id: "z", taxiCost: 10, taxiLegCount: 9 });
    const second = createCandidate({ id: "a", taxiCost: 10, taxiLegCount: 0 });
    const result = extractRouteOptions([first, second]);

    expect(labelsFor(result, "z")).toContain("cheapest");
    expect(ids(result)).not.toContain("a");
  });
});

describe("route deduplication and option shape", () => {
  it("implements Case 13 with one option carrying all canonical labels", () => {
    const first = createCandidate({
      id: "first",
      propertyOrder: ["property-a"],
      transportModes: ["transit"],
    });
    const duplicate = createCandidate({
      id: "duplicate",
      propertyOrder: ["property-a"],
      transportModes: ["transit"],
      taxiCost: 0,
      estimatedEndAt: 600,
    });
    const result = extractRouteOptions([first, duplicate]);

    expect(ids(result)).toEqual(["first"]);
    expect(result[0].objectiveLabels).toEqual([
      "recommended",
      "cheapest",
      "fastest",
    ]);
  });

  it("returns two options when Recommended equals Cheapest", () => {
    const recommendedCheapest = createCandidate({
      id: "recommended-cheapest",
      taxiCost: 0,
      estimatedEndAt: 700,
    });
    const fastest = createCandidate({
      id: "fastest",
      taxiCost: 10,
      estimatedEndAt: 650,
    });
    const result = extractRouteOptions([recommendedCheapest, fastest]);

    expect(ids(result)).toEqual(["recommended-cheapest", "fastest"]);
    expect(labelsFor(result, "recommended-cheapest")).toEqual([
      "recommended",
      "cheapest",
    ]);
    expect(labelsFor(result, "fastest")).toEqual(["fastest"]);
  });

  it("returns two options when Recommended equals Fastest", () => {
    const recommendedFastest = createCandidate({
      id: "recommended-fastest",
      taxiCost: 50,
      estimatedEndAt: 650,
    });
    const cheapest = createCandidate({
      id: "cheapest",
      taxiCost: 0,
      estimatedEndAt: 700,
    });
    const result = extractRouteOptions([recommendedFastest, cheapest]);

    expect(labelsFor(result, "recommended-fastest")).toEqual([
      "recommended",
      "fastest",
    ]);
    expect(labelsFor(result, "cheapest")).toEqual(["cheapest"]);
  });

  it("returns two options when Cheapest equals Fastest", () => {
    const recommended = createCandidate({
      id: "recommended",
      taxiCost: 50,
      estimatedEndAt: 700,
    });
    const cheapestFastest = createCandidate({
      id: "cheapest-fastest",
      taxiCost: 0,
      estimatedEndAt: 650,
    });
    const result = extractRouteOptions([recommended, cheapestFastest]);

    expect(labelsFor(result, "recommended")).toEqual(["recommended"]);
    expect(labelsFor(result, "cheapest-fastest")).toEqual([
      "cheapest",
      "fastest",
    ]);
  });

  it("returns three distinct objective options", () => {
    const recommended = createCandidate({
      id: "recommended",
      taxiCost: 50,
      estimatedEndAt: 700,
    });
    const cheapest = createCandidate({
      id: "cheapest",
      taxiCost: 0,
      estimatedEndAt: 720,
    });
    const fastest = createCandidate({
      id: "fastest",
      taxiCost: 30,
      estimatedEndAt: 650,
    });
    const result = extractRouteOptions([recommended, cheapest, fastest]);

    expect(ids(result)).toEqual(["recommended", "cheapest", "fastest"]);
    expect(labelsFor(result, "recommended")).toEqual(["recommended"]);
    expect(labelsFor(result, "cheapest")).toEqual(["cheapest"]);
    expect(labelsFor(result, "fastest")).toEqual(["fastest"]);
  });

  it("keeps selected options in CE-14 ranked order rather than label order", () => {
    const recommended = createCandidate({
      id: "recommended",
      taxiCost: 50,
      estimatedEndAt: 700,
    });
    const fastest = createCandidate({
      id: "fastest",
      taxiCost: 30,
      estimatedEndAt: 650,
    });
    const cheapest = createCandidate({
      id: "cheapest",
      taxiCost: 0,
      estimatedEndAt: 720,
    });
    const result = extractRouteOptions([recommended, fastest, cheapest]);

    expect(ids(result)).toEqual(["recommended", "fastest", "cheapest"]);
  });

  it("retains the first route occurrence even when a later duplicate has another ID", () => {
    const first = createCandidate({
      id: "first",
      propertyOrder: ["same"],
      transportModes: ["taxi"],
    });
    const duplicate = createCandidate({
      id: "later",
      propertyOrder: ["same"],
      transportModes: ["taxi"],
    });

    expect(ids(extractRouteOptions([first, duplicate]))).toEqual(["first"]);
  });

  it("does not deduplicate distinct routes that share a candidate ID", () => {
    const first = createCandidate({
      id: "same-id",
      propertyOrder: ["property-a"],
      transportModes: ["transit"],
      taxiCost: 20,
      estimatedEndAt: 700,
    });
    const second = createCandidate({
      id: "same-id",
      propertyOrder: ["property-b"],
      transportModes: ["taxi"],
      taxiCost: 0,
      estimatedEndAt: 650,
    });
    const result = extractRouteOptions([first, second]);

    expect(result).toHaveLength(2);
    expect(result[0].propertyOrder).toEqual(["property-a"]);
    expect(result[1].propertyOrder).toEqual(["property-b"]);
  });

  it("treats transport-mode differences as distinct route identity", () => {
    const transit = createCandidate({
      id: "transit",
      propertyOrder: ["property-a"],
      transportModes: ["transit"],
      taxiCost: 20,
    });
    const taxi = createCandidate({
      id: "taxi",
      propertyOrder: ["property-a"],
      transportModes: ["taxi"],
      taxiCost: 0,
    });

    expect(extractRouteOptions([transit, taxi])).toHaveLength(2);
  });

  it.each([
    [["a|b", "c"], ["a", "b|c"]],
    [["a,b", "[x]"], ["a", "b,[x]"]],
    [["[x]", ":"], ["[x]:", ""]],
  ] satisfies readonly [readonly string[], readonly string[]][]) (
    "does not collide punctuation-heavy property identities %#",
    (leftOrder, rightOrder) => {
      const left = createCandidate({
        id: "left",
        propertyOrder: leftOrder,
        transportModes: ["transit", "taxi"],
        taxiCost: 20,
        estimatedEndAt: 700,
      });
      const right = createCandidate({
        id: "right",
        propertyOrder: rightOrder,
        transportModes: ["transit", "taxi"],
        taxiCost: 0,
        estimatedEndAt: 650,
      });

      expect(extractRouteOptions([left, right])).toHaveLength(2);
    },
  );
});

describe("numeric contract protection", () => {
  it.each(
    (["hardViolationCount", "mustCompletedCount", "completedCount"] as const)
      .flatMap((field) =>
        [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5].map(
          (value) => [field, value] as const,
        ),
      ),
  )("rejects malformed count %s = %s", (field: CountField, value) => {
    expect(() =>
      extractRouteOptions([createCandidate({ [field]: value })]),
    ).toThrow(RangeError);
  });

  it.each(
    (["taxiCost", "totalTravelMinutes"] as const).flatMap((field) =>
      [Number.NaN, Number.POSITIVE_INFINITY, -1].map(
        (value) => [field, value] as const,
      ),
    ),
  )("rejects malformed numeric %s = %s", (field: FiniteField, value) => {
    expect(() =>
      extractRouteOptions([createCandidate({ [field]: value })]),
    ).toThrow(RangeError);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    1440,
    1.5,
  ])("rejects malformed estimatedEndAt = %s", (estimatedEndAt) => {
    expect(() =>
      extractRouteOptions([createCandidate({ estimatedEndAt })]),
    ).toThrow(RangeError);
  });

  it("does not revalidate unused CE-14 risk and experience metrics", () => {
    const candidate = createCandidate({
      riskPenalty: Number.NaN,
      experiencePenalty: Number.POSITIVE_INFINITY,
    });

    expect(extractRouteOptions([candidate])).toHaveLength(1);
  });
});

describe("immutability and repeatability", () => {
  it("creates frozen options while retaining all nested candidate references", () => {
    const explanation = createExplanation();
    const candidate = createCandidate({
      id: "candidate",
      explanations: [explanation],
    });
    const input = Object.freeze([candidate]);
    const result = extractRouteOptions(input);
    const option = result[0];

    expect(result).not.toBe(input);
    expect(option).not.toBe(candidate);
    expect(option.simulation).toBe(candidate.simulation);
    expect(option.metrics).toBe(candidate.metrics);
    expect(option.risk).toBe(candidate.risk);
    expect(option.violations).toBe(candidate.violations);
    expect(option.conflicts).toBe(candidate.conflicts);
    expect(option.explanations).toBe(candidate.explanations);
    expect(option.propertyOrder).toBe(candidate.propertyOrder);
    expect(option.transportModes).toBe(candidate.transportModes);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(option)).toBe(true);
    expect(Object.isFrozen(option.objectiveLabels)).toBe(true);
  });

  it("does not mutate the input array, candidates, or nested evidence", () => {
    const first = createCandidate({ id: "first", taxiCost: 20 });
    const second = createCandidate({ id: "second", taxiCost: 0 });
    const input = Object.freeze([first, second]);

    extractRouteOptions(input);

    expect(input).toEqual([first, second]);
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.simulation)).toBe(true);
    expect(Object.isFrozen(first.simulation.totals)).toBe(true);
    expect(Object.isFrozen(first.metrics)).toBe(true);
    expect(Object.isFrozen(first.risk)).toBe(true);
    expect(Object.isFrozen(first.explanations)).toBe(true);
    expect(Object.isFrozen(first.propertyOrder)).toBe(true);
    expect(Object.isFrozen(first.transportModes)).toBe(true);
  });

  it("is deterministic for repeated identical frozen input", () => {
    const recommended = createCandidate({
      id: "recommended",
      taxiCost: 30,
      estimatedEndAt: 700,
    });
    const alternate = createCandidate({
      id: "alternate",
      taxiCost: 0,
      estimatedEndAt: 650,
    });
    const input = Object.freeze([recommended, alternate]);
    const first = extractRouteOptions(input);
    const second = extractRouteOptions(input);

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(ids(second)).toEqual(ids(first));
    expect(second.map((option) => option.objectiveLabels)).toEqual(
      first.map((option) => option.objectiveLabels),
    );
  });
});
