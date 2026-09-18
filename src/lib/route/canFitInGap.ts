import type { TimeAnchor } from "./deriveAnchors";
import { addMinutesWithinDay } from "./time";
import type {
  DurationMinutes,
  MinuteOfDay,
  NormalizedProperty,
} from "./types";

export interface CanFitInGapInput {
  readonly currentEnd: MinuteOfDay;
  readonly travelToCandidateMinutes: DurationMinutes;
  readonly candidateEarliestStart: MinuteOfDay;
  readonly candidateLatestStart: MinuteOfDay;
  readonly candidateViewingDurationMinutes: DurationMinutes;
  readonly travelToNextAnchorMinutes: DurationMinutes;
  readonly safetyBufferMinutes: DurationMinutes;
  readonly nextAnchorLatestTime: MinuteOfDay;
}

export function canFitInGap(input: CanFitInGapInput): boolean {
  const arrivalAtCandidate = addMinutesWithinDay(
    input.currentEnd,
    input.travelToCandidateMinutes,
  );

  if (arrivalAtCandidate === null) {
    return false;
  }

  const candidateViewingStart = Math.max(
    arrivalAtCandidate,
    input.candidateEarliestStart,
  );

  if (candidateViewingStart > input.candidateLatestStart) {
    return false;
  }

  const candidateViewingEnd = addMinutesWithinDay(
    candidateViewingStart,
    input.candidateViewingDurationMinutes,
  );

  if (candidateViewingEnd === null) {
    return false;
  }

  const arrivalAtNextBoundary = addMinutesWithinDay(
    candidateViewingEnd,
    input.travelToNextAnchorMinutes,
  );

  if (arrivalAtNextBoundary === null) {
    return false;
  }

  const bufferedArrivalAtNextBoundary = addMinutesWithinDay(
    arrivalAtNextBoundary,
    input.safetyBufferMinutes,
  );

  if (bufferedArrivalAtNextBoundary === null) {
    return false;
  }

  return bufferedArrivalAtNextBoundary <= input.nextAnchorLatestTime;
}

export interface IsGapInsertablePropertyInput {
  readonly property: NormalizedProperty;
  readonly anchors: readonly TimeAnchor[];
}

export function isGapInsertableProperty(
  input: IsGapInsertablePropertyInput,
): boolean {
  const { property, anchors } = input;

  switch (property.viewingTime.type) {
    case "flexible":
      return true;
    case "window":
      return !anchors.some((anchor) => anchor.propertyId === property.id);
    case "fixed":
    case "unconfirmed":
      return false;
  }
}
