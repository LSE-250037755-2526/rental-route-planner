import type { LocationId } from "../../../src/lib/route/types";
import {
  MockTravelTimeProvider,
  providerFailureFixture,
  travelFixture,
  type MockDirectedTravelFixture,
} from "../../../src/lib/travel/MockTravelTimeProvider";
import { buildTravelMatrix } from "../../../src/lib/travel/buildTravelMatrix";
import type { TravelMatrix } from "../../../src/lib/travel/types";
import {
  TRAVEL_RESULT_BOTH_UNAVAILABLE,
  TRAVEL_RESULT_COMPLETE_MEDIUM,
  TRAVEL_RESULT_COMPLETE_SHORT,
  TRAVEL_RESULT_TAXI_ONLY,
  TRAVEL_RESULT_TRANSIT_10_TAXI_7,
  TRAVEL_RESULT_TRANSIT_60_TAXI_24,
  TRAVEL_RESULT_TRANSIT_DEGRADED,
} from "./results";

export const TRAVEL_TEST_LOCATIONS = Object.freeze({
  origin: "origin",
  a: "property-a",
  b: "property-b",
  c: "property-c",
  d: "property-d",
});

export interface TravelFixtureScenario {
  readonly originLocationId: LocationId;
  readonly propertyLocationIds: readonly LocationId[];
  readonly fixtures: readonly MockDirectedTravelFixture[];
}

export function createTravelFixtureScenario(
  scenario: TravelFixtureScenario,
): TravelFixtureScenario {
  return Object.freeze({
    originLocationId: scenario.originLocationId,
    propertyLocationIds: Object.freeze([...scenario.propertyLocationIds]),
    fixtures: Object.freeze([...scenario.fixtures]),
  });
}

export async function buildFixtureTravelMatrix(
  scenario: TravelFixtureScenario,
): Promise<TravelMatrix> {
  const provider = new MockTravelTimeProvider(scenario.fixtures);

  return buildTravelMatrix({
    originLocationId: scenario.originLocationId,
    propertyLocationIds: scenario.propertyLocationIds,
    provider,
  });
}

const { origin, a, b, c } = TRAVEL_TEST_LOCATIONS;

export const ASYMMETRIC_TRAVEL_SCENARIO = createTravelFixtureScenario({
  originLocationId: origin,
  propertyLocationIds: [a, b],
  fixtures: [
    travelFixture(origin, a, TRAVEL_RESULT_COMPLETE_SHORT),
    travelFixture(origin, b, TRAVEL_RESULT_COMPLETE_MEDIUM),
    travelFixture(a, b, TRAVEL_RESULT_COMPLETE_SHORT),
    travelFixture(b, a, TRAVEL_RESULT_COMPLETE_MEDIUM),
  ],
});

export const CASE16_TAXI_ONLY = createTravelFixtureScenario({
  originLocationId: origin,
  propertyLocationIds: [a],
  fixtures: [travelFixture(origin, a, TRAVEL_RESULT_TAXI_ONLY)],
});

export const CASE16_BOTH_UNAVAILABLE = createTravelFixtureScenario({
  originLocationId: origin,
  propertyLocationIds: [a],
  fixtures: [
    travelFixture(origin, a, TRAVEL_RESULT_BOTH_UNAVAILABLE),
  ],
});

export const CASE16_PROVIDER_FAILURE = createTravelFixtureScenario({
  originLocationId: origin,
  propertyLocationIds: [a],
  fixtures: [providerFailureFixture(origin, a)],
});

export const TRANSIT_DEGRADED_SCENARIO = createTravelFixtureScenario({
  originLocationId: origin,
  propertyLocationIds: [a],
  fixtures: [
    travelFixture(origin, a, TRAVEL_RESULT_TRANSIT_DEGRADED),
  ],
});

export const CASE19_RAW_TRAVEL_ASYMMETRY =
  createTravelFixtureScenario({
    originLocationId: origin,
    propertyLocationIds: [a, b, c],
    fixtures: [
      travelFixture(origin, a, TRAVEL_RESULT_COMPLETE_SHORT),
      travelFixture(origin, b, TRAVEL_RESULT_COMPLETE_SHORT),
      travelFixture(origin, c, TRAVEL_RESULT_COMPLETE_SHORT),
      travelFixture(a, b, TRAVEL_RESULT_COMPLETE_SHORT),
      travelFixture(a, c, TRAVEL_RESULT_TRANSIT_60_TAXI_24),
      travelFixture(b, a, TRAVEL_RESULT_COMPLETE_MEDIUM),
      travelFixture(b, c, TRAVEL_RESULT_TRANSIT_10_TAXI_7),
      travelFixture(c, a, TRAVEL_RESULT_COMPLETE_SHORT),
      travelFixture(c, b, TRAVEL_RESULT_COMPLETE_MEDIUM),
    ],
  });
