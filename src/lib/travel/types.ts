import type {
  CurrencyAmount,
  DurationMinutes,
  LocationId,
} from "../route/types";

export type TravelModeDataStatus =
  | "available"
  | "degraded"
  | "unavailable";

type UsableTravelModeDataStatus = Exclude<
  TravelModeDataStatus,
  "unavailable"
>;

export type TransitTravelAlternative =
  | Readonly<{
      status: UsableTravelModeDataStatus;
      durationMinutes: DurationMinutes;
      cost: CurrencyAmount;
      transferCount: number;
      walkMeters: number;
    }>
  | Readonly<{
      status: "unavailable";
    }>;

export type TaxiTravelAlternative =
  | Readonly<{
      status: UsableTravelModeDataStatus;
      durationMinutes: DurationMinutes;
      cost: CurrencyAmount;
    }>
  | Readonly<{
      status: "unavailable";
    }>;

export type TravelEdgeDataStatus =
  | "complete"
  | "degraded"
  | "unavailable";

export type TravelProviderFailure = Readonly<{
  kind: "provider_failure";
}>;

export interface TravelEdge {
  readonly fromLocationId: LocationId;
  readonly toLocationId: LocationId;
  readonly transit: TransitTravelAlternative;
  readonly taxi: TaxiTravelAlternative;
  readonly dataStatus: TravelEdgeDataStatus;
  readonly failure: TravelProviderFailure | null;
}

export type TravelMatrixRow = Readonly<
  Partial<Record<LocationId, TravelEdge>>
>;

export interface TravelMatrix {
  readonly edgesByFrom: Readonly<
    Partial<Record<LocationId, TravelMatrixRow>>
  >;
}
