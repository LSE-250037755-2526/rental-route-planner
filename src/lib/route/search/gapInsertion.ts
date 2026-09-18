import {
  canFitInGap,
  isGapInsertableProperty,
} from "../canFitInGap";
import type { TimeAnchor } from "../deriveAnchors";
import type {
  DurationMinutes,
  LocationId,
  MinuteOfDay,
  NormalizedProperty,
} from "../types";
import type { DailyPropertyOrder } from "./types";

export type GapInsertionBoundary =
  | Readonly<{
      kind: "anchor";
      anchor: TimeAnchor;
    }>
  | Readonly<{
      kind: "day_end";
      latestEnd: MinuteOfDay;
    }>;

export interface GapInsertionPoint {
  readonly insertionIndex: number;
  readonly fromLocationId: LocationId;
  readonly currentEnd: MinuteOfDay;
  readonly boundary: GapInsertionBoundary;
}

export type ResolveTravelLowerBoundMinutes = (
  fromLocationId: LocationId,
  toLocationId: LocationId,
) => DurationMinutes | null;

export interface GenerateGapInsertionCandidatesInput {
  readonly baseOrder: DailyPropertyOrder;
  readonly candidateProperties: readonly NormalizedProperty[];
  readonly anchors: readonly TimeAnchor[];
  readonly gaps: readonly GapInsertionPoint[];
  readonly resolveTravelLowerBoundMinutes: ResolveTravelLowerBoundMinutes;
}

function validateInsertionIndex(
  insertionIndex: number,
  baseOrderLength: number,
): void {
  if (
    !Number.isInteger(insertionIndex) ||
    insertionIndex < 0 ||
    insertionIndex > baseOrderLength
  ) {
    throw new RangeError(
      "Gap insertionIndex must be an integer within the base order",
    );
  }
}

export function generateGapInsertionCandidates(
  input: GenerateGapInsertionCandidatesInput,
): readonly DailyPropertyOrder[] {
  for (const gap of input.gaps) {
    validateInsertionIndex(gap.insertionIndex, input.baseOrder.length);
  }

  const basePropertyIds = new Set(input.baseOrder);
  const candidates: DailyPropertyOrder[] = [];
  const seenFingerprints = new Set<string>();

  for (const gap of input.gaps) {
    for (const candidate of input.candidateProperties) {
      if (basePropertyIds.has(candidate.id)) {
        continue;
      }

      if (
        !isGapInsertableProperty({
          property: candidate,
          anchors: input.anchors,
        })
      ) {
        continue;
      }

      const candidateWindow = candidate.viewingTime.window;

      if (candidateWindow === null) {
        continue;
      }

      const travelToCandidateMinutes =
        input.resolveTravelLowerBoundMinutes(
          gap.fromLocationId,
          candidate.locationId,
        );

      if (travelToCandidateMinutes === null) {
        continue;
      }

      let travelToNextAnchorMinutes: DurationMinutes;
      let safetyBufferMinutes: DurationMinutes;
      let nextAnchorLatestTime: MinuteOfDay;

      if (gap.boundary.kind === "anchor") {
        const onwardTravelMinutes = input.resolveTravelLowerBoundMinutes(
          candidate.locationId,
          gap.boundary.anchor.locationId,
        );

        if (onwardTravelMinutes === null) {
          continue;
        }

        travelToNextAnchorMinutes = onwardTravelMinutes;
        safetyBufferMinutes = gap.boundary.anchor.requiredBufferMinutes;
        nextAnchorLatestTime = gap.boundary.anchor.latestStart;
      } else {
        travelToNextAnchorMinutes = 0;
        safetyBufferMinutes = 0;
        nextAnchorLatestTime = gap.boundary.latestEnd;
      }

      if (
        !canFitInGap({
          currentEnd: gap.currentEnd,
          travelToCandidateMinutes,
          candidateEarliestStart: candidateWindow.earliestStart,
          candidateLatestStart: candidateWindow.latestStart,
          candidateViewingDurationMinutes: candidate.durationMinutes,
          travelToNextAnchorMinutes,
          safetyBufferMinutes,
          nextAnchorLatestTime,
        })
      ) {
        continue;
      }

      const order: DailyPropertyOrder = Object.freeze([
        ...input.baseOrder.slice(0, gap.insertionIndex),
        candidate.id,
        ...input.baseOrder.slice(gap.insertionIndex),
      ]);
      const fingerprint = JSON.stringify(order);

      if (!seenFingerprints.has(fingerprint)) {
        seenFingerprints.add(fingerprint);
        candidates.push(order);
      }
    }
  }

  return Object.freeze(candidates);
}
