import { describe, expect, it } from "vitest";

import {
  addMinutesWithinDay,
  clockTimeToMinuteOfDay,
  compareCalendarDates,
  isValidCalendarDate,
  isValidClockTime,
  isValidMinuteOfDay,
  minuteOfDayToClockTime,
  sortCalendarDates,
} from "../../src/lib/route/time";

describe("isValidCalendarDate", () => {
  it("accepts strict valid Gregorian dates", () => {
    const validDates = [
      "2026-01-01",
      "2026-09-20",
      "2026-12-31",
      "2024-02-29",
      "2000-02-29",
    ];

    for (const date of validDates) {
      expect(isValidCalendarDate(date)).toBe(true);
    }
  });

  it("rejects malformed and impossible Gregorian dates", () => {
    const invalidDates = [
      "2026-1-01",
      "2026-01-1",
      "26-01-01",
      "2026/01/01",
      "2026-00-01",
      "2026-13-01",
      "2026-01-00",
      "2026-01-32",
      "2026-04-31",
      "2026-02-29",
      "1900-02-29",
      " 2026-09-20",
      "2026-09-20 ",
      "2026-09-20T10:00",
    ];

    for (const date of invalidDates) {
      expect(isValidCalendarDate(date)).toBe(false);
    }
  });
});

describe("isValidClockTime", () => {
  it("accepts strict valid 24-hour clock values", () => {
    const validTimes = ["00:00", "00:01", "09:05", "12:30", "23:59"];

    for (const time of validTimes) {
      expect(isValidClockTime(time)).toBe(true);
    }
  });

  it("rejects malformed and out-of-range clock values", () => {
    const invalidTimes = [
      "0:00",
      "9:05",
      "09:5",
      "24:00",
      "24:01",
      "23:60",
      "12:99",
      "-1:00",
      " 09:00",
      "09:00 ",
      "09:00:00",
    ];

    for (const time of invalidTimes) {
      expect(isValidClockTime(time)).toBe(false);
    }
  });
});

describe("isValidMinuteOfDay", () => {
  it("accepts integers from 0 through 1439", () => {
    for (const minute of [0, 1, 540, 1439]) {
      expect(isValidMinuteOfDay(minute)).toBe(true);
    }
  });

  it("rejects values outside the same-day integer range", () => {
    for (const minute of [-1, 1440, 1441, 1.5, NaN, Infinity, -Infinity]) {
      expect(isValidMinuteOfDay(minute)).toBe(false);
    }
  });
});

describe("ClockTime and MinuteOfDay conversion", () => {
  it("converts strict clock values to exact minutes", () => {
    expect(clockTimeToMinuteOfDay("00:00")).toBe(0);
    expect(clockTimeToMinuteOfDay("00:01")).toBe(1);
    expect(clockTimeToMinuteOfDay("09:00")).toBe(540);
    expect(clockTimeToMinuteOfDay("16:30")).toBe(990);
    expect(clockTimeToMinuteOfDay("17:00")).toBe(1020);
    expect(clockTimeToMinuteOfDay("23:59")).toBe(1439);
  });

  it("rejects invalid clock values during conversion", () => {
    expect(() => clockTimeToMinuteOfDay("24:00")).toThrow(RangeError);
    expect(() => clockTimeToMinuteOfDay("9:00")).toThrow(RangeError);
  });

  it("converts valid minutes to zero-padded clock values", () => {
    expect(minuteOfDayToClockTime(0)).toBe("00:00");
    expect(minuteOfDayToClockTime(1)).toBe("00:01");
    expect(minuteOfDayToClockTime(5)).toBe("00:05");
    expect(minuteOfDayToClockTime(540)).toBe("09:00");
    expect(minuteOfDayToClockTime(990)).toBe("16:30");
    expect(minuteOfDayToClockTime(1020)).toBe("17:00");
    expect(minuteOfDayToClockTime(1439)).toBe("23:59");
  });

  it("rejects invalid minutes during conversion", () => {
    for (const minute of [-1, 1440, 1.5, NaN, Infinity, -Infinity]) {
      expect(() => minuteOfDayToClockTime(minute)).toThrow(RangeError);
    }
  });

  it("round-trips every valid minute exactly", () => {
    for (let minute = 0; minute <= 1439; minute += 1) {
      expect(clockTimeToMinuteOfDay(minuteOfDayToClockTime(minute))).toBe(
        minute,
      );
    }
  });
});

describe("addMinutesWithinDay", () => {
  it("performs exact positive and negative same-day arithmetic", () => {
    expect(addMinutesWithinDay(540, 30)).toBe(570);
    expect(addMinutesWithinDay(1020, -30)).toBe(990);
    expect(addMinutesWithinDay(1430, 9)).toBe(1439);
    expect(addMinutesWithinDay(5, -5)).toBe(0);
  });

  it("returns null instead of wrapping or clamping across midnight", () => {
    expect(addMinutesWithinDay(1430, 10)).toBeNull();
    expect(addMinutesWithinDay(5, -6)).toBeNull();

    const result = addMinutesWithinDay(1430, 20);
    expect(result).toBeNull();
    expect(result).not.toBe(10);
  });

  it("throws RangeError for invalid inputs", () => {
    for (const start of [-1, 1440, 1.5, NaN, Infinity, -Infinity]) {
      expect(() => addMinutesWithinDay(start, 1)).toThrow(RangeError);
    }

    for (const delta of [1.5, NaN, Infinity, -Infinity]) {
      expect(() => addMinutesWithinDay(0, delta)).toThrow(RangeError);
    }
  });
});

describe("compareCalendarDates", () => {
  it("compares valid dates chronologically", () => {
    expect(compareCalendarDates("2026-09-20", "2026-09-21")).toBe(-1);
    expect(compareCalendarDates("2026-09-21", "2026-09-20")).toBe(1);
    expect(compareCalendarDates("2026-09-20", "2026-09-20")).toBe(0);
    expect(compareCalendarDates("2026-09-30", "2026-10-01")).toBe(-1);
    expect(compareCalendarDates("2026-12-31", "2027-01-01")).toBe(-1);
  });

  it("throws RangeError when either date is invalid", () => {
    expect(() =>
      compareCalendarDates("2026-02-29", "2026-09-20"),
    ).toThrow(RangeError);
    expect(() =>
      compareCalendarDates("2026-09-20", "2026-09-20T10:00"),
    ).toThrow(RangeError);
  });
});

describe("sortCalendarDates", () => {
  it("sorts non-consecutive dates without mutation or deduplication", () => {
    const dates = Object.freeze([
      "2026-09-22",
      "2026-09-20",
      "2026-09-25",
      "2026-09-21",
      "2026-09-20",
    ]);

    expect(sortCalendarDates(dates)).toEqual([
      "2026-09-20",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-25",
    ]);
    expect(dates).toEqual([
      "2026-09-22",
      "2026-09-20",
      "2026-09-25",
      "2026-09-21",
      "2026-09-20",
    ]);
  });

  it("throws RangeError when any member is invalid", () => {
    expect(() =>
      sortCalendarDates(["2026-09-20", "2026-02-29"]),
    ).toThrow(RangeError);
  });
});
