import type { LocationId } from "../route/types";
import type {
  TravelProviderResult,
  TravelTimeProvider,
  TravelTimeRequest,
} from "./TravelTimeProvider";
import type {
  TaxiTravelAlternative,
  TransitTravelAlternative,
  TravelEdge,
  TravelEdgeDataStatus,
  TravelMatrix,
  TravelMatrixRow,
} from "./types";

export interface BuildTravelMatrixInput {
  readonly originLocationId: LocationId;
  readonly propertyLocationIds: readonly LocationId[];
  readonly provider: TravelTimeProvider;
}

type MutableEdgesByFrom = Record<
  LocationId,
  Record<LocationId, TravelEdge>
>;

const PROVIDER_FAILURE = Object.freeze({
  kind: "provider_failure" as const,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && /\S/u.test(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeFiniteNumber(value) && Number.isInteger(value);
}

function isTransitTravelAlternative(
  value: unknown,
): value is TransitTravelAlternative {
  if (!isRecord(value)) {
    return false;
  }

  if (value.status === "unavailable") {
    return true;
  }

  return (
    (value.status === "available" || value.status === "degraded") &&
    isNonNegativeInteger(value.durationMinutes) &&
    isNonNegativeFiniteNumber(value.cost) &&
    isNonNegativeInteger(value.transferCount) &&
    isNonNegativeFiniteNumber(value.walkMeters)
  );
}

function isTaxiTravelAlternative(
  value: unknown,
): value is TaxiTravelAlternative {
  if (!isRecord(value)) {
    return false;
  }

  if (value.status === "unavailable") {
    return true;
  }

  return (
    (value.status === "available" || value.status === "degraded") &&
    isNonNegativeInteger(value.durationMinutes) &&
    isNonNegativeFiniteNumber(value.cost)
  );
}

function isTravelProviderResult(
  value: unknown,
): value is TravelProviderResult {
  return (
    isRecord(value) &&
    isTransitTravelAlternative(value.transit) &&
    isTaxiTravelAlternative(value.taxi)
  );
}

function copyTransitAlternative(
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

function copyTaxiAlternative(
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

function deriveEdgeDataStatus(
  transit: TransitTravelAlternative,
  taxi: TaxiTravelAlternative,
): TravelEdgeDataStatus {
  if (transit.status === "available" && taxi.status === "available") {
    return "complete";
  }

  if (transit.status === "unavailable" && taxi.status === "unavailable") {
    return "unavailable";
  }

  return "degraded";
}

function createProviderFailureEdge(
  request: TravelTimeRequest,
): TravelEdge {
  return Object.freeze({
    fromLocationId: request.fromLocationId,
    toLocationId: request.toLocationId,
    transit: Object.freeze({ status: "unavailable" as const }),
    taxi: Object.freeze({ status: "unavailable" as const }),
    dataStatus: "unavailable" as const,
    failure: PROVIDER_FAILURE,
  });
}

function createTravelEdge(
  request: TravelTimeRequest,
  providerResult: TravelProviderResult,
): TravelEdge {
  const transit = copyTransitAlternative(providerResult.transit);
  const taxi = copyTaxiAlternative(providerResult.taxi);

  return Object.freeze({
    fromLocationId: request.fromLocationId,
    toLocationId: request.toLocationId,
    transit,
    taxi,
    dataStatus: deriveEdgeDataStatus(transit, taxi),
    failure: null,
  });
}

function validateLocationIdentities(
  originLocationId: unknown,
  propertyLocationIds: unknown,
): asserts propertyLocationIds is readonly LocationId[] {
  if (!isNonBlankString(originLocationId)) {
    throw new RangeError("Invalid origin LocationId");
  }

  if (
    !Array.isArray(propertyLocationIds) ||
    !propertyLocationIds.every(isNonBlankString)
  ) {
    throw new RangeError("Invalid property LocationId");
  }
}

function generateRequiredPairs(
  originLocationId: LocationId,
  propertyLocationIds: readonly LocationId[],
): TravelTimeRequest[] {
  const requiredPairs: TravelTimeRequest[] = [];

  for (const toLocationId of propertyLocationIds) {
    requiredPairs.push({ fromLocationId: originLocationId, toLocationId });
  }

  for (
    let fromIndex = 0;
    fromIndex < propertyLocationIds.length;
    fromIndex += 1
  ) {
    for (
      let toIndex = 0;
      toIndex < propertyLocationIds.length;
      toIndex += 1
    ) {
      if (fromIndex === toIndex) {
        continue;
      }

      requiredPairs.push({
        fromLocationId: propertyLocationIds[fromIndex],
        toLocationId: propertyLocationIds[toIndex],
      });
    }
  }

  const seenTargetsByFrom = new Map<LocationId, Set<LocationId>>();

  return requiredPairs.filter((request) => {
    const seenTargets = seenTargetsByFrom.get(request.fromLocationId);

    if (seenTargets?.has(request.toLocationId) === true) {
      return false;
    }

    if (seenTargets === undefined) {
      seenTargetsByFrom.set(
        request.fromLocationId,
        new Set([request.toLocationId]),
      );
    } else {
      seenTargets.add(request.toLocationId);
    }

    return true;
  });
}

async function acquireEdge(
  request: TravelTimeRequest,
  provider: TravelTimeProvider,
): Promise<TravelEdge> {
  try {
    const providerResult: unknown = await provider.getTravel(request);

    if (!isTravelProviderResult(providerResult)) {
      return createProviderFailureEdge(request);
    }

    return createTravelEdge(request, providerResult);
  } catch {
    return createProviderFailureEdge(request);
  }
}

function freezeMatrix(edgesByFrom: MutableEdgesByFrom): TravelMatrix {
  for (const row of Object.values(edgesByFrom)) {
    Object.freeze(row);
  }

  const frozenEdgesByFrom: Readonly<
    Partial<Record<LocationId, TravelMatrixRow>>
  > = Object.freeze(edgesByFrom);

  return Object.freeze({ edgesByFrom: frozenEdgesByFrom });
}

export async function buildTravelMatrix(
  input: BuildTravelMatrixInput,
): Promise<TravelMatrix> {
  validateLocationIdentities(
    input.originLocationId,
    input.propertyLocationIds,
  );

  const requests = generateRequiredPairs(
    input.originLocationId,
    input.propertyLocationIds,
  );
  const edgesByFrom = Object.create(null) as MutableEdgesByFrom;

  for (const request of requests) {
    const edge = await acquireEdge(request, input.provider);
    const row =
      edgesByFrom[request.fromLocationId] ??
      (Object.create(null) as Record<LocationId, TravelEdge>);

    row[request.toLocationId] = edge;
    edgesByFrom[request.fromLocationId] = row;
  }

  return freezeMatrix(edgesByFrom);
}

export function getTravelEdge(
  matrix: TravelMatrix,
  fromLocationId: LocationId,
  toLocationId: LocationId,
): TravelEdge | undefined {
  return matrix.edgesByFrom[fromLocationId]?.[toLocationId];
}
