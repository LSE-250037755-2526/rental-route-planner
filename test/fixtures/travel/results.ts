import type { TravelProviderResult } from "../../../src/lib/travel/TravelTimeProvider";
import type {
  TaxiTravelAlternative,
  TransitTravelAlternative,
} from "../../../src/lib/travel/types";

function copyFrozenTransitAlternative(
  alternative: TransitTravelAlternative,
): TransitTravelAlternative {
  if (alternative.status === "unavailable") {
    return Object.freeze({ status: "unavailable" });
  }

  return Object.freeze({
    status: alternative.status,
    durationMinutes: alternative.durationMinutes,
    cost: alternative.cost,
    transferCount: alternative.transferCount,
    walkMeters: alternative.walkMeters,
  });
}

function copyFrozenTaxiAlternative(
  alternative: TaxiTravelAlternative,
): TaxiTravelAlternative {
  if (alternative.status === "unavailable") {
    return Object.freeze({ status: "unavailable" });
  }

  return Object.freeze({
    status: alternative.status,
    durationMinutes: alternative.durationMinutes,
    cost: alternative.cost,
  });
}

export function createFrozenTravelResult(
  result: TravelProviderResult,
): TravelProviderResult {
  return Object.freeze({
    transit: copyFrozenTransitAlternative(result.transit),
    taxi: copyFrozenTaxiAlternative(result.taxi),
  });
}

export const TRAVEL_RESULT_COMPLETE_SHORT = createFrozenTravelResult({
  transit: {
    status: "available",
    durationMinutes: 18,
    cost: 3,
    transferCount: 0,
    walkMeters: 220,
  },
  taxi: {
    status: "available",
    durationMinutes: 8,
    cost: 18,
  },
});

export const TRAVEL_RESULT_COMPLETE_MEDIUM = createFrozenTravelResult({
  transit: {
    status: "available",
    durationMinutes: 32,
    cost: 4,
    transferCount: 1,
    walkMeters: 420,
  },
  taxi: {
    status: "available",
    durationMinutes: 15,
    cost: 28,
  },
});

export const TRAVEL_RESULT_TRANSIT_RISKY = createFrozenTravelResult({
  transit: {
    status: "available",
    durationMinutes: 28,
    cost: 4,
    transferCount: 2,
    walkMeters: 900,
  },
  taxi: {
    status: "available",
    durationMinutes: 14,
    cost: 30,
  },
});

export const TRAVEL_RESULT_TRANSIT_DETOUR = createFrozenTravelResult({
  transit: {
    status: "available",
    durationMinutes: 55,
    cost: 4,
    transferCount: 2,
    walkMeters: 650,
  },
  taxi: {
    status: "available",
    durationMinutes: 18,
    cost: 32,
  },
});

export const TRAVEL_RESULT_TRANSIT_ONLY = createFrozenTravelResult({
  transit: {
    status: "available",
    durationMinutes: 24,
    cost: 3,
    transferCount: 1,
    walkMeters: 350,
  },
  taxi: {
    status: "unavailable",
  },
});

export const TRAVEL_RESULT_TAXI_ONLY = createFrozenTravelResult({
  transit: {
    status: "unavailable",
  },
  taxi: {
    status: "available",
    durationMinutes: 12,
    cost: 26,
  },
});

export const TRAVEL_RESULT_BOTH_UNAVAILABLE = createFrozenTravelResult({
  transit: {
    status: "unavailable",
  },
  taxi: {
    status: "unavailable",
  },
});

export const TRAVEL_RESULT_TRANSIT_DEGRADED = createFrozenTravelResult({
  transit: {
    status: "degraded",
    durationMinutes: 31,
    cost: 5.5,
    transferCount: 2,
    walkMeters: 920,
  },
  taxi: {
    status: "available",
    durationMinutes: 14,
    cost: 28,
  },
});

export const TRAVEL_RESULT_TAXI_DEGRADED = createFrozenTravelResult({
  transit: {
    status: "available",
    durationMinutes: 26,
    cost: 4,
    transferCount: 1,
    walkMeters: 300,
  },
  taxi: {
    status: "degraded",
    durationMinutes: 13,
    cost: 24,
  },
});

export const TRAVEL_RESULT_TRANSIT_DIRECT = createFrozenTravelResult({
  transit: {
    status: "available",
    durationMinutes: 31,
    cost: 4,
    transferCount: 0,
    walkMeters: 250,
  },
  taxi: {
    status: "available",
    durationMinutes: 15,
    cost: 28,
  },
});

export const TRAVEL_RESULT_TRANSIT_60_TAXI_24 =
  createFrozenTravelResult({
    transit: {
      status: "available",
      durationMinutes: 60,
      cost: 5,
      transferCount: 1,
      walkMeters: 500,
    },
    taxi: {
      status: "available",
      durationMinutes: 24,
      cost: 35,
    },
  });

export const TRAVEL_RESULT_TRANSIT_10_TAXI_7 = createFrozenTravelResult({
  transit: {
    status: "available",
    durationMinutes: 10,
    cost: 3,
    transferCount: 0,
    walkMeters: 180,
  },
  taxi: {
    status: "available",
    durationMinutes: 7,
    cost: 16,
  },
});
