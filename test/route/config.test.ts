import { describe, expect, it } from "vitest";

import { ROUTE_ENGINE_CONFIG } from "../../src/lib/route/config";

describe("ROUTE_ENGINE_CONFIG", () => {
  it("exposes the confirmed V0.1A defaults", () => {
    expect(ROUTE_ENGINE_CONFIG.defaults).toEqual({
      viewingDurationMinutes: 30,
      fixedAppointmentEarlyArrivalBufferMinutes: 15,
    });
    expect(ROUTE_ENGINE_CONFIG.anchors).toEqual({
      narrowWindowAnchorMaximumWidthMinutes: 60,
    });
  });

  it("exposes the confirmed public-transit risk configuration", () => {
    expect(ROUTE_ENGINE_CONFIG.transitRisk).toEqual({
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
    });
  });

  it("exposes the confirmed taxi recommendation thresholds", () => {
    expect(ROUTE_ENGINE_CONFIG.taxiRecommendation).toEqual({
      meaningfulTimeSavingMinutes: 25,
      minimumTransitToTaxiDurationRatio: 1.8,
    });
  });

  it("distinguishes the multi-property route threshold from core scenario guidance", () => {
    expect(ROUTE_ENGINE_CONFIG.search).toEqual({
      minimumPropertiesForMultiPropertyRoute: 2,
      coreScenarioPropertyCountMinimum: 4,
      coreScenarioPropertyCountMaximum: 8,
      transitFirstBaselineTaxiLegComparisonDepth: 2,
    });
  });

  it("keeps risk and search boundaries internally consistent", () => {
    const { search, transitRisk } = ROUTE_ENGINE_CONFIG;

    expect(transitRisk.highRiskBufferThresholdMinutes).toBeLessThan(
      transitRisk.bufferWarningThresholdMinutes,
    );
    expect(transitRisk.lowRiskMaximumScore).toBeLessThan(
      transitRisk.mediumRiskScore,
    );
    expect(transitRisk.mediumRiskScore).toBeLessThan(
      transitRisk.highRiskMinimumScore,
    );
    expect(search.minimumPropertiesForMultiPropertyRoute).toBeLessThanOrEqual(
      search.coreScenarioPropertyCountMinimum,
    );
    expect(search.coreScenarioPropertyCountMinimum).toBeLessThanOrEqual(
      search.coreScenarioPropertyCountMaximum,
    );
  });

  it("exports frozen configuration objects", () => {
    expect(Object.isFrozen(ROUTE_ENGINE_CONFIG)).toBe(true);
    expect(Object.isFrozen(ROUTE_ENGINE_CONFIG.defaults)).toBe(true);
    expect(Object.isFrozen(ROUTE_ENGINE_CONFIG.anchors)).toBe(true);
    expect(Object.isFrozen(ROUTE_ENGINE_CONFIG.transitRisk)).toBe(true);
    expect(Object.isFrozen(ROUTE_ENGINE_CONFIG.taxiRecommendation)).toBe(true);
    expect(Object.isFrozen(ROUTE_ENGINE_CONFIG.search)).toBe(true);
  });
});
