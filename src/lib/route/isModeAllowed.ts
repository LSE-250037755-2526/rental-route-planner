import type { TransportMode, TransportStrategy } from "./types";
import type { TravelModeDataStatus } from "../travel/types";

export interface IsModeAllowedInput {
  readonly transportStrategy: TransportStrategy;
  readonly transportMode: TransportMode;
  readonly dataStatus: TravelModeDataStatus;
}

export function isModeAllowed(input: IsModeAllowedInput): boolean {
  if (input.dataStatus === "unavailable") {
    return false;
  }

  if (input.transportMode === "transit") {
    return true;
  }

  return input.transportStrategy !== "transit_only";
}
