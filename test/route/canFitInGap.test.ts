import { describe, expect, it } from "vitest";

import {
  canFitInGap,
  isGapInsertableProperty,
  type CanFitInGapInput,
} from "../../src/lib/route/canFitInGap";
import { ROUTE_ENGINE_CONFIG } from "../../src/lib/route/config";
import {
  deriveAnchors,
  type TimeAnchor,
} from "../../src/lib/route/deriveAnchors";
import type {
  DayPlanSettings,
  NormalizedProperty,
  NormalizedViewingTime,
} from "../../src/lib/route/types";

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

function createProperty(
  id: string,
  viewingTime: NormalizedViewingTime,
): NormalizedProperty {
  return Object.freeze({
    id,
    address: `${id} address`,
    displayName: id,
    locationId: `location-${id}`,
    viewingTime,
    importance: "if_time",
    durationMinutes: 30,
    status: "pending",
  });
}

const EXACT_FIT_INPUT: CanFitInGapInput = Object.freeze({
  currentEnd: 600,
  travelToCandidateMinutes: 10,
  candidateEarliestStart: 540,
  candidateLatestStart: 675,
  candidateViewingDurationMinutes: 30,
  travelToNextAnchorMinutes: 20,
  safetyBufferMinutes: 15,
  nextAnchorLatestTime: 675,
});

describe("canFitInGap", () => {
  it("accepts an exact inclusive fit", () => {
    expect(canFitInGap(EXACT_FIT_INPUT)).toBe(true);
  });

  it("rejects a one-minute miss", () => {
    expect(
      canFitInGap({
        ...EXACT_FIT_INPUT,
        nextAnchorLatestTime: 674,
      }),
    ).toBe(false);
  });

  it("rejects an insertion when candidate-window waiting makes the next anchor late", () => {
    expect(
      canFitInGap({
        currentEnd: 600,
        travelToCandidateMinutes: 10,
        candidateEarliestStart: 700,
        candidateLatestStart: 900,
        candidateViewingDurationMinutes: 30,
        travelToNextAnchorMinutes: 10,
        safetyBufferMinutes: 15,
        nextAnchorLatestTime: 750,
      }),
    ).toBe(false);
  });

  it("accepts an exact final boundary after candidate-window waiting", () => {
    expect(
      canFitInGap({
        currentEnd: 600,
        travelToCandidateMinutes: 10,
        candidateEarliestStart: 700,
        candidateLatestStart: 900,
        candidateViewingDurationMinutes: 30,
        travelToNextAnchorMinutes: 10,
        safetyBufferMinutes: 15,
        nextAnchorLatestTime: 755,
      }),
    ).toBe(true);
  });

  it("rejects arrival after the candidate's own latest start", () => {
    expect(
      canFitInGap({
        currentEnd: 800,
        travelToCandidateMinutes: 11,
        candidateEarliestStart: 600,
        candidateLatestStart: 810,
        candidateViewingDurationMinutes: 30,
        travelToNextAnchorMinutes: 0,
        safetyBufferMinutes: 0,
        nextAnchorLatestTime: 1000,
      }),
    ).toBe(false);
  });

  it("accepts arrival exactly at the candidate's inclusive latest start", () => {
    expect(
      canFitInGap({
        currentEnd: 800,
        travelToCandidateMinutes: 10,
        candidateEarliestStart: 600,
        candidateLatestStart: 810,
        candidateViewingDurationMinutes: 30,
        travelToNextAnchorMinutes: 0,
        safetyBufferMinutes: 0,
        nextAnchorLatestTime: 840,
      }),
    ).toBe(true);
  });

  it("includes travel to the candidate", () => {
    expect(canFitInGap(EXACT_FIT_INPUT)).toBe(true);
    expect(
      canFitInGap({
        ...EXACT_FIT_INPUT,
        travelToCandidateMinutes: 11,
      }),
    ).toBe(false);
  });

  it("includes the candidate viewing duration", () => {
    expect(canFitInGap(EXACT_FIT_INPUT)).toBe(true);
    expect(
      canFitInGap({
        ...EXACT_FIT_INPUT,
        candidateViewingDurationMinutes: 31,
      }),
    ).toBe(false);
  });

  it("includes onward travel to the next anchor", () => {
    expect(canFitInGap(EXACT_FIT_INPUT)).toBe(true);
    expect(
      canFitInGap({
        ...EXACT_FIT_INPUT,
        travelToNextAnchorMinutes: 21,
      }),
    ).toBe(false);
  });

  it("includes the supplied required scheduling buffer", () => {
    const withoutBuffer = {
      ...EXACT_FIT_INPUT,
      safetyBufferMinutes: 0,
      nextAnchorLatestTime: 660,
    };

    expect(canFitInGap(withoutBuffer)).toBe(true);
    expect(
      canFitInGap({ ...withoutBuffer, safetyBufferMinutes: 15 }),
    ).toBe(false);
  });

  it("returns false when cumulative arithmetic crosses midnight", () => {
    expect(
      canFitInGap({
        currentEnd: 1430,
        travelToCandidateMinutes: 5,
        candidateEarliestStart: 0,
        candidateLatestStart: 1439,
        candidateViewingDurationMinutes: 5,
        travelToNextAnchorMinutes: 0,
        safetyBufferMinutes: 0,
        nextAnchorLatestTime: 1439,
      }),
    ).toBe(false);
  });

  it("does not mutate frozen input and repeats the same result", () => {
    const input = Object.freeze({ ...EXACT_FIT_INPUT });
    const snapshot = JSON.stringify(input);

    expect(canFitInGap(input)).toBe(true);
    expect(canFitInGap(input)).toBe(true);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("isGapInsertableProperty", () => {
  it("accepts a flexible property", () => {
    const property = createProperty(
      "F",
      Object.freeze({
        type: "flexible",
        window: Object.freeze({ earliestStart: 540, latestStart: 1080 }),
      }),
    );

    expect(isGapInsertableProperty({ property, anchors: [] })).toBe(true);
  });

  it("rejects a window classified as a narrow anchor by CE-08", () => {
    const property = createProperty("N", windowViewingTime(600, 630));
    const anchors = deriveAnchors({
      settings: createSettings(),
      properties: [property],
    });

    expect(anchors.map(({ propertyId }) => propertyId)).toEqual(["N"]);
    expect(isGapInsertableProperty({ property, anchors })).toBe(false);
  });

  it("accepts a window one minute wider than the CE-08 threshold", () => {
    const width =
      ROUTE_ENGINE_CONFIG.anchors.narrowWindowAnchorMaximumWidthMinutes + 1;
    const property = createProperty("W", windowViewingTime(600, 600 + width));
    const anchors = deriveAnchors({
      settings: createSettings(),
      properties: [property],
    });

    expect(anchors).toEqual([]);
    expect(isGapInsertableProperty({ property, anchors })).toBe(true);
  });

  it("rejects a window at the inclusive CE-08 threshold", () => {
    const width =
      ROUTE_ENGINE_CONFIG.anchors.narrowWindowAnchorMaximumWidthMinutes;
    const property = createProperty("N", windowViewingTime(600, 600 + width));
    const anchors = deriveAnchors({
      settings: createSettings(),
      properties: [property],
    });

    expect(anchors).toHaveLength(1);
    expect(isGapInsertableProperty({ property, anchors })).toBe(false);
  });

  it("rejects a fixed property", () => {
    const property = createProperty("A", fixedViewingTime(600));

    expect(isGapInsertableProperty({ property, anchors: [] })).toBe(false);
  });

  it("rejects an unconfirmed property without deciding date eligibility", () => {
    const property = createProperty(
      "U",
      Object.freeze({ type: "unconfirmed", window: null }),
    );
    const anchors: readonly TimeAnchor[] = Object.freeze([]);

    expect(isGapInsertableProperty({ property, anchors })).toBe(false);
  });
});
