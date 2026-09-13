import type { LocationId } from "../route/types";
import type {
  TaxiTravelAlternative,
  TransitTravelAlternative,
} from "./types";

export interface TravelTimeRequest {
  readonly fromLocationId: LocationId;
  readonly toLocationId: LocationId;
}

export interface TravelProviderResult {
  readonly transit: TransitTravelAlternative;
  readonly taxi: TaxiTravelAlternative;
}

export interface TravelTimeProvider {
  getTravel(request: TravelTimeRequest): Promise<TravelProviderResult>;
}
