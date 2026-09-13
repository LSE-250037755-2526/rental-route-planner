import { describe, expect, it } from "vitest";

import {
  normalizeViewingTimeForDay,
  type NormalizeViewingTimeForDayInput,
} from "../../src/lib/route/normalizeWindows";
import type { ViewingTimeInput } from "../../src/lib/route/types";

const TARGET_DATE = "2026-09-20";
const DEFAULT_DAY_CONTEXT: Omit<
  NormalizeViewingTimeForDayInput,
  "viewingTime"
> = {
  targetDate: TARGET_DATE,
  dayEarliestStart: 540,
  dayLatestEnd: 1080,
  durationMinutes: 30,
};

function normalize(
  viewingTime: ViewingTimeInput,
  overrides: Partial<
    Omit<NormalizeViewingTimeForDayInput, "viewingTime">
  > = {},
) {
  return normalizeViewingTimeForDay({
    ...DEFAULT_DAY_CONTEXT,
    ...overrides,
    viewingTime,
  });
}

describe("fixed viewing-time normalization", () => {
  it("normalizes a same-date fixed appointment to equal start bounds", () => {
    expect(
      normalize({
        type: "fixed",
        date: TARGET_DATE,
        startTime: "14:00",
      }),
    ).toEqual({
      status: "normalized",
      normalizedViewingTime: {
        type: "fixed",
        window: {
          earliestStart: 840,
          latestStart: 840,
        },
      },
    });
  });

  it("returns not_eligible for a valid fixed-date mismatch", () => {
    expect(
      normalize({
        type: "fixed",
        date: "2026-09-21",
        startTime: "14:00",
      }),
    ).toEqual({ status: "not_eligible" });
  });

  it("throws RangeError for a malformed fixed source date", () => {
    expect(() =>
      normalize({
        type: "fixed",
        date: "2026-9-20",
        startTime: "14:00",
      }),
    ).toThrow(RangeError);
  });

  it("preserves a fixed time outside daily availability without clamping", () => {
    expect(
      normalize({
        type: "fixed",
        date: TARGET_DATE,
        startTime: "08:30",
      }),
    ).toEqual({
      status: "normalized",
      normalizedViewingTime: {
        type: "fixed",
        window: {
          earliestStart: 510,
          latestStart: 510,
        },
      },
    });
  });
});

describe("start_between normalization", () => {
  it("preserves the Case 02 ranged start window", () => {
    const result = normalize({
      type: "window",
      constraint: "start_between",
      date: TARGET_DATE,
      earliestStart: "13:00",
      latestStart: "15:00",
    });

    expect(result).toEqual({
      status: "normalized",
      normalizedViewingTime: {
        type: "window",
        sourceConstraint: "start_between",
        window: {
          earliestStart: 780,
          latestStart: 900,
        },
      },
    });

    if (
      result.status !== "normalized" ||
      result.normalizedViewingTime.type !== "window"
    ) {
      throw new Error("Expected a normalized start_between window");
    }

    expect(result.normalizedViewingTime.window.earliestStart).not.toBe(
      result.normalizedViewingTime.window.latestStart,
    );
    expect(result.normalizedViewingTime.type).not.toBe("flexible");
  });

  it("returns not_eligible for a valid start_between date mismatch", () => {
    expect(
      normalize({
        type: "window",
        constraint: "start_between",
        date: "2026-09-21",
        earliestStart: "13:00",
        latestStart: "15:00",
      }),
    ).toEqual({ status: "not_eligible" });
  });

  it("throws RangeError for a reversed start_between window", () => {
    expect(() =>
      normalize({
        type: "window",
        constraint: "start_between",
        date: TARGET_DATE,
        earliestStart: "15:00",
        latestStart: "13:00",
      }),
    ).toThrow(RangeError);
  });

  it("preserves raw bounds without intersecting daily availability", () => {
    expect(
      normalize({
        type: "window",
        constraint: "start_between",
        date: TARGET_DATE,
        earliestStart: "08:00",
        latestStart: "10:00",
      }),
    ).toEqual({
      status: "normalized",
      normalizedViewingTime: {
        type: "window",
        sourceConstraint: "start_between",
        window: {
          earliestStart: 480,
          latestStart: 600,
        },
      },
    });
  });
});

describe("finish_before normalization", () => {
  it("derives the Case 03 latest start from finish time and duration", () => {
    expect(
      normalize({
        type: "window",
        constraint: "finish_before",
        date: TARGET_DATE,
        finishBy: "17:00",
      }),
    ).toEqual({
      status: "normalized",
      normalizedViewingTime: {
        type: "window",
        sourceConstraint: "finish_before",
        window: {
          earliestStart: 540,
          latestStart: 990,
        },
      },
    });
  });

  it("recomputes the derived latest start for each duration", () => {
    const viewingTime = {
      type: "window",
      constraint: "finish_before",
      date: TARGET_DATE,
      finishBy: "17:00",
    } as const;

    const thirtyMinuteResult = normalize(viewingTime, {
      durationMinutes: 30,
    });
    const sixtyMinuteResult = normalize(viewingTime, {
      durationMinutes: 60,
    });

    expect(thirtyMinuteResult).toEqual({
      status: "normalized",
      normalizedViewingTime: {
        type: "window",
        sourceConstraint: "finish_before",
        window: {
          earliestStart: 540,
          latestStart: 990,
        },
      },
    });
    expect(sixtyMinuteResult).toEqual({
      status: "normalized",
      normalizedViewingTime: {
        type: "window",
        sourceConstraint: "finish_before",
        window: {
          earliestStart: 540,
          latestStart: 960,
        },
      },
    });
  });

  it("uses an explicit raw earliestStart instead of the daily start", () => {
    expect(
      normalize({
        type: "window",
        constraint: "finish_before",
        date: TARGET_DATE,
        finishBy: "17:00",
        earliestStart: "13:00",
      }),
    ).toEqual({
      status: "normalized",
      normalizedViewingTime: {
        type: "window",
        sourceConstraint: "finish_before",
        window: {
          earliestStart: 780,
          latestStart: 990,
        },
      },
    });
  });

  it("returns not_eligible for a valid finish_before date mismatch", () => {
    expect(
      normalize({
        type: "window",
        constraint: "finish_before",
        date: "2026-09-21",
        finishBy: "17:00",
      }),
    ).toEqual({ status: "not_eligible" });
  });

  it("throws RangeError when duration subtraction underflows midnight", () => {
    expect(() =>
      normalize({
        type: "window",
        constraint: "finish_before",
        date: TARGET_DATE,
        finishBy: "00:20",
      }),
    ).toThrow(RangeError);
  });

  it("throws RangeError when the lower bound exceeds the derived upper bound", () => {
    expect(() =>
      normalize({
        type: "window",
        constraint: "finish_before",
        date: TARGET_DATE,
        finishBy: "17:00",
        earliestStart: "16:45",
      }),
    ).toThrow(RangeError);
  });
});

describe("flexible viewing-time normalization", () => {
  it("uses the supplied target-day planning window exactly", () => {
    expect(normalize({ type: "flexible" })).toEqual({
      status: "normalized",
      normalizedViewingTime: {
        type: "flexible",
        window: {
          earliestStart: 540,
          latestStart: 1080,
        },
      },
    });
  });

  it("does not shrink the CE-03 window by viewing duration", () => {
    expect(
      normalize(
        { type: "flexible" },
        {
          durationMinutes: 30,
        },
      ),
    ).toEqual({
      status: "normalized",
      normalizedViewingTime: {
        type: "flexible",
        window: {
          earliestStart: 540,
          latestStart: 1080,
        },
      },
    });
  });
});

describe("unconfirmed viewing-time normalization", () => {
  it("returns neutral unconfirmed for an undated input without asserting eligibility", () => {
    expect(normalize({ type: "unconfirmed" })).toEqual({
      status: "unconfirmed",
      normalizedViewingTime: {
        type: "unconfirmed",
        window: null,
      },
    });
  });

  it("returns unconfirmed for a matching explicit date", () => {
    expect(
      normalize({ type: "unconfirmed", date: TARGET_DATE }),
    ).toEqual({
      status: "unconfirmed",
      normalizedViewingTime: {
        type: "unconfirmed",
        window: null,
      },
    });
  });

  it("returns not_eligible for a valid explicit date mismatch", () => {
    expect(
      normalize({ type: "unconfirmed", date: "2026-09-21" }),
    ).toEqual({ status: "not_eligible" });
  });

  it("throws RangeError for a malformed explicit date", () => {
    expect(() =>
      normalize({ type: "unconfirmed", date: "2026-9-20" }),
    ).toThrow(RangeError);
  });
});

describe("normalization input integrity", () => {
  it("throws RangeError for strict malformed clock inputs", () => {
    for (const startTime of [
      "24:00",
      "9:00",
      "09:60",
      " 09:00",
      "09:00 ",
    ]) {
      expect(() =>
        normalize({
          type: "fixed",
          date: TARGET_DATE,
          startTime,
        }),
      ).toThrow(RangeError);
    }
  });

  it("throws RangeError for a malformed target date", () => {
    expect(() =>
      normalize(
        {
          type: "fixed",
          date: TARGET_DATE,
          startTime: "14:00",
        },
        { targetDate: "2026-9-20" },
      ),
    ).toThrow(RangeError);
  });

  it("is deterministic and does not mutate frozen inputs", () => {
    const viewingTime = Object.freeze({
      type: "window" as const,
      constraint: "start_between" as const,
      date: TARGET_DATE,
      earliestStart: "13:00",
      latestStart: "15:00",
    });
    const input = Object.freeze({
      viewingTime,
      targetDate: TARGET_DATE,
      dayEarliestStart: 540,
      dayLatestEnd: 1080,
      durationMinutes: 30,
    });

    const firstResult = normalizeViewingTimeForDay(input);
    const secondResult = normalizeViewingTimeForDay(input);

    expect(firstResult).toEqual(secondResult);
    expect(input).toEqual({
      viewingTime: {
        type: "window",
        constraint: "start_between",
        date: TARGET_DATE,
        earliestStart: "13:00",
        latestStart: "15:00",
      },
      targetDate: TARGET_DATE,
      dayEarliestStart: 540,
      dayLatestEnd: 1080,
      durationMinutes: 30,
    });
  });

  it("accepts zero duration and rejects malformed durations", () => {
    expect(
      normalize(
        {
          type: "window",
          constraint: "finish_before",
          date: TARGET_DATE,
          finishBy: "17:00",
        },
        { durationMinutes: 0 },
      ),
    ).toEqual({
      status: "normalized",
      normalizedViewingTime: {
        type: "window",
        sourceConstraint: "finish_before",
        window: {
          earliestStart: 540,
          latestStart: 1020,
        },
      },
    });

    for (const durationMinutes of [-1, 1.5, NaN, Infinity, -Infinity]) {
      expect(() =>
        normalize(
          {
            type: "window",
            constraint: "finish_before",
            date: TARGET_DATE,
            finishBy: "17:00",
          },
          { durationMinutes },
        ),
      ).toThrow(RangeError);
    }
  });

  it("throws RangeError for malformed or reversed supplied day bounds", () => {
    const invalidDayContexts = [
      { dayEarliestStart: -1 },
      { dayEarliestStart: 1.5 },
      { dayLatestEnd: 1440 },
      { dayLatestEnd: NaN },
      { dayEarliestStart: 600, dayLatestEnd: 540 },
    ];

    for (const context of invalidDayContexts) {
      expect(() =>
        normalize({ type: "flexible" }, context),
      ).toThrow(RangeError);
    }
  });
});
