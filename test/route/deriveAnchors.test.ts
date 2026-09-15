import { describe, expect, it } from "vitest";

import { ROUTE_ENGINE_CONFIG } from "../../src/lib/route/config";
import {
  deriveAnchors,
  type DeriveAnchorsInput,
} from "../../src/lib/route/deriveAnchors";
import type {
  DayPlanSettings,
  NormalizedProperty,
  NormalizedViewingTime,
} from "../../src/lib/route/types";

const TARGET_DATE = "2026-09-20";
const EMPTY_ROUTE_PREFERENCES = Object.freeze([]);

function createSettings(
  overrides: Partial<DayPlanSettings> = {},
): DayPlanSettings {
  return Object.freeze({
    date: TARGET_DATE,
    originLocationId: "origin",
    earliestStart: 540,
    latestEnd: 1080,
    transportStrategy: "transit_first",
    taxiBudget: Object.freeze({ type: "unset" as const }),
    fixedAppointmentBufferMinutes: 15,
    routePreferences: EMPTY_ROUTE_PREFERENCES,
    ...overrides,
  });
}

function freezeWindow(earliestStart: number, latestStart: number) {
  return Object.freeze({ earliestStart, latestStart });
}

function fixedViewingTime(start: number): NormalizedViewingTime {
  return Object.freeze({
    type: "fixed",
    window: freezeWindow(start, start),
  });
}

function windowViewingTime(
  earliestStart: number,
  latestStart: number,
  sourceConstraint: "start_between" | "finish_before" = "start_between",
): NormalizedViewingTime {
  return Object.freeze({
    type: "window",
    sourceConstraint,
    window: freezeWindow(earliestStart, latestStart),
  });
}

function flexibleViewingTime(
  earliestStart: number,
  latestStart: number,
): NormalizedViewingTime {
  return Object.freeze({
    type: "flexible",
    window: freezeWindow(earliestStart, latestStart),
  });
}

function unconfirmedViewingTime(): NormalizedViewingTime {
  return Object.freeze({ type: "unconfirmed", window: null });
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

function createInput(
  properties: readonly NormalizedProperty[],
  settings = createSettings(),
): DeriveAnchorsInput {
  return { settings, properties };
}

describe("deriveAnchors classification", () => {
  it("always derives a fixed anchor with the route's required buffer", () => {
    const settings = createSettings({ fixedAppointmentBufferMinutes: 22 });
    const property = createProperty("A", fixedViewingTime(840));

    expect(deriveAnchors(createInput([property], settings))).toEqual([
      {
        propertyId: "A",
        locationId: "location-A",
        kind: "fixed",
        earliestStart: 840,
        latestStart: 840,
        requiredBufferMinutes: 22,
      },
    ]);
  });

  it("includes an explicit window at the inclusive configured threshold", () => {
    const threshold =
      ROUTE_ENGINE_CONFIG.anchors.narrowWindowAnchorMaximumWidthMinutes;
    const property = createProperty(
      "A",
      windowViewingTime(780, 780 + threshold),
    );

    expect(deriveAnchors(createInput([property]))).toEqual([
      {
        propertyId: "A",
        locationId: "location-A",
        kind: "narrow_window",
        earliestStart: 780,
        latestStart: 780 + threshold,
        requiredBufferMinutes: 0,
      },
    ]);
  });

  it("excludes an explicit window one minute wider than the threshold", () => {
    const threshold =
      ROUTE_ENGINE_CONFIG.anchors.narrowWindowAnchorMaximumWidthMinutes;
    const property = createProperty(
      "A",
      windowViewingTime(780, 780 + threshold + 1),
    );

    expect(deriveAnchors(createInput([property]))).toEqual([]);
  });

  it("classifies a normalized finish-before window without rederiving it", () => {
    const threshold =
      ROUTE_ENGINE_CONFIG.anchors.narrowWindowAnchorMaximumWidthMinutes;
    const property = createProperty(
      "A",
      windowViewingTime(900, 900 + threshold, "finish_before"),
    );

    expect(deriveAnchors(createInput([property]))).toMatchObject([
      {
        propertyId: "A",
        kind: "narrow_window",
        earliestStart: 900,
        latestStart: 900 + threshold,
      },
    ]);
  });

  it("never converts a narrow flexible window into an anchor", () => {
    const threshold =
      ROUTE_ENGINE_CONFIG.anchors.narrowWindowAnchorMaximumWidthMinutes;
    const property = createProperty(
      "A",
      flexibleViewingTime(600, 600 + threshold),
    );

    expect(deriveAnchors(createInput([property]))).toEqual([]);
  });

  it("never derives an anchor for unconfirmed input", () => {
    const property = createProperty("A", unconfirmedViewingTime());

    expect(deriveAnchors(createInput([property]))).toEqual([]);
  });
});

describe("deriveAnchors ordering and immutability", () => {
  it("orders by earliest start, latest start, then stable input index", () => {
    const properties = [
      createProperty("A", windowViewingTime(600, 650)),
      createProperty("B", fixedViewingTime(800)),
      createProperty("C", windowViewingTime(600, 650)),
      createProperty("D", fixedViewingTime(600)),
    ];

    expect(
      deriveAnchors(createInput(properties)).map((anchor) => anchor.propertyId),
    ).toEqual(["D", "A", "C", "B"]);
  });

  it("does not mutate frozen settings, properties, windows, or config", () => {
    const settings = createSettings({ fixedAppointmentBufferMinutes: 22 });
    const properties = Object.freeze([
      createProperty("A", windowViewingTime(600, 650)),
      createProperty("B", fixedViewingTime(800)),
    ]);
    const input = Object.freeze({ settings, properties });
    const snapshot = JSON.stringify({
      input,
      anchorConfig: ROUTE_ENGINE_CONFIG.anchors,
    });

    deriveAnchors(input);

    expect(
      JSON.stringify({ input, anchorConfig: ROUTE_ENGINE_CONFIG.anchors }),
    ).toBe(snapshot);
  });

  it("runtime-freezes the anchor array and every anchor", () => {
    const anchors = deriveAnchors(
      createInput([
        createProperty("A", windowViewingTime(600, 650)),
        createProperty("B", fixedViewingTime(800)),
      ]),
    );

    expect(Object.isFrozen(anchors)).toBe(true);
    expect(anchors.every(Object.isFrozen)).toBe(true);
  });

  it("returns deeply equal anchors for repeated identical inputs", () => {
    const input = createInput([
      createProperty("A", windowViewingTime(600, 650)),
      createProperty("B", fixedViewingTime(800)),
    ]);

    expect(deriveAnchors(input)).toEqual(deriveAnchors(input));
  });
});
