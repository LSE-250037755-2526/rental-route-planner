export type PropertyId = string;
export type LocationId = string;
export type CalendarDate = string;
export type ClockTime = string;
export type MinuteOfDay = number;
export type DurationMinutes = number;
export type CurrencyAmount = number;

export type PropertyImportance = "must" | "if_time";

export type PropertyStatus =
  | "pending"
  | "en_route"
  | "arrived"
  | "viewing"
  | "completed"
  | "cancelled"
  | "skipped";

export interface FixedViewingTimeInput {
  readonly type: "fixed";
  readonly date: CalendarDate;
  readonly startTime: ClockTime;
}

export interface StartWindowViewingTimeInput {
  readonly type: "window";
  readonly constraint: "start_between";
  readonly date: CalendarDate;
  readonly earliestStart: ClockTime;
  readonly latestStart: ClockTime;
}

export interface FinishBeforeViewingTimeInput {
  readonly type: "window";
  readonly constraint: "finish_before";
  readonly date: CalendarDate;
  readonly finishBy: ClockTime;
  readonly earliestStart?: ClockTime;
}

export type WindowViewingTimeInput =
  | StartWindowViewingTimeInput
  | FinishBeforeViewingTimeInput;

export interface FlexibleViewingTimeInput {
  readonly type: "flexible";
}

export interface UnconfirmedViewingTimeInput {
  readonly type: "unconfirmed";
  readonly date?: CalendarDate;
}

export type ViewingTimeInput =
  | FixedViewingTimeInput
  | WindowViewingTimeInput
  | FlexibleViewingTimeInput
  | UnconfirmedViewingTimeInput;

export interface Property {
  readonly id: PropertyId;
  readonly address: string;
  readonly displayName?: string;
  readonly locationId?: LocationId;
  readonly viewingTime: ViewingTimeInput;
  readonly importance: PropertyImportance;
  readonly durationMinutes?: DurationMinutes;
  readonly agentName?: string;
  readonly status: PropertyStatus;
}

export interface NormalizedTimeWindow {
  readonly earliestStart: MinuteOfDay;
  readonly latestStart: MinuteOfDay;
}

export type NormalizedViewingTime =
  | Readonly<{
      type: "fixed";
      window: NormalizedTimeWindow;
    }>
  | Readonly<{
      type: "window";
      sourceConstraint: "start_between" | "finish_before";
      window: NormalizedTimeWindow;
    }>
  | Readonly<{
      type: "flexible";
      window: NormalizedTimeWindow;
    }>
  | Readonly<{
      type: "unconfirmed";
      window: null;
    }>;

export interface NormalizedProperty {
  readonly id: PropertyId;
  readonly address: string;
  readonly displayName: string;
  readonly locationId: LocationId;
  readonly viewingTime: NormalizedViewingTime;
  readonly importance: PropertyImportance;
  readonly durationMinutes: DurationMinutes;
  readonly agentName?: string;
  readonly status: PropertyStatus;
}

export type TransportStrategy =
  | "transit_only"
  | "transit_first"
  | "efficiency_first";

export type TransportMode = "transit" | "taxi";

export type RoutePreference =
  | "fewer_transfers"
  | "less_walking"
  | "avoid_long_cycling";

export type TaxiBudget =
  | Readonly<{ type: "unset" }>
  | Readonly<{ type: "unlimited" }>
  | Readonly<{ type: "capped"; amount: CurrencyAmount }>;

export interface DayPlanSettings {
  readonly date: CalendarDate;
  readonly originLocationId: LocationId;
  readonly earliestStart: MinuteOfDay;
  readonly latestEnd: MinuteOfDay;
  readonly transportStrategy: TransportStrategy;
  readonly taxiBudget: TaxiBudget;
  readonly fixedAppointmentBufferMinutes: DurationMinutes;
  readonly routePreferences: readonly RoutePreference[];
}

export type ConflictCode =
  | "invalid_input"
  | "appointment_conflict"
  | "time_window_conflict"
  | "end_time_exceeded"
  | "address_unresolved"
  | "travel_data_unavailable"
  | "taxi_budget_exceeded"
  | "must_visit_unscheduled";

export type ViolationCode = ConflictCode;

export type IssueSeverity = "warning" | "error";

export type StructuredParameterValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | readonly number[];

export type StructuredParameters = Readonly<
  Record<string, StructuredParameterValue>
>;

export interface Violation {
  readonly kind: "violation";
  readonly code: ViolationCode;
  readonly severity: IssueSeverity;
  readonly propertyIds: readonly PropertyId[];
  readonly parameters: StructuredParameters;
}

export interface Conflict {
  readonly kind: "conflict";
  readonly code: ConflictCode;
  readonly propertyIds: readonly PropertyId[];
  readonly parameters: StructuredParameters;
}

export type RiskLevel = "low" | "medium" | "high";

export type RiskCode =
  | "late_risk"
  | "low_buffer"
  | "multiple_transfers"
  | "long_walk"
  | "complex_transfer"
  | "transit_detour";

export interface LegRisk {
  readonly fromLocationId: LocationId;
  readonly toLocationId: LocationId;
  readonly transportMode: TransportMode;
  readonly score: number;
  readonly level: RiskLevel;
  readonly codes: readonly RiskCode[];
}

export interface RouteRisk {
  readonly score: number;
  readonly level: RiskLevel;
  readonly legs: readonly LegRisk[];
}

export type ReasonCode =
  | "fixed_appointment_anchor"
  | "appointment_gap_inserted"
  | "must_visit_preserved"
  | "lower_transit_risk"
  | "public_transit_default"
  | "avoid_late"
  | "transit_detour"
  | "unlock_extra_viewing"
  | "lower_taxi_cost"
  | "earlier_finish";

export type Explanation =
  | Readonly<{
      scope: "route";
      code: ReasonCode;
      parameters: StructuredParameters;
    }>
  | Readonly<{
      scope: "stop";
      propertyId: PropertyId;
      code: ReasonCode;
      parameters: StructuredParameters;
    }>
  | Readonly<{
      scope: "leg";
      fromLocationId: LocationId;
      toLocationId: LocationId;
      code: ReasonCode;
      parameters: StructuredParameters;
    }>;

export interface RouteStop {
  readonly propertyId: PropertyId;
  readonly order: number;
  readonly travelFromLocationId: LocationId;
  readonly travelMode: TransportMode;
  readonly travelMinutes: DurationMinutes;
  readonly travelCost: CurrencyAmount;
  readonly arrivalAt: MinuteOfDay;
  readonly waitingMinutes: DurationMinutes;
  readonly viewingStartAt: MinuteOfDay;
  readonly viewingEndAt: MinuteOfDay;
  readonly bufferMinutes: DurationMinutes | null;
  readonly reasonCodes: readonly ReasonCode[];
  readonly riskCodes: readonly RiskCode[];
}

export interface SimulationTotals {
  readonly completedCount: number;
  readonly mustCompletedCount: number;
  readonly totalTravelMinutes: DurationMinutes;
  readonly totalWaitingMinutes: DurationMinutes;
  readonly estimatedEndAt: MinuteOfDay;
  readonly taxiCost: CurrencyAmount;
  readonly taxiLegCount: number;
}

export interface SimulationResult {
  readonly status: "simulated";
  readonly departureAt: MinuteOfDay;
  readonly stops: readonly RouteStop[];
  readonly totals: SimulationTotals;
}

export interface CandidateMetrics {
  readonly hardViolationCount: number;
  readonly riskPenalty: number;
  readonly experiencePenalty: number;
}

interface RouteCandidateBase {
  readonly id: string;
  readonly propertyOrder: readonly PropertyId[];
  readonly transportModes: readonly TransportMode[];
  readonly simulation: SimulationResult;
  readonly metrics: CandidateMetrics;
  readonly risk: RouteRisk;
  readonly explanations: readonly Explanation[];
}

export type RouteCandidate =
  | (RouteCandidateBase &
      Readonly<{
        status: "feasible";
        violations: readonly [];
        conflicts: readonly [];
      }>)
  | (RouteCandidateBase &
      Readonly<{
        status: "partial";
        violations: readonly Violation[];
        conflicts: readonly Conflict[];
      }>)
  | (RouteCandidateBase &
      Readonly<{
        status: "conflicted";
        violations: readonly Violation[];
        conflicts: readonly [Conflict, ...Conflict[]];
      }>);

export type RouteOptionLabel = "cheapest" | "recommended" | "fastest";

export type RouteOption = RouteCandidate &
  Readonly<{
    objectiveLabels: readonly [RouteOptionLabel, ...RouteOptionLabel[]];
  }>;

export type DayRouteOptimizationResult =
  | Readonly<{
      status: "success";
      options: readonly [RouteOption, ...RouteOption[]];
      conflicts: readonly [];
      consideredCandidateCount: number;
    }>
  | Readonly<{
      status: "partial";
      options: readonly [RouteOption, ...RouteOption[]];
      conflicts: readonly Conflict[];
      consideredCandidateCount: number;
    }>
  | Readonly<{
      status: "failure";
      options: readonly [];
      conflicts: readonly [Conflict, ...Conflict[]];
      consideredCandidateCount: number;
    }>;
