import { describe, expect, it } from "vitest";

import {
  isModeAllowed,
  type IsModeAllowedInput,
} from "../../src/lib/route/isModeAllowed";
import type {
  TransportMode,
  TransportStrategy,
} from "../../src/lib/route/types";
import type { TravelModeDataStatus } from "../../src/lib/travel/types";

type LegalityCase = readonly [
  TransportStrategy,
  TransportMode,
  TravelModeDataStatus,
  boolean,
];

const LEGALITY_CASES: readonly LegalityCase[] = [
  ["transit_only", "transit", "available", true],
  ["transit_only", "transit", "degraded", true],
  ["transit_only", "transit", "unavailable", false],
  ["transit_only", "taxi", "available", false],
  ["transit_only", "taxi", "degraded", false],
  ["transit_only", "taxi", "unavailable", false],
  ["transit_first", "transit", "available", true],
  ["transit_first", "transit", "degraded", true],
  ["transit_first", "transit", "unavailable", false],
  ["transit_first", "taxi", "available", true],
  ["transit_first", "taxi", "degraded", true],
  ["transit_first", "taxi", "unavailable", false],
  ["efficiency_first", "transit", "available", true],
  ["efficiency_first", "transit", "degraded", true],
  ["efficiency_first", "transit", "unavailable", false],
  ["efficiency_first", "taxi", "available", true],
  ["efficiency_first", "taxi", "degraded", true],
  ["efficiency_first", "taxi", "unavailable", false],
];

describe("isModeAllowed strategy and availability matrix", () => {
  it.each(LEGALITY_CASES)(
    "%s + %s + %s returns %s",
    (transportStrategy, transportMode, dataStatus, expected) => {
      const input: IsModeAllowedInput = Object.freeze({
        transportStrategy,
        transportMode,
        dataStatus,
      });
      const snapshot = { ...input };

      expect(isModeAllowed(input)).toBe(expected);
      expect(input).toEqual(snapshot);
    },
  );
});
