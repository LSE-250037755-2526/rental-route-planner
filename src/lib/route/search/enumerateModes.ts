import { isModeAllowed } from "../isModeAllowed";
import type {
  LocationId,
  NormalizedProperty,
  TransportMode,
  TransportStrategy,
} from "../types";
import type { TravelMatrix } from "../../travel/types";

export type TransportModeSequence = readonly TransportMode[];

export interface EnumerateModeSequencesInput {
  readonly transportStrategy: TransportStrategy;
  readonly originLocationId: LocationId;
  readonly orderedProperties: readonly NormalizedProperty[];
  readonly travelMatrix: TravelMatrix;
}

export interface TransportModeCombinationSearchStrategy {
  readonly generate: (
    input: EnumerateModeSequencesInput,
  ) => readonly TransportModeSequence[];
}

const MODE_TRAVERSAL_ORDER: readonly TransportMode[] = Object.freeze([
  "transit",
  "taxi",
]);

export function enumerateModeSequences(
  input: EnumerateModeSequencesInput,
): readonly TransportModeSequence[] {
  if (input.orderedProperties.length === 0) {
    const emptySequence: TransportModeSequence = Object.freeze([]);

    return Object.freeze([emptySequence]);
  }

  const legalModesByLeg: TransportMode[][] = [];

  for (let index = 0; index < input.orderedProperties.length; index += 1) {
    const property = input.orderedProperties[index];
    const fromLocationId =
      index === 0
        ? input.originLocationId
        : input.orderedProperties[index - 1].locationId;
    const edge =
      input.travelMatrix.edgesByFrom[fromLocationId]?.[
        property.locationId
      ];

    if (edge === undefined) {
      return Object.freeze([]);
    }

    const legalModes = MODE_TRAVERSAL_ORDER.filter((transportMode) =>
      isModeAllowed({
        transportStrategy: input.transportStrategy,
        transportMode,
        dataStatus: edge[transportMode].status,
      }),
    );

    if (legalModes.length === 0) {
      return Object.freeze([]);
    }

    legalModesByLeg.push(legalModes);
  }

  const sequences: TransportModeSequence[] = [];
  const prefix: TransportMode[] = [];

  function explore(legIndex: number): void {
    if (legIndex === legalModesByLeg.length) {
      sequences.push(Object.freeze([...prefix]));
      return;
    }

    for (const transportMode of legalModesByLeg[legIndex]) {
      prefix.push(transportMode);
      explore(legIndex + 1);
      prefix.pop();
    }
  }

  explore(0);

  return Object.freeze(sequences);
}

export const exhaustiveModeCombinationSearchStrategy: TransportModeCombinationSearchStrategy =
  Object.freeze({
    generate: enumerateModeSequences,
  });
