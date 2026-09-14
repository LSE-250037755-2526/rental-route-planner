import { addMinutesWithinDay } from "./time";
import type {
  DayPlanSettings,
  LocationId,
  NormalizedProperty,
  ReasonCode,
  RiskCode,
  RouteStop,
  SimulationResult,
  SimulationTotals,
  TransportMode,
} from "./types";
import type { TravelMatrix } from "../travel/types";

export interface SimulateTimelineInput {
  readonly settings: DayPlanSettings;
  readonly orderedProperties: readonly NormalizedProperty[];
  readonly transportModes: readonly TransportMode[];
  readonly travelMatrix: TravelMatrix;
}

const EMPTY_REASON_CODES: readonly ReasonCode[] = Object.freeze([]);
const EMPTY_RISK_CODES: readonly RiskCode[] = Object.freeze([]);

function addTimelineMinutes(
  start: number,
  durationMinutes: number,
  operation: string,
): number {
  const result = addMinutesWithinDay(start, durationMinutes);

  if (result === null) {
    throw new RangeError(`${operation} crosses the same-day boundary`);
  }

  return result;
}

function getSelectedTravel(
  travelMatrix: TravelMatrix,
  fromLocationId: LocationId,
  toLocationId: LocationId,
  transportMode: TransportMode,
) {
  const edge = travelMatrix.edgesByFrom[fromLocationId]?.[toLocationId];

  if (edge === undefined) {
    throw new RangeError(
      `Missing directed TravelEdge for ${fromLocationId} -> ${toLocationId}`,
    );
  }

  const selectedTravel = edge[transportMode];

  if (selectedTravel.status === "unavailable") {
    throw new RangeError(
      `Selected ${transportMode} mode is unavailable for ${fromLocationId} -> ${toLocationId}`,
    );
  }

  return selectedTravel;
}

export function simulateTimeline(
  input: SimulateTimelineInput,
): SimulationResult {
  const {
    settings,
    orderedProperties,
    transportModes,
    travelMatrix,
  } = input;

  if (transportModes.length !== orderedProperties.length) {
    throw new RangeError(
      "transportModes length must equal orderedProperties length",
    );
  }

  const departureAt = settings.earliestStart;
  const stops: RouteStop[] = [];
  let currentLocationId = settings.originLocationId;
  let currentTime = departureAt;
  let totalTravelMinutes = 0;
  let totalWaitingMinutes = 0;
  let taxiCost = 0;
  let taxiLegCount = 0;
  let mustCompletedCount = 0;

  for (let index = 0; index < orderedProperties.length; index += 1) {
    const property = orderedProperties[index];
    const travelMode = transportModes[index];
    const selectedTravel = getSelectedTravel(
      travelMatrix,
      currentLocationId,
      property.locationId,
      travelMode,
    );
    const arrivalAt = addTimelineMinutes(
      currentTime,
      selectedTravel.durationMinutes,
      `Travel to property ${property.id}`,
    );
    const earliestViewingStart =
      property.viewingTime.window?.earliestStart;
    const viewingStartAt =
      earliestViewingStart === undefined
        ? arrivalAt
        : Math.max(arrivalAt, earliestViewingStart);
    const waitingMinutes = viewingStartAt - arrivalAt;
    const viewingEndAt = addTimelineMinutes(
      viewingStartAt,
      property.durationMinutes,
      `Viewing at property ${property.id}`,
    );
    const bufferMinutes =
      property.viewingTime.type === "fixed"
        ? Math.max(
            0,
            property.viewingTime.window.earliestStart - arrivalAt,
          )
        : null;
    const stop: RouteStop = Object.freeze({
      propertyId: property.id,
      order: index + 1,
      travelFromLocationId: currentLocationId,
      travelMode,
      travelMinutes: selectedTravel.durationMinutes,
      travelCost: selectedTravel.cost,
      arrivalAt,
      waitingMinutes,
      viewingStartAt,
      viewingEndAt,
      bufferMinutes,
      reasonCodes: EMPTY_REASON_CODES,
      riskCodes: EMPTY_RISK_CODES,
    });

    stops.push(stop);
    totalTravelMinutes += selectedTravel.durationMinutes;
    totalWaitingMinutes += waitingMinutes;

    if (travelMode === "taxi") {
      taxiCost += selectedTravel.cost;
      taxiLegCount += 1;
    }

    if (property.importance === "must") {
      mustCompletedCount += 1;
    }

    currentLocationId = property.locationId;
    currentTime = viewingEndAt;
  }

  const frozenStops: readonly RouteStop[] = Object.freeze(stops);
  const totals: SimulationTotals = Object.freeze({
    completedCount: frozenStops.length,
    mustCompletedCount,
    totalTravelMinutes,
    totalWaitingMinutes,
    estimatedEndAt: currentTime,
    taxiCost,
    taxiLegCount,
  });

  return Object.freeze({
    status: "simulated",
    departureAt,
    stops: frozenStops,
    totals,
  });
}
