import { ROUTE_ENGINE_CONFIG } from "./config";
import type {
  DayPlanSettings,
  LocationId,
  MinuteOfDay,
  NormalizedProperty,
  PropertyId,
} from "./types";

export type TimeAnchorKind = "fixed" | "narrow_window";

export interface TimeAnchor {
  readonly propertyId: PropertyId;
  readonly locationId: LocationId;
  readonly kind: TimeAnchorKind;
  readonly earliestStart: MinuteOfDay;
  readonly latestStart: MinuteOfDay;
  readonly requiredBufferMinutes: number;
}

export interface DeriveAnchorsInput {
  readonly settings: DayPlanSettings;
  readonly properties: readonly NormalizedProperty[];
}

interface IndexedTimeAnchor {
  readonly inputIndex: number;
  readonly anchor: TimeAnchor;
}

export function deriveAnchors(
  input: DeriveAnchorsInput,
): readonly TimeAnchor[] {
  const anchors: IndexedTimeAnchor[] = [];
  const threshold =
    ROUTE_ENGINE_CONFIG.anchors.narrowWindowAnchorMaximumWidthMinutes;

  for (let inputIndex = 0; inputIndex < input.properties.length; inputIndex += 1) {
    const property = input.properties[inputIndex];

    if (property.viewingTime.type === "fixed") {
      anchors.push({
        inputIndex,
        anchor: Object.freeze({
          propertyId: property.id,
          locationId: property.locationId,
          kind: "fixed",
          earliestStart: property.viewingTime.window.earliestStart,
          latestStart: property.viewingTime.window.latestStart,
          requiredBufferMinutes:
            input.settings.fixedAppointmentBufferMinutes,
        }),
      });
      continue;
    }

    if (property.viewingTime.type === "window") {
      const { earliestStart, latestStart } = property.viewingTime.window;

      if (latestStart - earliestStart <= threshold) {
        anchors.push({
          inputIndex,
          anchor: Object.freeze({
            propertyId: property.id,
            locationId: property.locationId,
            kind: "narrow_window",
            earliestStart,
            latestStart,
            requiredBufferMinutes: 0,
          }),
        });
      }
    }
  }

  anchors.sort(
    (left, right) =>
      left.anchor.earliestStart - right.anchor.earliestStart ||
      left.anchor.latestStart - right.anchor.latestStart ||
      left.inputIndex - right.inputIndex,
  );

  return Object.freeze(anchors.map(({ anchor }) => anchor));
}
