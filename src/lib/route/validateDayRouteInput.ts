import { ROUTE_ENGINE_CONFIG } from "./config";
import { normalizeViewingTimeForDay } from "./normalizeWindows";
import { isValidCalendarDate, isValidMinuteOfDay } from "./time";
import type {
  DayPlanSettings,
  Property,
  PropertyImportance,
  PropertyStatus,
  RoutePreference,
  TaxiBudget,
  TransportStrategy,
  ViewingTimeInput,
} from "./types";

export interface ValidateDayRouteInputInput {
  readonly settings: DayPlanSettings;
  readonly properties: readonly Property[];
}

export type DayRouteInputValidationIssueCode =
  | "invalid_settings_date"
  | "invalid_origin_location_id"
  | "invalid_earliest_start"
  | "invalid_latest_end"
  | "reversed_day_window"
  | "invalid_transport_strategy"
  | "invalid_taxi_budget"
  | "invalid_fixed_appointment_buffer"
  | "invalid_route_preferences"
  | "invalid_properties_collection"
  | "empty_properties"
  | "invalid_property_structure"
  | "invalid_property_id"
  | "invalid_property_address"
  | "invalid_property_location_id"
  | "invalid_property_duration"
  | "invalid_property_importance"
  | "invalid_property_status"
  | "invalid_viewing_time"
  | "property_date_mismatch";

export type DayRouteInputValidationIssue =
  | Readonly<{
      code: DayRouteInputValidationIssueCode;
      scope: "settings" | "properties";
    }>
  | Readonly<{
      code: DayRouteInputValidationIssueCode;
      scope: "property";
      propertyIndex: number;
      propertyId?: string;
    }>;

export type ValidateDayRouteInputResult =
  | Readonly<{
      valid: true;
      issues: readonly [];
    }>
  | Readonly<{
      valid: false;
      issues: readonly [
        DayRouteInputValidationIssue,
        ...DayRouteInputValidationIssue[],
      ];
    }>;

const TRANSPORT_STRATEGIES: readonly TransportStrategy[] = [
  "transit_only",
  "transit_first",
  "efficiency_first",
];

const ROUTE_PREFERENCES: readonly RoutePreference[] = [
  "fewer_transfers",
  "less_walking",
  "avoid_long_cycling",
];

const PROPERTY_IMPORTANCE_VALUES: readonly PropertyImportance[] = [
  "must",
  "if_time",
];

const PROPERTY_STATUS_VALUES: readonly PropertyStatus[] = [
  "pending",
  "en_route",
  "arrived",
  "viewing",
  "completed",
  "cancelled",
  "skipped",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && /\S/u.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function isTransportStrategy(value: unknown): value is TransportStrategy {
  return TRANSPORT_STRATEGIES.some((strategy) => strategy === value);
}

function isRoutePreference(value: unknown): value is RoutePreference {
  return ROUTE_PREFERENCES.some((preference) => preference === value);
}

function isPropertyImportance(value: unknown): value is PropertyImportance {
  return PROPERTY_IMPORTANCE_VALUES.some(
    (importance) => importance === value,
  );
}

function isPropertyStatus(value: unknown): value is PropertyStatus {
  return PROPERTY_STATUS_VALUES.some((status) => status === value);
}

function isTaxiBudget(value: unknown): value is TaxiBudget {
  if (!isRecord(value)) {
    return false;
  }

  if (value.type === "unset" || value.type === "unlimited") {
    return true;
  }

  return (
    value.type === "capped" &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    value.amount >= 0
  );
}

function hasViewingTimeShape(value: unknown): value is ViewingTimeInput {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.type) {
    case "fixed":
      return typeof value.date === "string" && typeof value.startTime === "string";
    case "window":
      if (value.constraint === "start_between") {
        return (
          typeof value.date === "string" &&
          typeof value.earliestStart === "string" &&
          typeof value.latestStart === "string"
        );
      }

      return (
        value.constraint === "finish_before" &&
        typeof value.date === "string" &&
        typeof value.finishBy === "string" &&
        (value.earliestStart === undefined ||
          typeof value.earliestStart === "string")
      );
    case "flexible":
      return true;
    case "unconfirmed":
      return value.date === undefined || typeof value.date === "string";
    default:
      return false;
  }
}

function propertyIssue(
  code: DayRouteInputValidationIssueCode,
  propertyIndex: number,
  propertyId: unknown,
): DayRouteInputValidationIssue {
  if (typeof propertyId === "string") {
    return { code, scope: "property", propertyIndex, propertyId };
  }

  return { code, scope: "property", propertyIndex };
}

export function validateDayRouteInput(
  input: ValidateDayRouteInputInput,
): ValidateDayRouteInputResult {
  const issues: DayRouteInputValidationIssue[] = [];
  const { settings } = input;

  const hasValidSettingsDate =
    typeof settings.date === "string" &&
    isValidCalendarDate(settings.date);
  const hasValidEarliestStart =
    typeof settings.earliestStart === "number" &&
    isValidMinuteOfDay(settings.earliestStart);
  const hasValidLatestEnd =
    typeof settings.latestEnd === "number" &&
    isValidMinuteOfDay(settings.latestEnd);

  if (!hasValidSettingsDate) {
    issues.push({ code: "invalid_settings_date", scope: "settings" });
  }

  if (!isNonBlankString(settings.originLocationId)) {
    issues.push({ code: "invalid_origin_location_id", scope: "settings" });
  }

  if (!hasValidEarliestStart) {
    issues.push({ code: "invalid_earliest_start", scope: "settings" });
  }

  if (!hasValidLatestEnd) {
    issues.push({ code: "invalid_latest_end", scope: "settings" });
  }

  const hasOrderedDayWindow =
    hasValidEarliestStart &&
    hasValidLatestEnd &&
    settings.earliestStart <= settings.latestEnd;

  if (
    hasValidEarliestStart &&
    hasValidLatestEnd &&
    !hasOrderedDayWindow
  ) {
    issues.push({ code: "reversed_day_window", scope: "settings" });
  }

  if (!isTransportStrategy(settings.transportStrategy)) {
    issues.push({ code: "invalid_transport_strategy", scope: "settings" });
  }

  if (!isTaxiBudget(settings.taxiBudget)) {
    issues.push({ code: "invalid_taxi_budget", scope: "settings" });
  }

  if (!isNonNegativeInteger(settings.fixedAppointmentBufferMinutes)) {
    issues.push({
      code: "invalid_fixed_appointment_buffer",
      scope: "settings",
    });
  }

  if (
    !Array.isArray(settings.routePreferences) ||
    !settings.routePreferences.every(isRoutePreference)
  ) {
    issues.push({ code: "invalid_route_preferences", scope: "settings" });
  }

  if (!Array.isArray(input.properties)) {
    issues.push({
      code: "invalid_properties_collection",
      scope: "properties",
    });
  } else {
    if (input.properties.length === 0) {
      issues.push({ code: "empty_properties", scope: "properties" });
    }

    input.properties.forEach((property, propertyIndex) => {
      if (!isRecord(property)) {
        issues.push(
          propertyIssue(
            "invalid_property_structure",
            propertyIndex,
            undefined,
          ),
        );
        return;
      }

      if (!isNonBlankString(property.id)) {
        issues.push(
          propertyIssue("invalid_property_id", propertyIndex, property.id),
        );
      }

      if (!isNonBlankString(property.address)) {
        issues.push(
          propertyIssue(
            "invalid_property_address",
            propertyIndex,
            property.id,
          ),
        );
      }

      if (!isNonBlankString(property.locationId)) {
        issues.push(
          propertyIssue(
            "invalid_property_location_id",
            propertyIndex,
            property.id,
          ),
        );
      }

      const effectiveDurationMinutes =
        property.durationMinutes === undefined
          ? ROUTE_ENGINE_CONFIG.defaults.viewingDurationMinutes
          : property.durationMinutes;
      const hasValidDuration = isNonNegativeInteger(
        effectiveDurationMinutes,
      );

      if (!hasValidDuration) {
        issues.push(
          propertyIssue(
            "invalid_property_duration",
            propertyIndex,
            property.id,
          ),
        );
      }

      if (!isPropertyImportance(property.importance)) {
        issues.push(
          propertyIssue(
            "invalid_property_importance",
            propertyIndex,
            property.id,
          ),
        );
      }

      if (!isPropertyStatus(property.status)) {
        issues.push(
          propertyIssue(
            "invalid_property_status",
            propertyIndex,
            property.id,
          ),
        );
      }

      if (!hasViewingTimeShape(property.viewingTime)) {
        issues.push(
          propertyIssue(
            "invalid_viewing_time",
            propertyIndex,
            property.id,
          ),
        );
        return;
      }

      if (
        !hasValidSettingsDate ||
        !hasOrderedDayWindow ||
        !hasValidDuration
      ) {
        return;
      }

      try {
        const normalizationResult = normalizeViewingTimeForDay({
          viewingTime: property.viewingTime,
          targetDate: settings.date,
          dayEarliestStart: settings.earliestStart,
          dayLatestEnd: settings.latestEnd,
          durationMinutes: effectiveDurationMinutes,
        });

        if (normalizationResult.status === "not_eligible") {
          issues.push(
            propertyIssue(
              "property_date_mismatch",
              propertyIndex,
              property.id,
            ),
          );
        }
      } catch (error: unknown) {
        if (!(error instanceof RangeError)) {
          throw error;
        }

        issues.push(
          propertyIssue(
            "invalid_viewing_time",
            propertyIndex,
            property.id,
          ),
        );
      }
    });
  }

  const [firstIssue, ...remainingIssues] = issues;

  if (firstIssue === undefined) {
    return { valid: true, issues: [] };
  }

  return {
    valid: false,
    issues: [firstIssue, ...remainingIssues],
  };
}
