import { ROUTE_ENGINE_CONFIG } from "./config";
import type {
  DurationMinutes,
  LegRisk,
  LocationId,
  NormalizedProperty,
  RiskCode,
  RiskLevel,
  RouteRisk,
  SimulationResult,
} from "./types";
import type { TravelMatrix } from "../travel/types";

export type CalculateTransitLegRiskInput =
  | Readonly<{
      transportMode: "transit";
      fromLocationId: LocationId;
      toLocationId: LocationId;
      transferCount: number;
      walkMeters: number;
      bufferMinutes: DurationMinutes | null;
    }>
  | Readonly<{
      transportMode: "taxi";
      fromLocationId: LocationId;
      toLocationId: LocationId;
    }>;

export interface CalculateRouteRiskInput {
  readonly orderedProperties: readonly NormalizedProperty[];
  readonly simulation: SimulationResult;
  readonly travelMatrix: TravelMatrix;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
}

function assertNonNegativeFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
}

function riskLevelForScore(score: number): RiskLevel {
  const config = ROUTE_ENGINE_CONFIG.transitRisk;

  assertNonNegativeInteger(score, "Risk score");

  if (score <= config.lowRiskMaximumScore) {
    return "low";
  }

  if (score === config.mediumRiskScore) {
    return "medium";
  }

  if (score >= config.highRiskMinimumScore) {
    return "high";
  }

  throw new RangeError(
    `Risk score ${score} does not match a configured risk level`,
  );
}

export function calculateTransitLegRisk(
  input: CalculateTransitLegRiskInput,
): LegRisk {
  if (input.transportMode === "taxi") {
    return Object.freeze({
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      transportMode: input.transportMode,
      score: 0,
      level: riskLevelForScore(0),
      codes: Object.freeze([]),
    });
  }

  assertNonNegativeInteger(input.transferCount, "transferCount");
  assertNonNegativeFiniteNumber(input.walkMeters, "walkMeters");

  if (input.bufferMinutes !== null) {
    assertNonNegativeInteger(input.bufferMinutes, "bufferMinutes");
  }

  const config = ROUTE_ENGINE_CONFIG.transitRisk;
  const codes: RiskCode[] = [];
  let score = 0;

  if (input.transferCount >= config.transferCountThreshold) {
    score += config.transferRiskPoints;
    codes.push("multiple_transfers");
  }

  if (input.walkMeters >= config.walkingDistanceThresholdMeters) {
    score += config.walkingRiskPoints;
    codes.push("long_walk");
  }

  if (input.bufferMinutes !== null) {
    if (input.bufferMinutes < config.highRiskBufferThresholdMinutes) {
      score += config.highRiskBufferPoints;
      codes.push("low_buffer", "late_risk");
    } else if (input.bufferMinutes < config.bufferWarningThresholdMinutes) {
      score += config.bufferWarningRiskPoints;
      codes.push("low_buffer");
    }
  }

  return Object.freeze({
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
    transportMode: input.transportMode,
    score,
    level: riskLevelForScore(score),
    codes: Object.freeze(codes),
  });
}

export function calculateRouteRisk(
  input: CalculateRouteRiskInput,
): RouteRisk {
  if (input.simulation.stops.length !== input.orderedProperties.length) {
    throw new RangeError(
      "Simulation stop count must equal orderedProperties length",
    );
  }

  const legs: LegRisk[] = [];
  let score = 0;

  input.orderedProperties.forEach((property, index) => {
    const stop = input.simulation.stops[index];

    if (stop.propertyId !== property.id) {
      throw new RangeError(`Simulation property order mismatch at index ${index}`);
    }

    let legRisk: LegRisk;

    if (stop.travelMode === "taxi") {
      legRisk = calculateTransitLegRisk({
        transportMode: "taxi",
        fromLocationId: stop.travelFromLocationId,
        toLocationId: property.locationId,
      });
    } else {
      const edge =
        input.travelMatrix.edgesByFrom[stop.travelFromLocationId]?.[
          property.locationId
        ];

      if (edge === undefined) {
        throw new RangeError(
          `Missing directed travel edge from ${stop.travelFromLocationId} to ${property.locationId}`,
        );
      }

      if (edge.transit.status === "unavailable") {
        throw new RangeError(
          `Transit data is unavailable from ${stop.travelFromLocationId} to ${property.locationId}`,
        );
      }

      legRisk = calculateTransitLegRisk({
        transportMode: "transit",
        fromLocationId: stop.travelFromLocationId,
        toLocationId: property.locationId,
        transferCount: edge.transit.transferCount,
        walkMeters: edge.transit.walkMeters,
        bufferMinutes: stop.bufferMinutes,
      });
    }

    legs.push(legRisk);
    score += legRisk.score;
  });

  return Object.freeze({
    score,
    level: riskLevelForScore(score),
    legs: Object.freeze(legs),
  });
}
