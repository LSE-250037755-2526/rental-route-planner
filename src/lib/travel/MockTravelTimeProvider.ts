import type { LocationId } from "../route/types";
import type {
  TravelProviderResult,
  TravelTimeProvider,
  TravelTimeRequest,
} from "./TravelTimeProvider";
import type {
  TaxiTravelAlternative,
  TransitTravelAlternative,
} from "./types";

export type MockTravelFixtureResponse =
  | Readonly<{
      type: "result";
      result: TravelProviderResult;
    }>
  | Readonly<{
      type: "provider_failure";
    }>;

export interface MockDirectedTravelFixture {
  readonly fromLocationId: LocationId;
  readonly toLocationId: LocationId;
  readonly response: MockTravelFixtureResponse;
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

function copyTravelProviderResult(
  result: TravelProviderResult,
): TravelProviderResult {
  return Object.freeze({
    transit: copyTransitAlternative(result.transit),
    taxi: copyTaxiAlternative(result.taxi),
  });
}

function copyFixtureResponse(
  response: MockTravelFixtureResponse,
): MockTravelFixtureResponse {
  if (response.type === "provider_failure") {
    return Object.freeze({ type: "provider_failure" });
  }

  return Object.freeze({
    type: "result",
    result: copyTravelProviderResult(response.result),
  });
}

export function travelFixture(
  fromLocationId: LocationId,
  toLocationId: LocationId,
  result: TravelProviderResult,
): MockDirectedTravelFixture {
  return Object.freeze({
    fromLocationId,
    toLocationId,
    response: Object.freeze({ type: "result", result }),
  });
}

export function providerFailureFixture(
  fromLocationId: LocationId,
  toLocationId: LocationId,
): MockDirectedTravelFixture {
  return Object.freeze({
    fromLocationId,
    toLocationId,
    response: Object.freeze({ type: "provider_failure" }),
  });
}

export class MockTravelTimeProvider implements TravelTimeProvider {
  private readonly fixtures: readonly MockDirectedTravelFixture[];

  private readonly requestHistory: TravelTimeRequest[] = [];

  constructor(fixtures: readonly MockDirectedTravelFixture[]) {
    const copiedFixtures: MockDirectedTravelFixture[] = [];
    const seenTargetsByFrom = new Map<LocationId, Set<LocationId>>();

    for (const fixture of fixtures) {
      const seenTargets = seenTargetsByFrom.get(fixture.fromLocationId);

      if (seenTargets?.has(fixture.toLocationId) === true) {
        throw new RangeError(
          `Duplicate mock travel fixture for directed pair ${fixture.fromLocationId} -> ${fixture.toLocationId}`,
        );
      }

      if (seenTargets === undefined) {
        seenTargetsByFrom.set(
          fixture.fromLocationId,
          new Set([fixture.toLocationId]),
        );
      } else {
        seenTargets.add(fixture.toLocationId);
      }

      copiedFixtures.push(
        Object.freeze({
          fromLocationId: fixture.fromLocationId,
          toLocationId: fixture.toLocationId,
          response: copyFixtureResponse(fixture.response),
        }),
      );
    }

    this.fixtures = Object.freeze(copiedFixtures);
  }

  async getTravel(
    request: TravelTimeRequest,
  ): Promise<TravelProviderResult> {
    const recordedRequest = Object.freeze({
      fromLocationId: request.fromLocationId,
      toLocationId: request.toLocationId,
    });
    this.requestHistory.push(recordedRequest);

    const response = this.fixtures.find(
      (fixture) =>
        fixture.fromLocationId === recordedRequest.fromLocationId &&
        fixture.toLocationId === recordedRequest.toLocationId,
    )?.response;

    if (response === undefined) {
      throw new Error(
        `No mock travel fixture for directed pair ${recordedRequest.fromLocationId} -> ${recordedRequest.toLocationId}`,
      );
    }

    if (response.type === "provider_failure") {
      throw new Error(
        `Configured mock travel provider failure for ${recordedRequest.fromLocationId} -> ${recordedRequest.toLocationId}`,
      );
    }

    return response.result;
  }

  getRequests(): readonly TravelTimeRequest[] {
    return Object.freeze(
      this.requestHistory.map((request) =>
        Object.freeze({
          fromLocationId: request.fromLocationId,
          toLocationId: request.toLocationId,
        }),
      ),
    );
  }
}
