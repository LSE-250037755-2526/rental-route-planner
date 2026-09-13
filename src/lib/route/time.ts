import type { CalendarDate, ClockTime, MinuteOfDay } from "./types";

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MAX_MINUTE_OF_DAY = MINUTES_PER_DAY - 1;

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function daysInMonth(year: number, month: number): number {
  const monthLengths = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return monthLengths[month - 1] ?? 0;
}

export function isValidCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE_PATTERN.exec(value);

  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function isValidClockTime(value: string): boolean {
  const match = CLOCK_TIME_PATTERN.exec(value);

  if (match === null) {
    return false;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function isValidMinuteOfDay(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_MINUTE_OF_DAY;
}

export function clockTimeToMinuteOfDay(value: string): MinuteOfDay {
  if (!isValidClockTime(value)) {
    throw new RangeError("Invalid ClockTime");
  }

  const hour = Number(value.slice(0, 2));
  const minute = Number(value.slice(3, 5));

  return hour * MINUTES_PER_HOUR + minute;
}

export function minuteOfDayToClockTime(value: number): ClockTime {
  if (!isValidMinuteOfDay(value)) {
    throw new RangeError("Invalid MinuteOfDay");
  }

  const hour = Math.floor(value / MINUTES_PER_HOUR);
  const minute = value % MINUTES_PER_HOUR;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function addMinutesWithinDay(
  start: number,
  deltaMinutes: number,
): MinuteOfDay | null {
  if (!isValidMinuteOfDay(start)) {
    throw new RangeError("Invalid start MinuteOfDay");
  }

  if (!Number.isFinite(deltaMinutes) || !Number.isInteger(deltaMinutes)) {
    throw new RangeError("Invalid minute delta");
  }

  const result = start + deltaMinutes;

  return isValidMinuteOfDay(result) ? result : null;
}

export function compareCalendarDates(a: string, b: string): -1 | 0 | 1 {
  if (!isValidCalendarDate(a) || !isValidCalendarDate(b)) {
    throw new RangeError("Invalid CalendarDate");
  }

  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
}

export function sortCalendarDates(
  dates: readonly string[],
): CalendarDate[] {
  for (const date of dates) {
    if (!isValidCalendarDate(date)) {
      throw new RangeError("Invalid CalendarDate");
    }
  }

  return [...dates].sort(compareCalendarDates);
}
