import {
  addMinutesWithinDay,
  clockTimeToMinuteOfDay,
  isValidCalendarDate,
  isValidMinuteOfDay,
} from "./time";
import type {
  CalendarDate,
  DurationMinutes,
  FinishBeforeViewingTimeInput,
  FixedViewingTimeInput,
  MinuteOfDay,
  NormalizedViewingTime,
  StartWindowViewingTimeInput,
  UnconfirmedViewingTimeInput,
  ViewingTimeInput,
} from "./types";

type ConcreteNormalizedViewingTime = Exclude<
  NormalizedViewingTime,
  Readonly<{ type: "unconfirmed"; window: null }>
>;

type UnconfirmedNormalizedViewingTime = Extract<
  NormalizedViewingTime,
  Readonly<{ type: "unconfirmed"; window: null }>
>;

export interface NormalizeViewingTimeForDayInput {
  readonly viewingTime: ViewingTimeInput;
  readonly targetDate: CalendarDate;
  readonly dayEarliestStart: MinuteOfDay;
  readonly dayLatestEnd: MinuteOfDay;
  readonly durationMinutes: DurationMinutes;
}

export type NormalizeViewingTimeForDayResult =
  | Readonly<{
      status: "normalized";
      normalizedViewingTime: ConcreteNormalizedViewingTime;
    }>
  | Readonly<{
      status: "unconfirmed";
      normalizedViewingTime: UnconfirmedNormalizedViewingTime;
    }>
  | Readonly<{
      status: "not_eligible";
    }>;

function validateNormalizationContext(
  input: NormalizeViewingTimeForDayInput,
): void {
  if (!isValidCalendarDate(input.targetDate)) {
    throw new RangeError("Invalid target CalendarDate");
  }

  if (
    !isValidMinuteOfDay(input.dayEarliestStart) ||
    !isValidMinuteOfDay(input.dayLatestEnd) ||
    input.dayEarliestStart > input.dayLatestEnd
  ) {
    throw new RangeError("Invalid day planning window");
  }

  if (
    !Number.isFinite(input.durationMinutes) ||
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 0
  ) {
    throw new RangeError("Invalid viewing duration");
  }
}

function sourceDateMatchesTarget(
  sourceDate: CalendarDate,
  targetDate: CalendarDate,
): boolean {
  if (!isValidCalendarDate(sourceDate)) {
    throw new RangeError("Invalid viewing-time CalendarDate");
  }

  return sourceDate === targetDate;
}

function normalizeFixedViewingTime(
  viewingTime: FixedViewingTimeInput,
  targetDate: CalendarDate,
): NormalizeViewingTimeForDayResult {
  const dateMatches = sourceDateMatchesTarget(viewingTime.date, targetDate);
  const start = clockTimeToMinuteOfDay(viewingTime.startTime);

  if (!dateMatches) {
    return { status: "not_eligible" };
  }

  return {
    status: "normalized",
    normalizedViewingTime: {
      type: "fixed",
      window: {
        earliestStart: start,
        latestStart: start,
      },
    },
  };
}

function normalizeStartWindow(
  viewingTime: StartWindowViewingTimeInput,
  targetDate: CalendarDate,
): NormalizeViewingTimeForDayResult {
  const dateMatches = sourceDateMatchesTarget(viewingTime.date, targetDate);
  const earliestStart = clockTimeToMinuteOfDay(viewingTime.earliestStart);
  const latestStart = clockTimeToMinuteOfDay(viewingTime.latestStart);

  if (earliestStart > latestStart) {
    throw new RangeError("Invalid start_between window");
  }

  if (!dateMatches) {
    return { status: "not_eligible" };
  }

  return {
    status: "normalized",
    normalizedViewingTime: {
      type: "window",
      sourceConstraint: "start_between",
      window: {
        earliestStart,
        latestStart,
      },
    },
  };
}

function normalizeFinishBeforeWindow(
  viewingTime: FinishBeforeViewingTimeInput,
  input: NormalizeViewingTimeForDayInput,
): NormalizeViewingTimeForDayResult {
  const dateMatches = sourceDateMatchesTarget(
    viewingTime.date,
    input.targetDate,
  );
  const finishBy = clockTimeToMinuteOfDay(viewingTime.finishBy);
  const explicitEarliestStart =
    viewingTime.earliestStart === undefined
      ? undefined
      : clockTimeToMinuteOfDay(viewingTime.earliestStart);
  const latestStart = addMinutesWithinDay(
    finishBy,
    -input.durationMinutes,
  );

  if (latestStart === null) {
    throw new RangeError("finish_before duration crosses midnight");
  }

  if (
    explicitEarliestStart !== undefined &&
    explicitEarliestStart > latestStart
  ) {
    throw new RangeError("Invalid finish_before window");
  }

  if (!dateMatches) {
    return { status: "not_eligible" };
  }

  const earliestStart = explicitEarliestStart ?? input.dayEarliestStart;

  if (earliestStart > latestStart) {
    throw new RangeError("Invalid finish_before window");
  }

  return {
    status: "normalized",
    normalizedViewingTime: {
      type: "window",
      sourceConstraint: "finish_before",
      window: {
        earliestStart,
        latestStart,
      },
    },
  };
}

function normalizeUnconfirmedViewingTime(
  viewingTime: UnconfirmedViewingTimeInput,
  targetDate: CalendarDate,
): NormalizeViewingTimeForDayResult {
  if (
    viewingTime.date !== undefined &&
    !sourceDateMatchesTarget(viewingTime.date, targetDate)
  ) {
    return { status: "not_eligible" };
  }

  return {
    status: "unconfirmed",
    normalizedViewingTime: {
      type: "unconfirmed",
      window: null,
    },
  };
}

export function normalizeViewingTimeForDay(
  input: NormalizeViewingTimeForDayInput,
): NormalizeViewingTimeForDayResult {
  validateNormalizationContext(input);

  const { viewingTime } = input;

  switch (viewingTime.type) {
    case "fixed":
      return normalizeFixedViewingTime(viewingTime, input.targetDate);
    case "window":
      return viewingTime.constraint === "start_between"
        ? normalizeStartWindow(viewingTime, input.targetDate)
        : normalizeFinishBeforeWindow(viewingTime, input);
    case "flexible":
      return {
        status: "normalized",
        normalizedViewingTime: {
          type: "flexible",
          window: {
            earliestStart: input.dayEarliestStart,
            latestStart: input.dayLatestEnd,
          },
        },
      };
    case "unconfirmed":
      return normalizeUnconfirmedViewingTime(viewingTime, input.targetDate);
  }
}
