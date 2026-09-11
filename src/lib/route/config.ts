export const ROUTE_ENGINE_CONFIG = Object.freeze({
  defaults: Object.freeze({
    viewingDurationMinutes: 30,
    fixedAppointmentEarlyArrivalBufferMinutes: 15,
  }),
  anchors: Object.freeze({
    narrowWindowAnchorMaximumWidthMinutes: 60,
  }),
  transitRisk: Object.freeze({
    transferCountThreshold: 2,
    transferRiskPoints: 2,
    walkingDistanceThresholdMeters: 800,
    walkingRiskPoints: 1,
    bufferWarningThresholdMinutes: 15,
    bufferWarningRiskPoints: 1,
    highRiskBufferThresholdMinutes: 10,
    highRiskBufferPoints: 2,
    lowRiskMaximumScore: 1,
    mediumRiskScore: 2,
    highRiskMinimumScore: 3,
  }),
  taxiRecommendation: Object.freeze({
    meaningfulTimeSavingMinutes: 25,
    minimumTransitToTaxiDurationRatio: 1.8,
  }),
  search: Object.freeze({
    minimumPropertiesForMultiPropertyRoute: 2,
    coreScenarioPropertyCountMinimum: 4,
    coreScenarioPropertyCountMaximum: 8,
    transitFirstBaselineTaxiLegComparisonDepth: 2,
  }),
} as const);
