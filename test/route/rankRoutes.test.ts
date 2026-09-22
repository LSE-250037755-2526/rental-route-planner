import { describe, expect, it } from "vitest";

import {
  compareRouteCandidates,
  rankRoutes,
} from "../../src/lib/route/rankRoutes";
import type {
  Conflict,
  ConflictCode,
  Explanation,
  RiskLevel,
  RouteCandidate,
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

type RankingField =
  | "hardViolationCount"
  | "mustCompletedCount"
  | "completedCount"
  | "riskPenalty"
  | "totalTravelMinutes"
  | "taxiCost"
  | "experiencePenalty";

const EMPTY_PROPERTY_IDS = Object.freeze([]);
const EMPTY_PARAMETERS = Object.freeze({});
function createExplanation(code: "avoid_late" | "earlier_finish"): Explanation {
  return Object.freeze({
    scope: "route",
    code,
    parameters: Object.freeze({ source: code }),
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
      ...(overrides.propertyOrder ?? ["property-a"]),
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

function candidateWithRankingField(
  field: RankingField,
  value: number,
  id: string,
): RouteCandidate {
  return createCandidate({ id, [field]: value });
}

describe("compareRouteCandidates hierarchy", () => {
  it.each([
    ["hardViolationCount", 0, 1],
    ["mustCompletedCount", 2, 1],
    ["completedCount", 3, 2],
    ["riskPenalty", 0, 1],
    ["totalTravelMinutes", 20, 30],
    ["taxiCost", 5, 10],
    ["experiencePenalty", 0, 1],
  ] satisfies readonly [RankingField, number, number][])(
    "compares %s in its required direction",
    (field, preferredValue, worseValue) => {
      const preferred = candidateWithRankingField(
        field,
        preferredValue,
        "preferred",
      );
      const worse = candidateWithRankingField(field, worseValue, "worse");

      expect(compareRouteCandidates(preferred, worse)).toBeLessThan(0);
      expect(compareRouteCandidates(worse, preferred)).toBeGreaterThan(0);
    },
  );

  it.each([
    {
      name: "hard violations dominate every lower field",
      preferred: {
        hardViolationCount: 0,
        mustCompletedCount: 0,
        completedCount: 0,
        riskPenalty: 999,
        totalTravelMinutes: 999,
        taxiCost: 999,
        experiencePenalty: 999,
      },
      worse: {
        hardViolationCount: 1,
        mustCompletedCount: 10,
        completedCount: 10,
        riskPenalty: 0,
        totalTravelMinutes: 0,
        taxiCost: 0,
        experiencePenalty: 0,
      },
    },
    {
      name: "must completion dominates total completion and below",
      preferred: {
        mustCompletedCount: 2,
        completedCount: 2,
        riskPenalty: 999,
        totalTravelMinutes: 999,
        taxiCost: 999,
        experiencePenalty: 999,
      },
      worse: {
        mustCompletedCount: 1,
        completedCount: 100,
        riskPenalty: 0,
        totalTravelMinutes: 0,
        taxiCost: 0,
        experiencePenalty: 0,
      },
    },
    {
      name: "total completion dominates risk and below",
      preferred: {
        completedCount: 5,
        riskPenalty: 999,
        totalTravelMinutes: 999,
        taxiCost: 999,
        experiencePenalty: 999,
      },
      worse: {
        completedCount: 4,
        riskPenalty: 0,
        totalTravelMinutes: 0,
        taxiCost: 0,
        experiencePenalty: 0,
      },
    },
    {
      name: "risk dominates travel time and below",
      preferred: {
        riskPenalty: 0,
        totalTravelMinutes: 999,
        taxiCost: 999,
        experiencePenalty: 999,
      },
      worse: {
        riskPenalty: 10,
        totalTravelMinutes: 0,
        taxiCost: 0,
        experiencePenalty: 0,
      },
    },
    {
      name: "travel time dominates taxi cost and experience",
      preferred: {
        totalTravelMinutes: 10,
        taxiCost: 999,
        experiencePenalty: 999,
      },
      worse: {
        totalTravelMinutes: 999,
        taxiCost: 0,
        experiencePenalty: 0,
      },
    },
    {
      name: "taxi cost dominates experience",
      preferred: { taxiCost: 10, experiencePenalty: 999 },
      worse: { taxiCost: 20, experiencePenalty: 0 },
    },
  ] satisfies readonly {
    readonly name: string;
    readonly preferred: CandidateOverrides;
    readonly worse: CandidateOverrides;
  }[])("$name", ({ preferred, worse }) => {
    expect(
      compareRouteCandidates(
        createCandidate({ id: "preferred", ...preferred }),
        createCandidate({ id: "worse", ...worse }),
      ),
    ).toBeLessThan(0);
  });

  it("implements Case 05 by preferring risk 0 at 31 minutes over risk 5 at 28 minutes", () => {
    const optionA = createCandidate({
      id: "option-a",
      riskPenalty: 5,
      totalTravelMinutes: 28,
    });
    const optionB = createCandidate({
      id: "option-b",
      riskPenalty: 0,
      totalTravelMinutes: 31,
    });

    expect(rankRoutes([optionA, optionB])).toEqual([optionB, optionA]);
  });

  it("implements Case 08 by ranking completion above better time and cost", () => {
    const fewerCompleted = createCandidate({
      id: "fewer",
      completedCount: 2,
      totalTravelMinutes: 20,
      taxiCost: 0,
      experiencePenalty: 0,
    });
    const extraCompleted = createCandidate({
      id: "extra",
      completedCount: 3,
      totalTravelMinutes: 90,
      taxiCost: 100,
      experiencePenalty: 100,
    });

    expect(rankRoutes([fewerCompleted, extraCompleted])).toEqual([
      extraCompleted,
      fewerCompleted,
    ]);
  });

  it("implements Case 11 by ranking must completion above attractive lower metrics", () => {
    const preservesMust = createCandidate({
      id: "preserves-must",
      mustCompletedCount: 2,
      completedCount: 2,
      riskPenalty: 100,
      totalTravelMinutes: 100,
      taxiCost: 100,
      experiencePenalty: 100,
    });
    const missesMust = createCandidate({
      id: "misses-must",
      mustCompletedCount: 1,
      completedCount: 10,
      riskPenalty: 0,
      totalTravelMinutes: 0,
      taxiCost: 0,
      experiencePenalty: 0,
    });

    expect(compareRouteCandidates(preservesMust, missesMust)).toBeLessThan(0);
  });

  it("uses hard violations as the realistic missing-must foundation", () => {
    const retainedMust = createCandidate({
      id: "retained-must",
      hardViolationCount: 0,
      mustCompletedCount: 1,
      totalTravelMinutes: 100,
    });
    const missingMustConflict = createCandidate({
      id: "missing-must",
      status: "conflicted",
      issueCode: "must_visit_unscheduled",
      hardViolationCount: 1,
      mustCompletedCount: 0,
      completedCount: 10,
      totalTravelMinutes: 0,
    });

    expect(
      compareRouteCandidates(retainedMust, missingMustConflict),
    ).toBeLessThan(0);
  });
});

describe("compareRouteCandidates algebra and ties", () => {
  it("is reflexive", () => {
    const candidate = createCandidate();

    expect(compareRouteCandidates(candidate, candidate)).toBe(0);
  });

  it("is antisymmetric for non-tied candidates", () => {
    const left = createCandidate({ riskPenalty: 0 });
    const right = createCandidate({ riskPenalty: 2 });

    expect(Math.sign(compareRouteCandidates(left, right))).toBe(
      -Math.sign(compareRouteCandidates(right, left)),
    );
  });

  it("is transitive", () => {
    const first = createCandidate({
      mustCompletedCount: 3,
      completedCount: 3,
    });
    const second = createCandidate({
      mustCompletedCount: 2,
      completedCount: 2,
    });
    const third = createCandidate({ hardViolationCount: 1 });

    expect(compareRouteCandidates(first, second)).toBeLessThan(0);
    expect(compareRouteCandidates(second, third)).toBeLessThan(0);
    expect(compareRouteCandidates(first, third)).toBeLessThan(0);
  });

  it("does not use candidate ID and preserves either caller ordering", () => {
    const z = createCandidate({ id: "z" });
    const a = createCandidate({ id: "a" });

    expect(compareRouteCandidates(z, a)).toBe(0);
    expect(rankRoutes([z, a])).toEqual([z, a]);
    expect(rankRoutes([a, z])).toEqual([a, z]);
  });

  it.each([
    ["estimatedEndAt", 600, 900],
    ["totalWaitingMinutes", 0, 100],
    ["taxiLegCount", 0, 5],
  ] satisfies readonly [
    "estimatedEndAt" | "totalWaitingMinutes" | "taxiLegCount",
    number,
    number,
  ][])("does not use %s as a ranking key", (field, leftValue, rightValue) => {
    const left = createCandidate({ id: "left", [field]: leftValue });
    const right = createCandidate({ id: "right", [field]: rightValue });

    expect(compareRouteCandidates(left, right)).toBe(0);
    expect(rankRoutes([right, left])).toEqual([right, left]);
  });

  it("does not use RouteRisk metadata as a ranking key", () => {
    const highMetadata = createCandidate({
      id: "high-metadata",
      riskScore: 99,
      riskLevel: "high",
    });
    const lowMetadata = createCandidate({
      id: "low-metadata",
      riskScore: 0,
      riskLevel: "low",
    });

    expect(compareRouteCandidates(highMetadata, lowMetadata)).toBe(0);
  });

  it("does not use explanations as ranking keys", () => {
    const avoidLate = createCandidate({
      id: "avoid-late",
      explanations: [createExplanation("avoid_late")],
    });
    const earlierFinish = createCandidate({
      id: "earlier-finish",
      explanations: [createExplanation("earlier_finish")],
    });

    expect(compareRouteCandidates(avoidLate, earlierFinish)).toBe(0);
  });

  it("preserves arbitrary caller order across all ignored metadata", () => {
    const z = createCandidate({
      id: "z",
      propertyOrder: ["z-property"],
      transportModes: ["taxi"],
      estimatedEndAt: 900,
      totalWaitingMinutes: 100,
      taxiLegCount: 3,
      riskScore: 99,
      riskLevel: "high",
      explanations: [createExplanation("avoid_late")],
    });
    const a = createCandidate({
      id: "a",
      propertyOrder: ["a-property", "b-property"],
      transportModes: ["transit", "taxi"],
      estimatedEndAt: 600,
      totalWaitingMinutes: 0,
      taxiLegCount: 0,
      riskScore: 0,
      riskLevel: "low",
      explanations: [createExplanation("earlier_finish")],
    });
    const middle = createCandidate({
      id: "middle",
      propertyOrder: [],
      transportModes: [],
      estimatedEndAt: 700,
      totalWaitingMinutes: 50,
      taxiLegCount: 1,
      riskScore: 10,
      riskLevel: "medium",
    });

    expect(rankRoutes([z, a, middle])).toEqual([z, a, middle]);
    expect(rankRoutes([middle, z, a])).toEqual([middle, z, a]);
  });

  it("ranks all statuses by metrics without filtering or adding a status key", () => {
    const conflicted = createCandidate({
      id: "conflicted",
      status: "conflicted",
      hardViolationCount: 0,
    });
    const partial = createCandidate({
      id: "partial",
      status: "partial",
      hardViolationCount: 1,
    });
    const feasible = createCandidate({
      id: "feasible",
      status: "feasible",
      hardViolationCount: 2,
    });

    expect(rankRoutes([feasible, partial, conflicted])).toEqual([
      conflicted,
      partial,
      feasible,
    ]);
  });
});

describe("ranking numeric contract protection", () => {
  it.each(
    (["hardViolationCount", "mustCompletedCount", "completedCount"] as const)
      .flatMap((field) =>
        [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5].map(
          (value) => [field, value] as const,
        ),
      ),
  )("rejects malformed count %s = %s", (field, value) => {
    const malformed = candidateWithRankingField(field, value, "malformed");

    expect(() =>
      compareRouteCandidates(malformed, createCandidate()),
    ).toThrow(RangeError);
  });

  it.each(
    ([
      "riskPenalty",
      "totalTravelMinutes",
      "taxiCost",
      "experiencePenalty",
    ] as const).flatMap((field) =>
      [Number.NaN, Number.POSITIVE_INFINITY, -1].map(
        (value) => [field, value] as const,
      ),
    ),
  )("rejects malformed numeric %s = %s", (field, value) => {
    const malformed = candidateWithRankingField(field, value, "malformed");

    expect(() =>
      compareRouteCandidates(createCandidate(), malformed),
    ).toThrow(RangeError);
  });

  it("validates even a single supplied candidate", () => {
    const malformed = createCandidate({ riskPenalty: Number.NaN });

    expect(() => rankRoutes([malformed])).toThrow(RangeError);
  });
});

describe("rankRoutes collection behavior", () => {
  it("returns a new frozen empty array", () => {
    const input: readonly RouteCandidate[] = Object.freeze([]);
    const result = rankRoutes(input);

    expect(result).toEqual([]);
    expect(result).not.toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns a new frozen one-element array with the same candidate", () => {
    const candidate = createCandidate();
    const input = Object.freeze([candidate]);
    const result = rankRoutes(input);

    expect(result).not.toBe(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(candidate);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("preserves frozen inputs and candidate references and is repeatable", () => {
    const slower = createCandidate({ id: "slower", totalTravelMinutes: 40 });
    const faster = createCandidate({ id: "faster", totalTravelMinutes: 20 });
    const input = Object.freeze([slower, faster]);
    const first = rankRoutes(input);
    const second = rankRoutes(input);

    expect(input).toEqual([slower, faster]);
    expect(first).toEqual([faster, slower]);
    expect(second).toEqual(first);
    expect(first).not.toBe(input);
    expect(second).not.toBe(first);
    expect(first[0]).toBe(faster);
    expect(first[1]).toBe(slower);
    expect(second[0]).toBe(faster);
    expect(second[1]).toBe(slower);
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(slower)).toBe(true);
    expect(Object.isFrozen(slower.metrics)).toBe(true);
    expect(Object.isFrozen(slower.simulation)).toBe(true);
    expect(Object.isFrozen(slower.simulation.totals)).toBe(true);
    expect(Object.isFrozen(slower.propertyOrder)).toBe(true);
    expect(Object.isFrozen(slower.transportModes)).toBe(true);
    expect(Object.isFrozen(slower.risk)).toBe(true);
    expect(Object.isFrozen(slower.explanations)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(second)).toBe(true);
    expect(compareRouteCandidates(faster, slower)).toBeLessThan(0);
    expect(compareRouteCandidates(faster, slower)).toBeLessThan(0);
  });
});
