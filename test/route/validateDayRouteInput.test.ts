import { describe, expect, it } from "vitest";

import { ROUTE_ENGINE_CONFIG } from "../../src/lib/route/config";
import type {
  DayPlanSettings,
  Property,
  RoutePreference,
  TaxiBudget,
} from "../../src/lib/route/types";
import {
  validateDayRouteInput,
  type DayRouteInputValidationIssueCode,
  type ValidateDayRouteInputResult,
} from "../../src/lib/route/validateDayRouteInput";

const TARGET_DATE = "2026-09-20";

function createSettings(
  overrides: Partial<DayPlanSettings> = {},
): DayPlanSettings {
  return {
    date: TARGET_DATE,
    originLocationId: "origin",
    earliestStart: 540,
    latestEnd: 1080,
    transportStrategy: "transit_first",
    taxiBudget: { type: "unset" },
    fixedAppointmentBufferMinutes: 15,
    routePreferences: [],
    ...overrides,
  };
}

function createProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "property-1",
    address: "1 Example Road",
    locationId: "location-1",
    viewingTime: { type: "flexible" },
    importance: "if_time",
    status: "pending",
    ...overrides,
  };
}

function validate(
  settings: DayPlanSettings = createSettings(),
  properties: readonly Property[] = [createProperty()],
) {
  return validateDayRouteInput({ settings, properties });
}

function expectIssueCodes(
  result: ValidateDayRouteInputResult,
  expectedCodes: readonly DayRouteInputValidationIssueCode[],
): void {
  expect(result.valid).toBe(false);

  if (result.valid) {
    throw new Error("Expected invalid Daily Route input");
  }

  expect(result.issues.map((issue) => issue.code)).toEqual(expectedCodes);
}

describe("Daily Route settings validation", () => {
  it("accepts one valid property without a TravelMatrix", () => {
    expect(validate()).toEqual({ valid: true, issues: [] });
  });

  it("rejects a malformed target CalendarDate", () => {
    expectIssueCodes(validate(createSettings({ date: "2026-9-20" })), [
      "invalid_settings_date",
    ]);
  });

  it("rejects invalid MinuteOfDay bounds", () => {
    expectIssueCodes(validate(createSettings({ earliestStart: -1 })), [
      "invalid_earliest_start",
    ]);
    expectIssueCodes(validate(createSettings({ latestEnd: 1440 })), [
      "invalid_latest_end",
    ]);
  });

  it("rejects reversed daily bounds without overnight interpretation", () => {
    expectIssueCodes(
      validate(createSettings({ earliestStart: 1080, latestEnd: 540 })),
      ["reversed_day_window"],
    );
  });

  it("accepts equal daily bounds as structurally valid", () => {
    expect(
      validate(createSettings({ earliestStart: 540, latestEnd: 540 })),
    ).toEqual({ valid: true, issues: [] });
  });

  it("rejects an empty or whitespace-only origin location identity", () => {
    for (const originLocationId of ["", "   "]) {
      expectIssueCodes(validate(createSettings({ originLocationId })), [
        "invalid_origin_location_id",
      ]);
    }
  });

  it("rejects malformed fixed-appointment buffers", () => {
    for (const fixedAppointmentBufferMinutes of [
      -1,
      1.5,
      NaN,
      Infinity,
      -Infinity,
    ]) {
      expectIssueCodes(
        validate(createSettings({ fixedAppointmentBufferMinutes })),
        ["invalid_fixed_appointment_buffer"],
      );
    }
  });

  it("accepts every structurally valid taxi-budget state", () => {
    const budgets: readonly TaxiBudget[] = [
      { type: "unset" },
      { type: "unlimited" },
      { type: "capped", amount: 0 },
      { type: "capped", amount: 60.5 },
    ];

    for (const taxiBudget of budgets) {
      expect(validate(createSettings({ taxiBudget }))).toEqual({
        valid: true,
        issues: [],
      });
    }
  });

  it("rejects malformed capped budgets and unsupported budget variants", () => {
    const invalidBudgets = [
      { type: "capped", amount: -1 },
      { type: "capped", amount: NaN },
      { type: "capped", amount: Infinity },
      { type: "capped" },
      { type: "limited", amount: 50 },
    ] as unknown as readonly TaxiBudget[];

    for (const taxiBudget of invalidBudgets) {
      expectIssueCodes(validate(createSettings({ taxiBudget })), [
        "invalid_taxi_budget",
      ]);
    }
  });

  it("rejects an unsupported transport strategy", () => {
    expectIssueCodes(
      validate(
        createSettings({
          transportStrategy:
            "walking_only" as DayPlanSettings["transportStrategy"],
        }),
      ),
      ["invalid_transport_strategy"],
    );
  });

  it("rejects a non-array or unsupported route preference", () => {
    expectIssueCodes(
      validate(
        createSettings({
          routePreferences:
            "less_walking" as unknown as readonly RoutePreference[],
        }),
      ),
      ["invalid_route_preferences"],
    );
    expectIssueCodes(
      validate(
        createSettings({
          routePreferences: [
            "less_walking",
            "scenic_route" as RoutePreference,
          ],
        }),
      ),
      ["invalid_route_preferences"],
    );
  });
});

describe("property collection cardinality", () => {
  it("rejects an empty property list", () => {
    expectIssueCodes(validate(createSettings(), []), ["empty_properties"]);
  });

  it("accepts exactly one property for Case 17", () => {
    expect(validate(createSettings(), [createProperty()])).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("accepts two valid properties", () => {
    expect(
      validate(createSettings(), [
        createProperty(),
        createProperty({ id: "property-2", locationId: "location-2" }),
      ]),
    ).toEqual({ valid: true, issues: [] });
  });

  it("accepts more than the core-scenario property-count guidance", () => {
    const propertyCount =
      ROUTE_ENGINE_CONFIG.search.coreScenarioPropertyCountMaximum + 2;
    const properties = Array.from({ length: propertyCount }, (_, index) =>
      createProperty({
        id: `property-${index + 1}`,
        address: `${index + 1} Example Road`,
        locationId: `location-${index + 1}`,
      }),
    );

    expect(propertyCount).toBeGreaterThan(8);
    expect(validate(createSettings(), properties)).toEqual({
      valid: true,
      issues: [],
    });
  });
});

describe("property identity, address, and location validation", () => {
  it("rejects an empty or whitespace-only property ID", () => {
    for (const id of ["", "   "]) {
      expectIssueCodes(validate(createSettings(), [createProperty({ id })]), [
        "invalid_property_id",
      ]);
    }
  });

  it("rejects duplicate property IDs", () => {
    expect(
      validate(createSettings(), [
        createProperty(),
        createProperty({ address: "2 Example Road", locationId: "location-2" }),
      ]),
    ).toEqual({
      valid: false,
      issues: [
        {
          code: "duplicate_property_id",
          scope: "property",
          propertyIndex: 1,
          propertyId: "property-1",
        },
      ],
    });
  });

  it("reports every duplicate after the first in stable property order", () => {
    expect(
      validate(createSettings(), [
        createProperty(),
        createProperty({ address: "2 Example Road", locationId: "location-2" }),
        createProperty({ address: "3 Example Road", locationId: "location-3" }),
      ]),
    ).toEqual({
      valid: false,
      issues: [
        {
          code: "duplicate_property_id",
          scope: "property",
          propertyIndex: 1,
          propertyId: "property-1",
        },
        {
          code: "duplicate_property_id",
          scope: "property",
          propertyIndex: 2,
          propertyId: "property-1",
        },
      ],
    });
  });

  it("uses exact string identity without canonicalizing valid property IDs", () => {
    expect(
      validate(createSettings(), [
        createProperty({ id: "A" }),
        createProperty({
          id: " A ",
          address: "2 Example Road",
          locationId: "location-2",
        }),
      ]),
    ).toEqual({ valid: true, issues: [] });
  });

  it("does not classify repeated invalid IDs as duplicates", () => {
    expectIssueCodes(
      validate(createSettings(), [
        createProperty({ id: "" }),
        createProperty({ id: "", address: "2 Example Road" }),
        createProperty({ id: "   ", address: "3 Example Road" }),
        createProperty({ id: "   ", address: "4 Example Road" }),
      ]),
      [
        "invalid_property_id",
        "invalid_property_id",
        "invalid_property_id",
        "invalid_property_id",
      ],
    );
  });

  it("rejects an empty address", () => {
    expectIssueCodes(
      validate(createSettings(), [createProperty({ address: "" })]),
      ["invalid_property_address"],
    );
  });

  it("rejects a whitespace-only address", () => {
    expectIssueCodes(
      validate(createSettings(), [createProperty({ address: "   " })]),
      ["invalid_property_address"],
    );
  });

  it("rejects a missing locationId", () => {
    expectIssueCodes(
      validate(createSettings(), [createProperty({ locationId: undefined })]),
      ["invalid_property_location_id"],
    );
  });

  it("rejects an empty or whitespace-only locationId", () => {
    for (const locationId of ["", "   "]) {
      expectIssueCodes(
        validate(createSettings(), [createProperty({ locationId })]),
        ["invalid_property_location_id"],
      );
    }
  });

  it("accepts duplicate addresses for distinct properties", () => {
    expect(
      validate(createSettings(), [
        createProperty(),
        createProperty({ id: "property-2", locationId: "location-2" }),
      ]),
    ).toEqual({ valid: true, issues: [] });
  });
});

describe("property duration validation", () => {
  it("accepts an explicit valid duration", () => {
    expect(
      validate(createSettings(), [createProperty({ durationMinutes: 30 })]),
    ).toEqual({ valid: true, issues: [] });
  });

  it("uses the configured default for undefined duration without mutation", () => {
    const property = Object.freeze(createProperty());

    expect(property.durationMinutes).toBeUndefined();
    expect(validate(createSettings(), [property])).toEqual({
      valid: true,
      issues: [],
    });
    expect(property.durationMinutes).toBeUndefined();
    expect(ROUTE_ENGINE_CONFIG.defaults.viewingDurationMinutes).toBe(30);
  });

  it("rejects malformed explicit durations", () => {
    for (const durationMinutes of [-1, 1.5, NaN, Infinity, -Infinity]) {
      expectIssueCodes(
        validate(createSettings(), [createProperty({ durationMinutes })]),
        ["invalid_property_duration"],
      );
    }
  });
});

describe("property date compatibility", () => {
  it("accepts multiple fixed properties on the target date", () => {
    expect(
      validate(createSettings(), [
        createProperty({
          viewingTime: {
            type: "fixed",
            date: TARGET_DATE,
            startTime: "10:00",
          },
        }),
        createProperty({
          id: "property-2",
          locationId: "location-2",
          viewingTime: {
            type: "fixed",
            date: TARGET_DATE,
            startTime: "14:00",
          },
        }),
      ]),
    ).toEqual({ valid: true, issues: [] });
  });

  it("rejects mixed fixed dates only for this Daily Route, not the multi-day plan", () => {
    const result = validate(createSettings(), [
      createProperty({
        viewingTime: {
          type: "fixed",
          date: TARGET_DATE,
          startTime: "10:00",
        },
      }),
      createProperty({
        id: "property-2",
        locationId: "location-2",
        viewingTime: {
          type: "fixed",
          date: "2026-09-21",
          startTime: "14:00",
        },
      }),
    ]);

    expect(result).toEqual({
      valid: false,
      issues: [
        {
          code: "property_date_mismatch",
          scope: "property",
          propertyIndex: 1,
          propertyId: "property-2",
        },
      ],
    });
  });

  it("rejects a mismatched start_between date", () => {
    expectIssueCodes(
      validate(createSettings(), [
        createProperty({
          viewingTime: {
            type: "window",
            constraint: "start_between",
            date: "2026-09-21",
            earliestStart: "13:00",
            latestStart: "15:00",
          },
        }),
      ]),
      ["property_date_mismatch"],
    );
  });

  it("rejects a mismatched finish_before date", () => {
    expectIssueCodes(
      validate(createSettings(), [
        createProperty({
          viewingTime: {
            type: "window",
            constraint: "finish_before",
            date: "2026-09-21",
            finishBy: "17:00",
          },
        }),
      ]),
      ["property_date_mismatch"],
    );
  });

  it("rejects a mismatched dated-unconfirmed input", () => {
    expectIssueCodes(
      validate(createSettings(), [
        createProperty({
          viewingTime: { type: "unconfirmed", date: "2026-09-21" },
        }),
      ]),
      ["property_date_mismatch"],
    );
  });

  it("accepts flexible input without deriving eligibleDays", () => {
    expect(validate(createSettings(), [createProperty()])).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("accepts undated unconfirmed structure without resolving Gate E", () => {
    expect(
      validate(createSettings(), [
        createProperty({ viewingTime: { type: "unconfirmed" } }),
      ]),
    ).toEqual({ valid: true, issues: [] });
  });
});

describe("viewing-time structural validation", () => {
  it("converts CE-03 RangeError cases into invalid viewing-time issues", () => {
    const malformedViewingTimes: readonly Property["viewingTime"][] = [
      { type: "fixed", date: TARGET_DATE, startTime: "24:00" },
      { type: "fixed", date: "2026-9-20", startTime: "10:00" },
      {
        type: "window",
        constraint: "start_between",
        date: TARGET_DATE,
        earliestStart: "15:00",
        latestStart: "13:00",
      },
      {
        type: "window",
        constraint: "finish_before",
        date: TARGET_DATE,
        finishBy: "00:20",
      },
    ];

    for (const viewingTime of malformedViewingTimes) {
      expectIssueCodes(
        validate(createSettings(), [createProperty({ viewingTime })]),
        ["invalid_viewing_time"],
      );
    }
  });

  it("rejects unsupported runtime importance and status values", () => {
    expectIssueCodes(
      validate(createSettings(), [
        createProperty({
          importance: "optional" as Property["importance"],
          status: "archived" as Property["status"],
        }),
      ]),
      ["invalid_property_importance", "invalid_property_status"],
    );
  });
});

describe("CE-04 feasibility boundary", () => {
  it("accepts a fixed appointment outside daily availability", () => {
    expect(
      validate(createSettings(), [
        createProperty({
          viewingTime: {
            type: "fixed",
            date: TARGET_DATE,
            startTime: "08:30",
          },
        }),
      ]),
    ).toEqual({ valid: true, issues: [] });
  });

  it("accepts a start_between window outside daily availability", () => {
    expect(
      validate(createSettings(), [
        createProperty({
          viewingTime: {
            type: "window",
            constraint: "start_between",
            date: TARGET_DATE,
            earliestStart: "07:00",
            latestStart: "08:00",
          },
        }),
      ]),
    ).toEqual({ valid: true, issues: [] });
  });

  it("does not reject overlapping fixed appointments", () => {
    expect(
      validate(
        createSettings({ earliestStart: 540, latestEnd: 600 }),
        [
          createProperty({
            durationMinutes: 60,
            viewingTime: {
              type: "fixed",
              date: TARGET_DATE,
              startTime: "09:15",
            },
          }),
          createProperty({
            id: "property-2",
            locationId: "location-2",
            durationMinutes: 60,
            viewingTime: {
              type: "fixed",
              date: TARGET_DATE,
              startTime: "09:30",
            },
          }),
        ],
      ),
    ).toEqual({ valid: true, issues: [] });
  });

  it("does not reject a must property that appears impossible to fit", () => {
    expect(
      validate(
        createSettings({ earliestStart: 540, latestEnd: 540 }),
        [
          createProperty({
            importance: "must",
            durationMinutes: 120,
          }),
        ],
      ),
    ).toEqual({ valid: true, issues: [] });
  });
});

describe("deterministic issue collection and purity", () => {
  it("collects issues in stable settings then property-field order", () => {
    const result = validate(
      createSettings({
        date: "2026-9-20",
        originLocationId: " ",
        earliestStart: -1,
      }),
      [
        createProperty({
          address: "",
          locationId: undefined,
          durationMinutes: -1,
          importance: "optional" as Property["importance"],
          status: "archived" as Property["status"],
        }),
      ],
    );

    expectIssueCodes(result, [
      "invalid_settings_date",
      "invalid_origin_location_id",
      "invalid_earliest_start",
      "invalid_property_address",
      "invalid_property_location_id",
      "invalid_property_duration",
      "invalid_property_importance",
      "invalid_property_status",
    ]);
  });

  it("returns equal results without mutating frozen inputs", () => {
    const settings = Object.freeze(createSettings());
    const viewingTime = Object.freeze({ type: "flexible" as const });
    const property = Object.freeze(createProperty({ viewingTime }));
    const properties = Object.freeze([property]);
    const input = Object.freeze({ settings, properties });

    const firstResult = validateDayRouteInput(input);
    const secondResult = validateDayRouteInput(input);

    expect(firstResult).toEqual(secondResult);
    expect(input).toEqual({ settings, properties });
    expect(property.viewingTime).toEqual({ type: "flexible" });
    expect(property.durationMinutes).toBeUndefined();
  });
});
