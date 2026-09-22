# Core Engine Backlog

## 1. Purpose and authority

This file is the only detailed Core Engine implementation ledger. It owns CE
status, sequencing, prerequisites, implementation scope, likely ownership,
test mappings, Decision Gates, definitions of done, and explicit non-goals.

It coordinates implementation but does not override:

- `MVP.md` for MVP product scope;
- `PRD.md` for product behavior and acceptance semantics;
- `ROUTE_ALGORITHM.md` for optimization and domain rules;
- `TEST_CASES.md` for deterministic acceptance scenarios;
- `AGENTS.md` for engineering governance.

Future coding tasks must read `AGENTS.md`, this backlog, and the relevant
authoritative product/algorithm/test sections before editing source.

Detailed CE changes belong here. Other documents may state high-level
boundaries and link here, but must not duplicate this ledger.

## 2. Status legend

- **COMPLETE** — implemented, validated, and accepted for its recorded scope.
- **NEXT** — the next approved coding task; it does not authorize starting automatically.
- **PLANNED** — sequenced but not yet authorized or implemented.
- **BLOCKED** — cannot progress until a recorded dependency or Decision Gate closes.
- **DEFERRED** — intentionally outside the current Core Engine phase.

Status reflects repository implementation, not documentation of future intent.

## 3. Confirmed architecture summary

- **D1:** Users supply available dates and per-date availability; the planner selects active dates and may use fewer dates than supplied. It never invents an unavailable date.
- **D2:** Multi-day Day Assignment and Daily Route Optimization are separate layers.
- **D3:** Every Daily Route has an independent `CalendarDate` and 0–1439 same-day time axis, with no silent midnight wrap, locale parsing, current-time dependency, or cross-day cumulative minutes.
- **D4:** Window normalization and input validation are day-scoped. Multiple dates are valid for the multi-day planner but not inside one daily optimization call.
- **D5:** CE-01.1 makes only the minimal daily-contract renames; multi-day source contracts wait until CE-17.
- **D6:** Business/domain rules are separate from replaceable search strategies.
- **D7:** 4–8 properties and up to three V0.1 UI dates are targets/boundaries, not permanent domain limits.
- **D8:** Current acceptance comprises daily Cases 1–11, 13, 16, 17 and multi-day Cases 18–25 as their milestones arrive. Cases 12, 14, and 15 are deferred.
- **D9:** Core Engine work proceeds through integrated daily optimization and then the complete multi-day planner before substantial UI may be considered.
- **D10:** This file is the persistent and sole detailed CE ledger.
- **S1:** Travel acquisition, providers, and matrix construction are outside the route engine. Optimizers consume precomputed `TravelMatrix` data only.

## 4. Current implementation snapshot

- CE-00 — **COMPLETE**
- CE-01 — **COMPLETE**
- CE-01.1 — **COMPLETE**
- CE-02 — **COMPLETE**
- CE-03 — **COMPLETE**
- CE-04 — **COMPLETE**
- CE-05 — **COMPLETE**
- CE-06 — **COMPLETE**
- CE-07 — **COMPLETE**
- CE-08 — **COMPLETE**
- CE-09 — **COMPLETE**
- CE-10 — **COMPLETE**
- CE-11 — **COMPLETE**
- CE-12 — **COMPLETE**
- CE-13 — **COMPLETE**
- CE-14 — **COMPLETE**
- CE-15 — **NEXT**
- CE-16 through CE-21 — **PLANNED**

Current source includes the Vitest foundation, route-domain models, centralized
configuration, and deterministic configuration tests.

`src/lib/route/time.ts` provides deterministic date/time primitives for:

- strict `CalendarDate` validation;
- strict `ClockTime` validation;
- `MinuteOfDay` validation;
- `ClockTime` ↔ `MinuteOfDay` conversion;
- same-day bounded minute arithmetic;
- `CalendarDate` comparison and sorting.

`src/lib/route/normalizeWindows.ts` provides deterministic day-scoped
viewing-time normalization for:

- fixed appointments;
- `start_between` windows;
- `finish_before` windows with a duration-derived `latestStart`;
- flexible inputs using the supplied target-day planning window;
- neutral unconfirmed inputs;
- an explicit `not_eligible` result for valid source-date mismatches;
- malformed input kept distinct from `not_eligible`.

`src/lib/route/validateDayRouteInput.ts` provides deterministic structural
validation for one Daily Route, including:

- exactly one target `CalendarDate` and valid same-day settings/bounds;
- one-property engine input support, with no property-count hard cap derived
  from the 4–8 core scenario/performance guidance;
- address and resolved location identity validation;
- effective viewing-duration resolution from the configured default;
- reuse of CE-03 viewing-time validation;
- explicit daily property-date mismatch detection;
- neutral flexible and undated-unconfirmed handling;
- deterministic machine-readable validation issues;
- no scheduling feasibility evaluation; and
- no `TravelMatrix` or provider dependency.

`PropertyId` is the stable identity used by route and search contracts and must
be unique within one Daily Route property collection. CE-04 structural
validation emits `duplicate_property_id` for every valid exact-string duplicate
after the first occurrence. Invalid or blank IDs are not tracked for duplicate
detection, and duplicate addresses remain allowed when IDs are distinct. This
narrow correction was introduced during CE-09 review because
`DailyPropertyOrder` and future `RouteCandidate.propertyOrder` use
`PropertyId[]` and therefore require unambiguous identities.

One property remains valid Core Engine input. An invalid Daily Route assignment
does not imply an invalid Multi-day Plan. Travel-matrix and provider work began
in CE-05, not CE-04.

An undated unconfirmed input makes no target-day eligibility claim; Gate E
remains unresolved.

`src/lib/travel/types.ts`, `src/lib/travel/TravelTimeProvider.ts`, and
`src/lib/travel/buildTravelMatrix.ts` provide:

- `TravelModeDataStatus` with `available`, `degraded`, and `unavailable` states;
- independent transit and taxi alternatives;
- directed `TravelEdge` contracts with derived `complete`, `degraded`, or
  `unavailable` edge status;
- explicit `provider_failure` state isolated from ordinary unavailability;
- a readonly and runtime-frozen `TravelMatrix`;
- deterministic origin-to-property and property-to-other-property pair
  coverage and provider-call order;
- no symmetric-edge assumption;
- explicit edges for requested-but-unavailable pairs;
- provider-failure and malformed-payload isolation without fabricated travel
  values or reverse-edge fallback; and
- copied provider results that cannot mutate built matrix data.

`TravelMatrix` directionality is explicit: a missing entry means that directed
pair was not requested, while a requested unavailable pair remains an explicit
edge. Transit and taxi availability are independent, and taxi-only usable data
is degraded rather than complete. `src/lib/route/` does not depend on
`TravelTimeProvider`; route optimization consumes a precomputed `TravelMatrix`.
Gate D remains unresolved.

`src/lib/travel/MockTravelTimeProvider.ts`,
`test/fixtures/travel/results.ts`, and
`test/fixtures/travel/scenarios.ts` provide:

- deterministic exact directed-pair fixture lookup;
- explicit result and `provider_failure` fixture responses;
- duplicate exact-pair rejection, with no symmetric/reverse fallback and no
  default/fallback result;
- deterministic copied request history;
- provider-owned frozen fixture and result data;
- canonical exact transit/taxi fixture values;
- explicit transit-only, taxi-only, both-unavailable, degraded, and
  provider-failure data;
- reusable directed travel scenarios;
- generic `buildFixtureTravelMatrix()` reuse of CE-05 `buildTravelMatrix()`;
- incomplete required fixtures remaining visible as provider failures; and
- reusable raw travel data for future daily and multi-day tests.

`MockTravelTimeProvider` answers exactly one directed pair at a time and does
not call `buildTravelMatrix()`. `buildFixtureTravelMatrix()` delegates matrix
construction to CE-05. A missing fixture is never replaced with default travel
data; ordinary unavailable data remains distinct from provider failure, and
taxi-only data remains distinct from both-unavailable data. CE-06 fixtures
encode travel data, not route decisions. Gate D remains unresolved, and no
property-count hard cap exists.

`src/lib/route/simulateTimeline.ts` and
`test/route/simulateTimeline.test.ts` provide the authoritative pure daily
timeline simulator and deterministic CE-07 coverage. The implementation uses
supplied property order, incoming transport modes, normalized properties, and
a precomputed directed `TravelMatrix` to calculate departure, travel, arrival,
waiting, viewing start/end, actual fixed buffer, downstream recomputation, and
mechanical totals. It preserves late-window and fixed-buffer-shortfall evidence,
accepts usable degraded travel, keeps `latestEnd` enforcement separate from the
0–1439 representational boundary, and returns runtime-frozen deterministic
results without mutating inputs.

`src/lib/route/evaluateConstraints.ts` and
`src/lib/route/deriveAnchors.ts` provide CE-08 daily hard-constraint evaluation
and anchor derivation. They consume the authoritative CE-07 `SimulationResult`
without recomputing the timeline, enforce fixed appointment timing and required
buffers, evaluate normalized window/flexible compliance and `latestEnd`, preserve
must-visit requirements, and report directed selected-mode travel-data conflicts.
Fixed appointments and configured narrow windows produce deterministic anchors.
Structured violations, conflicts, and anchors are deterministically ordered,
immutable, and repeatable.

CE-08 contains no risk calculation, search, gap insertion, mode enumeration,
taxi-budget enforcement, ranking, provider calls, UI, or multi-day logic.

`src/lib/route/search/types.ts`, `src/lib/route/search/dfsOrders.ts`, and
`test/route/search/dfsOrders.test.ts` provide the replaceable CE-09 daily
candidate-order search boundary, including:

- `DailyPropertyOrder = readonly PropertyId[]` and
  `DailyOrderSearchStrategy`;
- deterministic DFS/backtracking seeded by property input order;
- preservation of every must property in every emitted candidate;
- ordered-subset branching for optional `if_time` properties, with no empty
  candidate emitted for non-empty input;
- an optional external `canExplorePrefix` callback receiving frozen copies of
  prefix and remaining identity arrays;
- pruning of only the rejected prefix and its descendants when the callback
  returns false;
- collision-safe deterministic candidate deduplication and frozen outputs; and
- no property-count hard cap: 4–8 remains scenario/performance guidance only,
  and Gate C remains unresolved.

CE-09 only determines which `PropertyId` orders to explore. It contains no
timeline simulation, constraint or appointment/window feasibility
implementation, anchor/gap insertion, `TravelMatrix` or provider dependency,
transport-mode enumeration or transit assumption, taxi or taxi-budget logic,
risk, ranking, option extraction, `RouteCandidate` assembly, UI, or multi-day
logic.

`src/lib/route/canFitInGap.ts`,
`src/lib/route/search/gapInsertion.ts`,
`test/route/canFitInGap.test.ts`, and
`test/route/search/gapInsertion.test.ts` provide CE-10 daily gap feasibility
and targeted insertion search. `canFitInGap()` is a pure numeric rule that uses
same-day bounded arithmetic to calculate optimistic arrival, wait until the
inserted candidate's normalized `earliestStart`, reject a start after its
inclusive `latestStart`, add viewing duration, onward travel, and the required
boundary buffer, and accept an exact final boundary. Arithmetic that crosses
midnight fails rather than wrapping.

`isGapInsertableProperty()` permits flexible and wide-window properties while
excluding fixed appointments, CE-08 narrow-window anchors, and unconfirmed
properties from targeted CE-10 insertion. CE-08 `deriveAnchors()` remains the
sole narrow-versus-wide classification authority; CE-10 neither recalculates
nor duplicates the configured threshold and does not redefine general CE-09
order-search eligibility.

`generateGapInsertionCandidates()` consumes a caller-supplied base order,
caller-ordered candidate properties, supplied CE-08 anchors, explicit gap
descriptors, and a synchronous caller-supplied optimistic travel lower-bound
resolver. It supports before-first-anchor, between-anchor, and after-last-anchor
attempts; traverses gaps then candidates in supplied order; and emits frozen,
deduplicated `DailyPropertyOrder` values containing exactly one insertion.
Anchor boundaries use onward travel, `anchor.latestStart`, and
`anchor.requiredBufferMinutes`; day-end boundaries use zero onward travel,
zero buffer, and the supplied `latestEnd`.

CE-10 does not consume `TravelMatrix`, choose transport modes, or establish
final route feasibility. Missing lower-bound travel skips only the affected
attempt without zero, reverse, or fabricated fallback. Definitive feasibility
remains later mode enumeration followed by CE-07 simulation and CE-08
constraint evaluation. CE-10 contains no full timeline reconstruction,
constraint/conflict output, risk, taxi behavior, ranking, option extraction,
`RouteCandidate` assembly, UI, or multi-day logic. It has no property-count hard
cap; 4–8 remains scenario/performance guidance and Gate C remains unresolved.

`src/lib/route/calculateRisk.ts` and
`test/route/calculateRisk.test.ts` provide CE-11 deterministic Daily Route
public-transit executability risk calculation. `calculateTransitLegRisk()` is
the pure leg-level rule. It reads all thresholds and points only from
`ROUTE_ENGINE_CONFIG.transitRisk`: transfer threshold/points, walking
threshold/points, warning-buffer threshold/points, high-risk-buffer
threshold/points, and low/medium/high score boundaries. CE-11 duplicates none
of these thresholds in production code.

For a transit leg, the score is the transfer contribution plus the walking
contribution plus exactly one applicable buffer contribution. Transfer and
walking thresholds are inclusive. Buffer thresholds use strict `<` comparison:
the configured high-risk contribution applies below the high-risk threshold;
otherwise the configured warning contribution applies below the warning
threshold. Route integration uses the authoritative CE-07
`RouteStop.bufferMinutes` without recalculating appointment slack. A null buffer
adds no buffer points and emits neither `low_buffer` nor `late_risk`.

Risk codes have deterministic order: `multiple_transfers`, `long_walk`,
`low_buffer`, then `late_risk`. The first two correspond to their configured
inclusive thresholds. `low_buffer` applies to a numeric buffer below the
warning threshold, and `late_risk` additionally applies below the high-risk
threshold without adding points beyond the configured high-risk-buffer
contribution. `late_risk` is risk data, not a feasibility violation or conflict.
CE-11 emits neither `complex_transfer`, because no approved configured
adjustment exists, nor `transit_detour`, whose taxi-value semantics belong to
CE-13. Existing domain codes remain available for their future owners.

Leg and Daily Route levels use the same centralized configured score boundaries:
the configured low range, configured medium score, and configured high
threshold. A selected taxi leg remains represented in route order with zero
CE-11 public-transit risk, low level, and no codes; CE-11 does not inspect taxi
duration, cost, or value.

`calculateRouteRisk()` consumes ordered normalized properties, the authoritative
CE-07 `SimulationResult`, and a precomputed `TravelMatrix`. It validates equal
property/stop counts and matching property identity at every index, with
misalignment throwing `RangeError`. Each leg takes its origin, mode, and buffer
from the CE-07 stop and its destination from the corresponding normalized
property; it does not reconstruct arrival, waiting, viewing times, or buffer.
Selected transit uses only the exact directed origin-to-destination edge.
Available and degraded usable transit are scored identically from supplied
`transferCount` and `walkMeters`, with no degraded-status surcharge. Missing or
unavailable selected transit throws `RangeError`, without reverse, taxi, zero,
or fabricated fallback. Travel-data conflicts remain CE-08 ownership. Selected
taxi legs require no matrix lookup.

Daily `RouteRisk.score` is the sum of leg scores, `RouteRisk.level` is derived
from that daily score using the centralized boundaries, and `RouteRisk.legs`
preserves CE-07 simulation order. This daily scalar is intended to feed the
later `CandidateMetrics.riskPenalty`; CE-11 does not construct candidate metrics
or implement CE-14 ranking. An empty aligned route returns frozen zero/low risk
with no legs. Transit calculator inputs require a non-negative integer transfer
count, finite non-negative walking distance, and a non-negative integer numeric
buffer; malformed internal input throws `RangeError`, not a domain conflict.
Inputs are not mutated; each `LegRisk`, every code array, the legs array, and
`RouteRisk` are frozen; repeated identical inputs produce deeply equal output
with stable leg and code order.

CE-11 daily aggregation does not resolve Gate F, which still governs future
whole-plan/multi-day aggregation choices such as summed daily risk, maximum
daily risk, worst-leg risk, or another representation across Daily Routes.
Gate C also remains unresolved.

`src/lib/route/isModeAllowed.ts`,
`src/lib/route/search/enumerateModes.ts`,
`test/route/isModeAllowed.test.ts`, and
`test/route/search/enumerateModes.test.ts` provide CE-12 transport-mode
legality and deterministic combination search. Rules define truth and search
decides what to explore: `isModeAllowed()` exclusively owns mode-specific
travel-data availability and strategy legality, while
`enumerateModeSequences()` owns exact directed-leg lookup, traversal, and
combination enumeration. Search calls the rule and does not restate its
strategy policy.

The pure legality rule consumes only `TransportStrategy`, `TransportMode`, and
`TravelModeDataStatus`; it has no matrix, property-order, timeline, taxi-budget,
taxi-cost, duration, risk, or ranking input. Available and degraded mode data
are usable subject to strategy, while unavailable mode data is illegal. Transit
and taxi status are checked independently rather than inferred from aggregate
`TravelEdge.dataStatus`, and CE-12 adds no degraded surcharge or fallback.
Usable transit is legal for all three strategies. Usable taxi is illegal in the
main `transit_only` Daily Route enumeration and legal for `transit_first` and
`efficiency_first`. Transit-only taxi backup and Plan B remain deferred.

CE-12 does not inspect `TaxiBudget`, taxi cost, budget amount, or
unset/unlimited/capped policy. CE-13 owns applicable Daily Route taxi-budget
enforcement and taxi value; Gate B remains unresolved only for future
multi-day budget scope.

`TransportModeSequence` is `readonly TransportMode[]`.
`EnumerateModeSequencesInput` supplies a strategy, origin, ordered normalized
properties, and precomputed `TravelMatrix`.
`TransportModeCombinationSearchStrategy` is the replaceable search boundary,
and `exhaustiveModeCombinationSearchStrategy` is the current deterministic
implementation. For N ordered properties, every complete sequence has exactly
N modes: the first represents origin to the first property, and each later mode
represents the preceding ordered property to the current property. No
return-to-origin leg is added.

Enumeration uses only the exact directed origin-to-destination edge and never
falls back to its reverse. A missing edge or an edge with no legal mode prevents
a complete sequence for the supplied order without fabricating data or
producing a conflict. Transit-only usable data yields transit for every
strategy. Taxi-only usable data yields no mode for `transit_only` and taxi for
the two taxi-permitting strategies. With both modes usable, `transit_only`
yields transit, while `transit_first` and `efficiency_first` traverse transit
then taxi. Available and degraded alternatives follow identical legality
semantics.

The current search performs deterministic DFS/backtracking over legs with
per-leg transit-before-taxi traversal and no post-generation sort by duration,
cost, risk, taxi count, transfers, or walking. For two dual-usable
`transit_first` legs it emits, in order, all-transit, transit/taxi,
taxi/transit, and all-taxi. Zero/one/two taxi legs are baseline coverage rather
than a universal cap: three dual-usable legs produce all eight legal sequences,
including the three-taxi sequence. `efficiency_first` may currently enumerate
the same exhaustive legal space rather than inventing a heuristic difference.
Future search strategies may traverse differently without changing legality.

An empty ordered-property input returns exactly one frozen empty assignment,
the combinatorial identity for zero legs; this does not redefine CE-04 Daily
Route cardinality. CE-12 evaluates one caller-supplied property order at a time
and neither calls CE-09/CE-10 property-order search nor selects or ranks an
order. Different orders use their own exact directed legs. CE-16 will
orchestrate order-by-mode candidate evaluation.

CE-12 preserves both one-leg modes for the Case 06 avoid-lateness foundation,
preserves choices regardless of the Case 07 duration difference, preserves
taxi-containing multi-leg sequences for Case 08, provides uncapped Case 09
combination coverage, and provides independent directed mode spaces for Case
10 orders. It emits no taxi-value explanation and makes no feasibility or
ranking decision; remaining behavior stays with CE-13, CE-14, and CE-16 as
mapped.

CE-12 production calls no timeline, constraint, gap, or risk evaluator and
does not prune legal choices using duration, transfer count, walking distance,
risk, taxi value, or budget. Inputs are not mutated, each emitted sequence and
the outer result are frozen, repeated inputs produce deeply equal results in
stable order, and exhaustive results contain no duplicates. No property-count
hard cap or two-taxi cap exists. More than eight legs remain valid; Gate C and
Gate B remain unresolved.

`src/lib/route/evaluateTaxiValue.ts`,
`src/lib/route/evaluateTaxiBudget.ts`,
`test/route/evaluateTaxiValue.test.ts`, and
`test/route/evaluateTaxiBudget.test.ts` provide CE-13 Daily Route taxi-value
explanations and applicable daily taxi-budget evaluation. The responsibilities
remain separate: `evaluateTaxiValue()` explains schedule value from
caller-supplied route evidence, while `evaluateTaxiBudget()` evaluates the
authoritative taxi spend of an already-simulated Daily Route. A route may retain
valid taxi-value evidence while independently receiving
`taxi_budget_exceeded`; CE-13 performs no candidate ranking.

The approved daily budget rule treats `unset` as no explicit Daily Route hard
cap without rewriting it to `unlimited`; `unlimited` explicitly accepts no
daily hard cap; and `capped` accepts authoritative
`simulation.totals.taxiCost` exactly when it is less than or equal to the cap.
Aggregate daily taxi cost, not per-leg checks, controls validity. This rule is
Daily Route-only and does not resolve Gate B's future multi-day budget scope.

Taxi-value evaluation consumes aligned caller-supplied `SimulationResult` and
`ConstraintEvaluation` evidence plus a precomputed directed `TravelMatrix`.
It performs no internal simulation or constraint reevaluation. It implements
same-position full-timeline `avoid_late`, centralized-threshold
`transit_detour`, and causal route-level `unlock_extra_viewing`. Unlock requires
an optional same-order, already-simulated `candidateTransitCounterfactual` in
which candidate taxi legs become transit, non-taxi modes and directed origins
remain unchanged, and relevant appointment/window/end-time timing evidence
proves the same complete route infeasible without taxi. Missing counterfactual
evidence, a feasible transit counterfactual, or unrelated hard conflicts do not
support an unlock claim.

CE-13 returns frozen deterministic outputs without mutating evidence. Its 38
taxi-value tests and 16 taxi-budget tests provide 54 CE-13 tests; all 403
repository tests across 18 files pass. CE-13 contains no search, mode
enumeration, internal simulation, constraint reevaluation, risk or candidate
ranking, option extraction, `RouteCandidate` assembly, provider calls,
minutes-per-money scoring, Plan B, UI, storage, network, or multi-day budget
logic.

`src/lib/route/rankRoutes.ts` and `test/route/rankRoutes.test.ts` provide CE-14
deterministic Daily Route ranking for already-constructed `RouteCandidate`
values. `compareRouteCandidates(left, right)` is a pure deterministic
comparator: a negative result ranks `left` first, zero means all seven confirmed
hierarchy metrics are equal, and a positive result ranks `right` first.
`rankRoutes(candidates)` ranks every supplied candidate without filtering,
mutation, cloning, candidate assembly, or lower-level evidence recomputation.

Ranking evidence comes only from the existing authoritative fields. CE-14 reads
`hardViolationCount`, `riskPenalty`, and `experiencePenalty` from
`candidate.metrics`; it reads `mustCompletedCount`, `completedCount`,
`totalTravelMinutes`, and `taxiCost` from `candidate.simulation.totals`. It does
not duplicate these values or derive them again from stops, risks, violations,
conflicts, travel data, or explanations.

The exact lexicographic hierarchy is fewer hard violations, more must
completions, more total completions, lower risk penalty, lower total travel
time, lower taxi cost, and lower experience penalty. A lower-level advantage
can never compensate for a worse higher-level metric. No weighted, normalized,
composite, cost-per-minute, minutes-per-currency, or opaque ranking score
exists.

When all seven fields tie, the comparator returns zero and `rankRoutes()` uses
original input index only to preserve caller-supplied order. Input index is not
a metric, domain preference, or eighth business field. Exact ties do not use
candidate ID, property order, transport modes, status, estimated end,
waiting time, taxi-leg count, `RouteRisk` metadata, explanations, or
violation/conflict ordering. Candidate ID lexical order is not policy.

CE-14 validates internal ranking evidence. Count fields must be non-negative
integers; penalty, time, and cost fields must be finite and non-negative.
Malformed evidence throws `RangeError` rather than becoming `invalid_input`.
`rankRoutes()` accepts readonly input, returns a new frozen outer array,
preserves the original candidate references and stable tie order, and is
repeatable. Empty input returns a new frozen empty array; one candidate returns
a new frozen one-element array containing that same reference.

CE-14 contains no candidate generation, search, timeline simulation,
constraint evaluation, risk recalculation, taxi-value or taxi-budget
evaluation, candidate assembly, provider or matrix access, option extraction,
same-agent behavior, UI, storage, network, or multi-day logic. Case 12 remains
deferred/P1. Its 56 focused tests bring the repository total to 459 tests
across 19 files; focused Vitest, the full suite, lint, TypeScript checking,
`git diff --check`, and source-boundary audits pass.

Current source uses the clarified daily-route contract names:

- `DayPlanSettings`
- `DayRouteOptimizationResult`

No concrete multi-day source contract, daily optimizer, or multi-day optimizer
exists yet.

## 5. Module ownership and dependency boundaries

Expected responsibility boundaries, with exact future filenames finalized by
the relevant CE task:

```text
src/lib/route/
  daily route business/domain rules
  search/
    replaceable daily candidate-generation/search strategy

src/lib/plan/
  multi-day business/domain rules and aggregation
  search/
    replaceable Day Assignment search

src/lib/travel/
  TravelTimeProvider contracts and implementations
  travel-data acquisition and failures
  TravelEdge / TravelMatrix construction
```

Rules define truth; search decides what to explore. In particular:

- gap feasibility is a pure rule; deciding which property/gap to try is search;
- transport-mode legality and budget validity are rules; combination enumeration is search;
- timeline simulation, constraints, risk, taxi value, ranking, and explanations are rules;
- DFS/backtracking, Branch and Bound, Beam Search, and solvers are replaceable strategies.

`src/lib/route/` must not depend on `TravelTimeProvider`. Provider calls occur
only in the travel acquisition/matrix-construction layer and never in Day
Assignment, route search, simulation, or ranking.

## 6. CE ledger

### CE-00 — Pure TypeScript test foundation

- **Status:** COMPLETE
- **Prerequisites:** None.
- **Goal:** Establish deterministic pure-TypeScript testing before route rules.
- **Scope:** Vitest dependency, `test` script, and minimal TypeScript harness test.
- **Likely ownership:** `package.json`, `package-lock.json`, `test/route/testHarness.test.ts`.
- **Deterministic tests:** Harness smoke test.
- **Mapped TEST_CASES:** None; infrastructure only.
- **Decision Gates:** None.
- **Definition of done:** `vitest run`, lint, and TypeScript checking pass with no UI-testing dependency or unnecessary Vitest config.
- **Non-goals:** UI testing, route models, product behavior.
- **Future-scale notes:** Test foundation must support both route and plan test directories.

### CE-01 — Route domain models and centralized configuration

- **Status:** COMPLETE
- **Prerequisites:** CE-00.
- **Goal:** Define strict daily-route vocabulary, invariants, and configurable thresholds without implementing behavior.
- **Scope:** Current route types, route config, and deterministic config tests.
- **Likely ownership:** `src/lib/route/types.ts`, `src/lib/route/config.ts`, `test/route/config.test.ts`.
- **Deterministic tests:** Config values, naming intent, invariants, frozen objects.
- **Mapped TEST_CASES:** Foundational contracts for Cases 01–11, 13, 16, 17; no behavioral acceptance yet.
- **Decision Gates:** Taxi behavior remains deferred to CE-13; partial daily-result policy remains as currently modeled.
- **Definition of done:** Current CE-01 tests and repository checks pass; one-property input is not invalidated; risk and violation sources are not duplicated.
- **Non-goals:** Date parsing, normalization, search, providers, multi-day types.
- **Future-scale notes:** `coreScenarioPropertyCountMinimum/Maximum` are guidance, not validation limits.

### CE-01.1 — Clarify daily-route contracts

- **Status:** COMPLETE
- **Prerequisites:** CE-01 and approved documentation migration.
- **Goal:** Remove daily-versus-multi-day naming ambiguity before CE-02.
- **Scope:** Rename the historical pre-CE-01.1 daily contract names `PlanSettings` to `DayPlanSettings` and `OptimizationResult` to `DayRouteOptimizationResult`; update current source references only.
- **Likely ownership:** `src/lib/route/types.ts` and any compile-time references discovered by the task.
- **Deterministic tests:** Existing tests plus TypeScript compilation; add a focused type test only if needed to make the rename reviewable.
- **Mapped TEST_CASES:** None; contract naming only.
- **Decision Gates:** None.
- **Definition of done:** Both renames compile; fields/invariants are unchanged; full tests, lint, type checking, and `git diff --check` pass.
- **Non-goals:** `optimizeDayRoute()`, date logic, multi-day contracts, `eligibleDays`, business-rule changes.
- **Future-scale notes:** Keep `RouteCandidate`, `RouteOption`, `RouteStop`, and `SimulationResult` unchanged.

### CE-02 — Deterministic date/time primitives

- **Status:** COMPLETE
- **Prerequisites:** CE-01.1.
- **Goal:** Provide strict, deterministic primitives for independent daily time axes and ordered calendar dates.
- **Scope:** Strict `YYYY-MM-DD` validation, deterministic date comparison/ordering, strict `HH:mm` parsing, `MinuteOfDay` bounds, same-day arithmetic, and explicit overflow/no-wrap results.
- **Likely ownership:** `src/lib/route/dateTime.ts` or equivalent pure module; `test/route/dateTime.test.ts`.
- **Deterministic tests:** Valid/invalid leap dates, malformed formats, minute boundaries 0/1439, overflow at midnight, non-consecutive date ordering, no locale/timezone/current-time dependence.
- **Mapped TEST_CASES:** Date/time foundations for Cases 03 and 18–25.
- **Decision Gates:** None.
- **Definition of done:** Helpers are pure and deterministic; no `Date.now()`, locale parser, timezone dependency, or silent midnight wrap; all repository checks pass.
- **Non-goals:** Property eligibility, window normalization, multi-day types.
- **Future-scale notes:** Date collections must not assume consecutive days or a three-day maximum.

### CE-03 — Day-scoped time-window normalization

- **Status:** COMPLETE
- **Prerequisites:** CE-02.
- **Goal:** Normalize viewing-time input for one explicit target date.
- **Scope:** Fixed/window/flexible/finish-before normalization; recomputation after duration change; distinguish normalized, unconfirmed, and not-eligible-for-target-day results.
- **Likely ownership:** `src/lib/route/normalizeWindows.ts`; `test/route/normalizeWindows.test.ts`.
- **Deterministic tests:** Exact windows, date mismatch, duration-derived latest start, boundary times, flexible use of daily planning window.
- **Mapped TEST_CASES:** Cases 02–03; date-scoped support for Cases 18 and 24.
- **Decision Gates:** CE-03 must not decide undated unconfirmed-property eligibility; Gate E closes that policy before CE-17 eligibility rules are finalized.
- **Definition of done:** Tests are written alongside implementation; no multi-day assignment occurs; malformed and not-eligible states are distinct; all checks pass.
- **Non-goals:** Whole-plan eligibility derivation, route validation, search.
- **Future-scale notes:** Function behavior depends on a target date, not plan length.

### CE-04 — Day-route input validation

- **Status:** COMPLETE
- **Prerequisites:** CE-02 and CE-03.
- **Goal:** Reject malformed daily input without treating valid multi-day product input as invalid.
- **Scope:** Exactly one target date, daily availability bounds, assigned-property date compatibility, valid durations/settings, one-property validity, unique exact-string `PropertyId` identities within the Daily Route collection, and required matrix identities where appropriate.
- **Implemented ownership:** `src/lib/route/validateDayRouteInput.ts`; `test/route/validateDayRouteInput.test.ts`.
- **Deterministic tests:** 43 CE-04 tests covering mixed dates in one daily call, one valid property, invalid same-day ranges, empty/malformed inputs, no midnight wrap, exact-string duplicate-ID detection after the first valid occurrence, stable multiple-duplicate ordering, invalid IDs excluded from duplicate tracking, duplicate-address allowance for distinct IDs, and no property-count hard cap.
- **Mapped TEST_CASES:** Case 17; daily boundary used by Cases 18, 22, 24, 25.
- **Decision Gates:** None; multi-day partial/failure semantics belong to Gate I and CE-17/20.
- **Definition of done:** A daily call rejects mixed dates locally; multi-date plans are not globally rejected; one-property input remains valid; `PropertyId[]` route/search identities are structurally unambiguous; all 43 CE-04 tests and repository checks pass.
- **Non-goals:** Day Assignment, multi-day validation, timeline simulation.
- **Future-scale notes:** No property-count maximum derived from V0.1A guidance.

### CE-05 — Travel-data contracts and matrix builder

- **Status:** COMPLETE
- **Prerequisites:** CE-01.1 and S1 documentation boundary.
- **Goal:** Define travel acquisition contracts and deterministic matrix construction outside the route engine.
- **Scope:** Travel provider abstraction, travel edge/matrix contracts, requested node-pair coverage, builder behavior, explicit missing/degraded data, and provider-failure handling at the acquisition boundary.
- **Likely ownership:** `src/lib/travel/types.ts`, `src/lib/travel/TravelTimeProvider.ts`, `src/lib/travel/buildTravelMatrix.ts`, `test/travel/*`.
- **Deterministic tests:** Provider calls occur only while building; each required pair is represented or explicitly unavailable; failure/degraded states are not fabricated.
- **Mapped TEST_CASES:** Case 16 foundations.
- **Decision Gates:** Gate D may affect which daily origins a future multi-day acquisition request needs; do not settle it here.
- **Definition of done:** `src/lib/route/` has no provider dependency; matrix is precomputed and immutable/read-only to optimizers; all checks pass.
- **Non-goals:** Mock fixture data, route search, map APIs, real geocoding.
- **Future-scale notes:** Builder may later batch/cache without changing matrix consumer contracts.

### CE-06 — Deterministic mock provider and matrix fixtures

- **Status:** COMPLETE
- **Prerequisites:** CE-05.
- **Goal:** Supply deterministic transit/taxi data for every later route and plan test.
- **Scope:** Mock provider, explicit matrix fixtures, missing/degraded-data fixtures, reusable daily and multi-day scenario builders.
- **Likely ownership:** `src/lib/travel/MockTravelTimeProvider.ts`, `test/fixtures/travel/*`, focused travel tests.
- **Deterministic tests:** Exact times/costs/transfers/walking, repeatability, complete pair coverage, explicit absent data.
- **Mapped TEST_CASES:** Fixture support for Cases 01–11, 13, 16–25.
- **Decision Gates:** None.
- **Definition of done:** Repeated inputs yield identical matrices; no network/API access; all checks pass.
- **Non-goals:** Real provider, search, ranking, UI.
- **Future-scale notes:** Fixtures must remain independent from a particular search traversal.

### CE-07 — Daily timeline simulation

- **Status:** COMPLETE
- **Prerequisites:** CE-02, CE-03, CE-04, CE-05, CE-06.
- **Goal:** Simulate a complete same-day route for a supplied order and legal mode sequence.
- **Scope:** Departure, travel, arrival, waiting, viewing start/end, buffers, estimated end, travel/wait totals, taxi cost/count, and downstream recomputation.
- **Implemented ownership:** `src/lib/route/simulateTimeline.ts`; `test/route/simulateTimeline.test.ts`.
- **Deterministic tests:** 26 CE-07 tests covering fixed appointments, actual fixed buffer, ordinary/flexible/unconfirmed waiting, late-window mechanical visibility, exact travel and taxi totals, degraded/unavailable travel, downstream recomputation, waiting absorption, `latestEnd` non-truncation, the exact 1439 boundary, no midnight wrap, input/output immutability, and repeatability.
- **Mapped TEST_CASES:** Cases 01–03 and timeline foundations for Cases 06–10.
- **Decision Gates:** None.
- **Definition of done:** Full same-day simulation is pure and deterministic; every downstream time is recomputed; no provider calls; 26 CE-07 tests and 154 total tests across 8 files pass; `npm test`, `npm run lint`, `npx tsc --noEmit`, and `git diff --check` pass.
- **Non-goals:** Feasibility verdicts, constraint/conflict evaluation, risk, taxi-value logic, ranking, search, provider calls, UI, and multi-day logic; none are implemented in CE-07.
- **Future-scale notes:** Simulation API must be reusable by any search strategy.

### CE-08 — Daily constraints, anchors, and conflicts

- **Status:** COMPLETE
- **Prerequisites:** CE-07.
- **Goal:** Evaluate daily hard constraints and derive time anchors independently from search.
- **Scope:** Window/appointment/latest-end checks, must-visit preservation, buffer inclusion, travel-data conflicts, anchor derivation, structured violations/conflicts.
- **Implemented ownership:** `src/lib/route/evaluateConstraints.ts`; `src/lib/route/deriveAnchors.ts`; `test/route/evaluateConstraints.test.ts`; `test/route/deriveAnchors.test.ts`.
- **Deterministic tests:** 39 CE-08 tests covering fixed appointment pass/failure, the exact buffer boundary, late fixed-issue deduplication, conflicting fixed appointments, normalized window/flexible/unconfirmed behavior, `latestEnd`, must-visit preservation, missing/unavailable/degraded/provider-failure travel data, fixed and narrow-window anchors, the inclusive anchor threshold, deterministic issue and anchor ordering, input/output immutability, and repeatability.
- **Mapped TEST_CASES:** Cases 01–02 and 11; foundations for Case 04.
- **Decision Gates:** None.
- **Definition of done:** Rules consume the authoritative CE-07 `SimulationResult` and return structured deterministic outcomes; must-visits are never silently removed; 39 CE-08 tests and 193 total repository tests across 10 files pass; `npm test`, `npm run lint`, `npx tsc --noEmit`, and `git diff --check` pass.
- **Non-goals:** Timeline recomputation, risk calculation, `late_risk` feasibility, candidate search, gap insertion, mode enumeration, taxi-budget enforcement, ranking, provider calls, UI, and multi-day logic; none are implemented in CE-08.
- **Future-scale notes:** Evaluators remain traversal-agnostic.

### CE-09 — Daily candidate-order search

- **Status:** COMPLETE
- **Prerequisites:** CE-08.
- **Goal:** Generate deterministic daily property-order candidates through a replaceable search boundary.
- **Scope:** Search interface, initial DFS/backtracking traversal, deterministic ordering, pruning by pure constraint/feasibility callbacks, candidate deduplication.
- **Implemented ownership:** `src/lib/route/search/types.ts`; `src/lib/route/search/dfsOrders.ts`; `test/route/search/dfsOrders.test.ts`.
- **Deterministic tests:** 23 CE-09 tests covering empty input, one optional, one must, exact two-optional DFS traversal, two must, must plus optional, 15 candidates for three optional properties, 11 candidates for one must plus two optional properties, fixed-order non-prefiltering, Case 01 order foundations, Case 10 alternate-order preservation, Case 11 must preservation, prefix pruning, frozen callback contexts, callback repeatability, collision-safe candidate deduplication, input/output immutability, search repeatability, nine-property no-hard-cap behavior, status neutrality, agent neutrality, and strategy-interface replacement.
- **Mapped TEST_CASES:** Cases 01, 10, 11; preparation for Case 04.
- **Decision Gates:** Gate C records future search crossover but does not block V0.1A DFS.
- **Definition of done:** DFS is replaceable, deterministic, input-order seeded, must-preserving, and produces frozen deduplicated `PropertyId` orders; 23 CE-09 tests and 219 total repository tests across 11 files pass; `npm test`, `npm run lint`, `npx tsc --noEmit`, and `git diff --check` pass.
- **Non-goals:** Timeline simulation, constraint implementation, appointment/window feasibility, anchor/gap insertion, `TravelMatrix` or provider dependency, transport-mode enumeration, transit assumptions, taxi/taxi-budget logic, risk, ranking, cheapest/recommended/fastest extraction, `RouteCandidate` assembly, UI, and multi-day logic; none are implemented in CE-09.
- **Future-scale notes:** Strategy interface must support later Branch and Bound, Beam Search, or solver replacement.

### CE-10 — Daily gap feasibility and insertion-search integration

- **Status:** COMPLETE
- **Prerequisites:** CE-08 and CE-09.
- **Goal:** Use appointment gaps without collapsing feasibility rules into search.
- **Scope:** Pure numeric `canFitInGap()` rule, anchor-owned insertion eligibility, and deterministic search integration deciding which explicit property/gap attempts to explore.
- **Implemented ownership:** `src/lib/route/canFitInGap.ts`; `src/lib/route/search/gapInsertion.ts`; `test/route/canFitInGap.test.ts`; `test/route/search/gapInsertion.test.ts`.
- **Pure gap rule:** Calculate `arrivalAtCandidate = currentEnd + travelToCandidateMinutes`; calculate `candidateViewingStart = max(arrivalAtCandidate, candidateEarliestStart)`; reject when `candidateViewingStart > candidateLatestStart`; calculate `candidateViewingEnd = candidateViewingStart + candidateViewingDurationMinutes`; then require `candidateViewingEnd + travelToNextAnchorMinutes + safetyBufferMinutes <= nextAnchorLatestTime`. All additions are same-day bounded, the candidate and final latest-start boundaries are inclusive, and cross-midnight arithmetic fails rather than wrapping.
- **Candidate-window semantics:** Gap feasibility consumes the inserted candidate's already-normalized start window, waits until `earliestStart` after an earlier optimistic arrival, and rejects deterministic arrival after `latestStart`. It reuses CE-03/CE-07 timing semantics and does not re-normalize raw input. This behavior was corrected during external review because ignoring candidate waiting could emit an insertion that made the next appointment late.
- **Insertion eligibility:** `isGapInsertableProperty()` accepts flexible and wide-window targeted insertions and rejects fixed appointments, narrow-window anchors, and unconfirmed properties. CE-08 `deriveAnchors()` is the source of truth for narrow versus wide; CE-10 does not use or duplicate the configured width threshold, and this helper does not redefine general CE-09 order-search eligibility.
- **Search boundary:** `generateGapInsertionCandidates()` consumes a caller-supplied `DailyPropertyOrder`, caller-ordered candidate properties, supplied CE-08 anchors, explicit gap descriptors, and a synchronous caller-supplied admissible/optimistic travel lower-bound resolver. It returns frozen `DailyPropertyOrder` values only, performs exactly one insertion per emitted order, does not emit the unchanged base order, and traverses supplied gaps before supplied candidates without ranking or sorting.
- **Gap boundaries:** Anchor boundaries require onward travel and use `anchor.latestStart` with `anchor.requiredBufferMinutes`. Day-end boundaries use zero onward travel, zero buffer, and the supplied daily `latestEnd`. The contracts support before-first-anchor, between-anchor, and after-last-anchor attempts.
- **Travel lower bounds:** CE-10 imports no `TravelMatrix`, chooses neither transit nor taxi, and receives travel values only from the synchronous resolver. The optimistic/admissible bound determines only whether an order is worth exploring, not final route feasibility. Null travel skips the affected attempt without zero fallback, reverse fallback, or fabrication. Definitive feasibility remains later mode enumeration, CE-07 simulation, and CE-08 constraint evaluation.
- **Structural search behavior:** `insertionIndex` must be an integer in `0..baseOrder.length`; invalid values throw `RangeError`. A property already in the base order is skipped. Candidate orders use collision-safe deduplication with the first traversal occurrence preserved. Inputs are not mutated, and every output order plus the outer output array is frozen. No hard property-count cap exists; 4–8 remains scenario/performance guidance only.
- **Deterministic tests:** 18 pure-rule/eligibility tests and 26 search tests, 44 CE-10 tests total. Coverage includes exact fit, one-minute miss, candidate-window waiting failure and exact fit, candidate `latestStart` miss and inclusive boundary, same-day overflow, flexible and wide-window eligibility, fixed/narrow/unconfirmed exclusion, before/between/after insertion, wide-window waiting failure and success, wide-window own-`latestStart` failure, flexible earliest-start waiting, null lower bounds, deterministic resolver invocation and gap-by-candidate traversal, deduplication, already-present-property skipping, status/agent/importance neutrality, more-than-eight no-hard-cap behavior, immutability, freezing, and repeatability.
- **Mapped TEST_CASES:** Case 04 acceptance foundation, including a genuine prior-anchor/next-anchor between-gap fixture, before/between/after insertion, exact final fit, one-minute final miss, travel to candidate, viewing duration, onward travel, required anchor buffer, narrow-anchor zero buffer, candidate-window waiting, candidate own-latest-start enforcement, and next-appointment non-lateness. Integrated Case 04 completion remains CE-16.
- **Decision Gates:** None. Gate C remains unresolved and no property-count crossover, search-strategy threshold, or `maxCandidates` policy is introduced.
- **Definition of done:** Pure feasibility tests pass independently of insertion traversal; inserted candidates respect their own normalized windows and do not make the next boundary late; 44 CE-10 tests and 263 total repository tests across 13 files pass; `npm test`, `npm run lint`, `npx tsc --noEmit`, and `git diff --check` pass.
- **Non-goals:** Full timeline reconstruction; `SimulationResult` or `RouteStop` construction; `TravelMatrix` or provider dependency; transport-mode enumeration; transit or taxi assumptions; taxi-budget logic; constraint/conflict-result generation; risk; ranking; cheapest/recommended/fastest extraction; `RouteCandidate` assembly; UI; and multi-day logic. Rules define truth; search decides what to explore.
- **Future-scale notes:** Another search may reuse the same gap evaluator.

### CE-11 — Transit risk

- **Status:** COMPLETE
- **Prerequisites:** CE-07 and centralized CE-01 config.
- **Goal:** Calculate Daily Route/leg transit risk independently from feasibility and search.
- **Scope:** Transfers, walking, buffer thresholds, risk codes/levels, candidate risk metric inputs.
- **Implemented ownership:** `src/lib/route/calculateRisk.ts`; `test/route/calculateRisk.test.ts`.
- **Centralized configuration:** `calculateTransitLegRisk()` reads transfer threshold/points, walking threshold/points, warning-buffer threshold/points, high-risk-buffer threshold/points, and low/medium/high score boundaries only from `ROUTE_ENGINE_CONFIG.transitRisk`; no threshold is duplicated in CE-11 production code.
- **Pure leg rule:** Transit score is transfer contribution plus walking contribution plus exactly one applicable buffer contribution. Transfer and walking thresholds are inclusive. Buffer thresholds are strict: below the configured high-risk threshold receives high-risk buffer points; otherwise below the configured warning threshold receives warning points; otherwise the buffer contribution is zero. A null buffer contributes zero and produces no buffer code. Transit numeric inputs require a non-negative integer transfer count, finite non-negative walking distance, and a non-negative integer numeric buffer; malformed internal input throws `RangeError` rather than producing a domain conflict.
- **Buffer and risk-code semantics:** Route integration consumes authoritative CE-07 `RouteStop.bufferMinutes` and never recalculates appointment slack. Codes are emitted in stable order: `multiple_transfers` when the transfer threshold is reached or exceeded, `long_walk` when the walking threshold is reached or exceeded, `low_buffer` for a numeric buffer below the warning threshold, and `late_risk` for a numeric buffer below the high-risk threshold. `late_risk` adds no points beyond the high-risk-buffer contribution and remains risk data rather than a violation or conflict. CE-11 emits neither `complex_transfer`, for which no approved configured adjustment exists, nor `transit_detour`, whose taxi-value semantics belong to CE-13.
- **Levels and taxi legs:** Leg and Daily Route levels derive from the same centralized low range, medium score, and high threshold. CE-11 represents each selected taxi leg as zero score, low level, and no codes without inspecting taxi duration, cost, or value; taxi recommendation/value remains CE-13.
- **Route input and alignment:** `calculateRouteRisk()` consumes ordered normalized properties, authoritative CE-07 `SimulationResult`, and a precomputed `TravelMatrix`. Stop count must equal property count and each stop property identity must match the property at the same index; misalignment throws `RangeError`. Leg origin, mode, and buffer come from the CE-07 stop, while destination comes from the current normalized property's `locationId`; CE-11 does not reconstruct timeline fields or buffer.
- **Directed travel and availability:** Selected transit uses only the exact directed origin-to-destination matrix edge. Available and degraded usable transit are scored identically from supplied transfer and walking metrics, with no status surcharge. Missing or unavailable selected transit throws `RangeError`, with no reverse, taxi, zero, or fabricated fallback; CE-08 remains the travel-data conflict owner. Selected taxi legs require no matrix lookup.
- **Daily aggregation:** Daily `RouteRisk.score` is the sum of leg scores, its level comes from the same configured boundaries, and legs preserve CE-07 simulation order. The scalar score is intended to feed later `CandidateMetrics.riskPenalty`; no candidate metric, `RouteCandidate`, or ranking is created in CE-11. An empty aligned route returns frozen zero/low risk with an empty legs array.
- **Case 05 foundation:** Reviewed Option A uses transit with two transfers, 900 m walking, and a five-minute buffer, yielding score 5, high level, and `multiple_transfers`, `long_walk`, `low_buffer`, `late_risk`. Option B uses direct transit, walking below the threshold, and a 15-minute buffer, yielding score 0, low level, and no codes. Option A has higher CE-11 risk, but CE-11 does not select or recommend Option B; final preference remains CE-14 scope and integrated Case 05 completion remains CE-14 plus CE-16.
- **Deterministic tests:** 42 CE-11 tests cover Case 05 risk values; transfer and walking thresholds below/exact/above; warning- and high-risk-buffer exact boundaries; low/medium/high level boundaries; null buffer; taxi zero risk; code order; absence of `complex_transfer` and `transit_detour`; invalid numeric inputs; available and degraded transit; exact directed lookup and no reverse fallback; missing and unavailable selected transit; route aggregation; mixed transit/taxi; taxi without matrix lookup; empty route; count and property-order mismatch; more-than-eight no-hard-cap behavior; input immutability; runtime freezing; repeatability; and `late_risk` remaining risk-only. All 305 repository tests across 14 files pass.
- **Mapped TEST_CASES:** Case 05.
- **Decision Gates:** Gate F remains unresolved because it governs future whole-plan aggregation across Daily Routes, including sum, maximum daily risk, worst leg, or another representation; CE-11 decides only additive leg risk within one Daily Route. Gate C also remains unresolved, and CE-11 introduces no Decision Gate.
- **Definition of done:** Risk is deterministic, config-driven, immutable, and independent of feasibility and search. The focused CE-11 Vitest, `npm test`, `npm run lint`, `npx tsc --noEmit`, and `git diff --check` pass.
- **Non-goals:** Timeline reconstruction; hard feasibility evaluation; `Violation` or `Conflict` generation; candidate search; property-order or transport-mode enumeration; risk-based pruning; candidate ranking; cheapest/recommended/fastest selection; taxi value; taxi-budget enforcement; `RouteCandidate` assembly; option extraction; provider calls; network; UI; storage; multi-day risk aggregation; hard property-count caps; and dynamic prediction. None are implemented in CE-11.
- **Future-scale notes:** Risk API remains reusable by alternate searches.

### CE-12 — Transport-mode legality and combination search

- **Status:** COMPLETE
- **Prerequisites:** CE-05, CE-07, CE-08, CE-09.
- **Goal:** Jointly explore daily order/mode candidates while separating legal truth from enumeration.
- **Scope:** Pure mode availability/strategy legality rules; replaceable enumeration of legal transit/taxi sequences; transit-first baseline coverage of zero, one, and two taxi legs plus other necessary key combinations.
- **Implemented ownership:** `src/lib/route/isModeAllowed.ts`; `src/lib/route/search/enumerateModes.ts`; `test/route/isModeAllowed.test.ts`; `test/route/search/enumerateModes.test.ts`.
- **Rule/search separation:** Rules define truth and search decides what to explore. Pure `isModeAllowed()` owns mode-specific availability and strategy legality. `enumerateModeSequences()` owns exact directed-edge lookup, deterministic traversal, and combination enumeration; it calls the rule and does not redefine legality.
- **Legality input and availability:** `isModeAllowed()` consumes only `TransportStrategy`, `TransportMode`, and `TravelModeDataStatus`, with no matrix, property-order, timeline, taxi-budget, taxi-cost, duration, risk, or ranking input. Available and degraded alternatives are usable subject to strategy; unavailable is illegal. Transit and taxi status are evaluated independently rather than through aggregate edge status, with no degraded surcharge or fallback.
- **Strategy semantics:** Usable transit is legal under `transit_only`, `transit_first`, and `efficiency_first`. Usable taxi is illegal for the main `transit_only` Daily Route and legal under `transit_first` and `efficiency_first`. Transit-only taxi backup and Plan B are deferred. CE-12 does not inspect or enforce `TaxiBudget`, taxi cost, budget amounts, or unset/unlimited/capped policy; CE-13 owns Daily Route taxi budget and value, while Gate B remains unresolved for future multi-day scope.
- **Enumeration contracts:** `TransportModeSequence` is `readonly TransportMode[]`. `EnumerateModeSequencesInput` contains strategy, origin, ordered normalized properties, and precomputed `TravelMatrix`. `TransportModeCombinationSearchStrategy` is the replaceable boundary and `exhaustiveModeCombinationSearchStrategy` is the current deterministic implementation.
- **Leg and direction invariants:** Every complete sequence has one mode per ordered property. Index zero represents origin to the first property; later indices represent the preceding ordered property to the current property; no return leg is added. Search uses the exact directed edge with no reverse fallback. A missing edge or leg with no legal mode yields no complete sequence for that order, without fabrication or conflict generation.
- **Mode-specific combinations:** Transit-only usable data yields transit under every strategy. Taxi-only usable data yields no mode under `transit_only` and taxi under the two taxi-permitting strategies. Both usable modes yield transit under `transit_only` and transit then taxi under `transit_first` and `efficiency_first`; available and degraded statuses behave identically.
- **Deterministic traversal:** Exhaustive DFS/backtracking explores transit before taxi per leg and performs no post-generation sorting by duration, cost, risk, taxi count, transfers, or walking. Two dual-usable `transit_first` legs emit exactly `[transit, transit]`, `[transit, taxi]`, `[taxi, transit]`, `[taxi, taxi]`. Three dual-usable legs emit eight sequences including `[taxi, taxi, taxi]`; zero/one/two taxi legs are baseline coverage, not a cap, and no `maxTaxiLegs` or equivalent policy exists. `efficiency_first` may enumerate the same exhaustive space, while future search strategies may traverse the legal space differently without changing truth.
- **Empty order and supplied-order boundary:** Empty `orderedProperties` returns exactly one frozen empty assignment. This is a combinatorial identity and does not change CE-04 input cardinality. Enumeration consumes one supplied order and calls neither daily order generation nor gap insertion. Different supplied orders use their own directed legs; CE-12 neither selects nor ranks an order, and CE-16 later orchestrates order-by-mode evaluation.
- **Cases 06–10 foundation:** Case 06 retains both usable one-leg assignments for later avoid-lateness evaluation; Case 07 retains both modes regardless of the 55-versus-18-minute duration difference without emitting `transit_detour`; Case 08 preserves taxi-containing multi-leg sequences for later completion evaluation; Case 09 provides exact two-leg baseline and uncapped three-leg coverage; Case 10 gives different supplied orders their own directed mode spaces without choosing a winner. Taxi value remains CE-13, ranking remains CE-14, and integrated simulation/evaluation remains CE-16.
- **Immutability and scale:** Inputs are unchanged, every emitted sequence and the outer array are frozen, repeated inputs are deeply equal in identical order, and exhaustive output has no duplicates. No property-count cap exists; the reviewed more-than-eight test uses one legal mode per leg to avoid unnecessary exponential test size. Gate C remains unresolved.
- **Deterministic tests:** 18 legality tests and 26 enumeration tests, 44 CE-12 tests total. Coverage includes the complete strategy/mode/status matrix; available, degraded, and unavailable data; transit-only, taxi-only, taxi-only degraded, both-unavailable, and provider-failure edges; missing directed edges and no reverse fallback; origin-first, previous-property-later, and no-return semantics; empty and one-property orders; exact two-leg DFS order; eight three-leg combinations and the all-taxi sequence; exhaustive `efficiency_first`; Cases 06–10 foundations; no duration, transfer, walking, risk, or value pruning; more-than-eight no-hard-cap behavior; input immutability; output freezing; repeatability; uniqueness; and the replaceable strategy interface. All 349 repository tests across 16 files pass.
- **Mapped TEST_CASES:** Cases 06–10.
- **Decision Gates:** Gate B remains unresolved for future multi-day taxi-budget scope, and Gate C remains unresolved for future search crossover. CE-12 introduces no new gate and interprets no budget policy.
- **Definition of done:** Legality tests pass independently; exhaustive search invokes legality, emits no illegal modes, and treats zero/one/two taxi legs as baseline rather than a cap. Focused CE-12 Vitest, `npm test`, `npm run lint`, `npx tsc --noEmit`, and `git diff --check` pass.
- **Non-goals:** Type/config changes; property-order generation; timeline simulation; feasibility pruning; `Violation` or `Conflict` generation; risk calculation; taxi value; taxi-budget enforcement; candidate ranking; cheapest/recommended/fastest selection; `RouteCandidate` assembly; option extraction; provider calls; network; UI; storage; multi-day logic; hard property caps; and a universal two-taxi cap. None are implemented in CE-12.
- **Future-scale notes:** Large combination spaces may use stronger search without changing legality.

### CE-13 — Taxi value and budget behavior

- **Status:** COMPLETE
- **Prerequisites:** CE-07, CE-08, CE-11, CE-12.
- **Goal:** Enforce the applicable daily taxi budget and explain high-value taxi legs.
- **Scope and responsibility separation:** CE-13 contains two independent Daily Route rules. `evaluateTaxiValue()` explains schedule value for caller-supplied taxi-containing route evidence; `evaluateTaxiBudget()` evaluates the applicable taxi budget of an already-simulated Daily Route. Taxi value does not consume budget, budget evaluation does not inspect value reasons, a route may have valid taxi-value evidence while independently receiving `taxi_budget_exceeded`, and neither rule ranks candidates.
- **Implemented ownership:** `src/lib/route/evaluateTaxiValue.ts`; `src/lib/route/evaluateTaxiBudget.ts`; `test/route/evaluateTaxiValue.test.ts`; `test/route/evaluateTaxiBudget.test.ts`.
- **Approved daily budget policy:** `TaxiBudget { type: "unset" }` means no explicit Daily Route hard cap, so positive taxi spend is not blocked solely because no budget was entered. `TaxiBudget { type: "unlimited" }` explicitly accepts no Daily Route hard cap. `TaxiBudget { type: "capped", amount }` accepts Daily Route taxi spend iff `taxiCost <= amount`, including exact equality. `unset` and `unlimited` remain semantically distinct and are never normalized into each other.
- **Budget source and result:** `evaluateTaxiBudget()` reads only `simulation.totals.taxiCost` as authoritative Daily Route spend; it does not recalculate cost from the `TravelMatrix`, stops, taxi-leg count, or estimated fares. The aggregate daily total, rather than independent per-leg comparisons against the full cap, controls validity. Passing returns frozen `hardViolationCount = 0`, `violations = []`, and `conflicts = []`. Capped exceedance returns exactly one error-severity `Violation` and one `Conflict`, both coded `taxi_budget_exceeded`, with route-level `propertyIds = []` and structured `budgetAmount`, `taxiCost`, `exceededBy`, and `budgetType = "capped"` parameters.
- **Budget internal validation:** `simulation.totals.taxiCost` and a capped amount must be finite and non-negative. Malformed internal calculator evidence throws `RangeError`; CE-13 does not translate it to `invalid_input`, because CE-04 owns source-input validation.
- **Daily versus multi-day budget boundary:** The approved `unset` behavior applies only to one Daily Route. It does not resolve Gate B, which remains open for whether future multi-day budget is shared across dates, separately capped per day, dynamically allocated, or aggregated another way.
- **Taxi-value evidence contract:** `TaxiValueRouteEvidence` contains ordered normalized properties, an authoritative CE-07 `SimulationResult`, and a CE-08 `ConstraintEvaluation`. `EvaluateTaxiValueInput` contains reference evidence, candidate evidence, an optional `candidateTransitCounterfactual`, and a precomputed `TravelMatrix`; budget is not an input. `evaluateTaxiValue()` calls neither `simulateTimeline()` nor `evaluateTimelineConstraints()` and instead consumes caller-supplied evidence that CE-16 will later construct and orchestrate.
- **Evidence alignment:** Every evidence object requires simulation stop count equal to ordered-property count and `simulation.stops[index].propertyId` equal to `orderedProperties[index].id`. Misalignment throws `RangeError`; no ID-based realignment occurs.
- **Directed matrix and transit availability:** Each selected candidate taxi leg uses only the exact `travelFromLocationId -> candidate property locationId` edge. Missing exact edges and unavailable selected taxi alternatives contradict the already-simulated candidate and throw `RangeError`; no reverse fallback or provider call occurs. If that exact edge's transit alternative is unavailable, CE-13 skips the leg's transit comparison and fabricates no transit duration, minutes saved, `avoid_late`, or `transit_detour` evidence.
- **Minutes-saved definition:** For a taxi leg with usable transit data, `minutesSaved = transit.durationMinutes - taxi.durationMinutes`. This is direct-leg travel-time saving, not the difference between route end times and not a minutes-per-money score. Leg explanation cost comes from the authoritative candidate stop; route unlock cost comes from candidate simulation totals.
- **`avoid_late`:** A selected taxi leg requires a same-index reference transit leg with the same property identity and directed origin. Only the property at that index and later reference properties count as downstream. Qualifying reference evidence is `time_window_conflict` or `appointment_conflict` with `lateByMinutes > 0`; a fixed-buffer shortfall with zero lateness is not enough. The candidate must have zero hard violations. The leg-scoped explanation includes `taxiCost`, `minutesSaved`, `lateIssuesAvoided`, and `maximumLateByMinutesAvoided`.
- **`transit_detour`:** Taxi is not valuable merely for being faster. The time branch requires both centralized `ROUTE_ENGINE_CONFIG.taxiRecommendation.meaningfulTimeSavingMinutes` and `minimumTransitToTaxiDurationRatio` thresholds inclusively. The independent multiple-transfer branch uses the centralized inclusive `ROUTE_ENGINE_CONFIG.transitRisk.transferCountThreshold`. A qualifying leg emits one explanation; if both branches qualify, stable explanation basis uses `time_threshold` before `multiple_transfers`. Production CE-13 duplicates none of these constants.
- **Unlock counterfactual contract:** `candidateTransitCounterfactual` is optional caller-supplied CE-07/CE-08 evidence and is never generated inside CE-13. When supplied, it must describe the same candidate property count and exact `PropertyId` order, keep identical directed-leg origins, replace every candidate taxi leg with transit, and preserve every non-taxi candidate mode. Any contract violation throws `RangeError`.
- **Unlock timing causality:** `unlock_extra_viewing` requires the candidate transit counterfactual to be hard-infeasible with at least one relevant `appointment_conflict`, `time_window_conflict`, or `end_time_exceeded`. Unrelated hard issues such as `travel_data_unavailable` do not establish taxi schedule causality. Without `candidateTransitCounterfactual`, CE-13 emits no unlock and does not guess causality, although independently qualifying `avoid_late` and `transit_detour` explanations remain available.
- **Unlock benefit branches:** The extra-viewing branch requires a fully hard-feasible candidate, a timing-infeasible same-order transit counterfactual, a fully hard-feasible reference, a positive completed-count gain, and at least one candidate taxi leg with usable transit data. The must-restoration branch requires reference `must_visit_unscheduled`, a positive must-completed-count gain, a fully hard-feasible candidate, the same counterfactual timing failure, and a candidate taxi leg with usable transit data. A feasible same-order transit counterfactual suppresses both claims.
- **Unlock explanation and ordering:** `unlock_extra_viewing` is route-scoped and emitted at most once, with candidate total `taxiCost`, aggregate direct-leg transit-versus-taxi `minutesSaved` over usable taxi comparisons, `completedCountGain`, `mustCompletedCountGain`, and `taxiLegCount`. Earlier finish or lower travel time alone does not qualify. Multiple explanations may coexist in stable candidate route order: `avoid_late` then `transit_detour` for each taxi leg, followed by at most one route-level unlock. This is output stability, not ranking.
- **Cases 06–09:** Case 06 uses real CE-07 simulation and CE-08 constraints: transit is late, taxi restores hard feasibility, and a sufficient capped budget passes, producing leg-scoped `avoid_late` without selecting a candidate. Case 07's 55-minute transit versus 18-minute taxi produces `transit_detour`; the value remains visible when an insufficient cap separately produces `taxi_budget_exceeded`. Corrected Case 08 compares a feasible shorter all-transit reference with a feasible additional-property taxi candidate and an otherwise identical full-route transit counterfactual that fails daily timing; only that causal comparison produces `unlock_extra_viewing`. A feasible same-order transit counterfactual produces no unlock. The must-restoration variant likewise requires reference `must_visit_unscheduled`, a feasible taxi candidate, and a timing-infeasible same-order transit counterfactual; a feasible counterfactual suppresses the reason. Case 09 covers `unset` and `unlimited` positive spend; cap 60 at 0, 59, 60, and 60.01; cap zero at zero and positive spend; and aggregate multi-taxi CE-07 cost. Zero/one/two taxi legs are not a budget-policy cap.
- **Immutability and repeatability:** Inputs are not mutated. Taxi-value output freezes the outer explanation array, every explanation, and every parameter object. Taxi-budget output freezes the result, issue arrays, each issue, property-ID arrays, and parameters. Repeated identical inputs produce deeply equal deterministic output and stable explanation order.
- **Deterministic tests:** 38 taxi-value tests and 16 taxi-budget tests, 54 CE-13 tests total. Coverage includes unset/unlimited; capped zero and below/exact/above cap; aggregate multi-taxi spend; malformed taxi cost and cap; positive/negative and downstream `avoid_late`; buffer-only non-lateness; same-position and candidate-feasibility requirements; config-derived detour minutes/ratio/transfer boundaries; available/degraded and unavailable transit; corrected Case 08 causality and feasible-transit false-positive regression; unrelated-conflict rejection; must-restoration positive/negative cases; counterfactual alignment, exact identity order, directed origins, taxi-to-transit substitution, and non-taxi mode preservation; explanation order; immutability; freezing; and repeatability. All 403 repository tests across 18 files pass; focused CE-13 Vitest, `npm test`, `npm run lint`, `npx tsc --noEmit`, and `git diff --check` pass.
- **Mapped TEST_CASES:** Cases 06–09.
- **Decision Gates:** Gate B remains unresolved for future multi-day taxi-budget semantics. The approved daily `unset` behavior does not choose whole-plan versus per-day budget scope. Gate C and every other Decision Gate remain unchanged.
- **Definition of done:** Daily budget semantics are explicit; value and validity are independent; taxi is not recommended merely for speed; completion/must unlocks require causal same-route counterfactual timing evidence; outputs are deterministic and immutable; all recorded checks pass.
- **Non-goals:** Source type or configuration changes; mode enumeration; order or gap search; production timeline simulation or constraint reevaluation; risk or candidate ranking; cheapest/recommended/fastest selection; option extraction; `RouteCandidate` assembly; provider calls; minutes-per-money scoring; Plan B; UI; storage; network; multi-day budget aggregation; whole-plan taxi budget; and CE-14 implementation. None are implemented in CE-13.
- **Future-scale notes:** Taxi combination strategy remains replaceable.

### CE-14 — Daily hierarchical ranking

- **Status:** COMPLETE
- **Prerequisites:** CE-07, CE-08, CE-11, CE-13.
- **Goal and responsibility:** Rank already-constructed Daily Route `RouteCandidate` values by the confirmed hierarchy without an opaque weighted score. CE-14 owns only deterministic comparison and ordering; it provides `compareRouteCandidates(left, right)` and `rankRoutes(candidates)`.
- **Implemented ownership:** `src/lib/route/rankRoutes.ts`; `test/route/rankRoutes.test.ts`.
- **Authoritative metric sources:** From `candidate.metrics`, CE-14 reads `hardViolationCount`, `riskPenalty`, and `experiencePenalty`. From `candidate.simulation.totals`, it reads `mustCompletedCount`, `completedCount`, `totalTravelMinutes`, and `taxiCost`. It neither duplicates these fields nor recalculates them from lower-level evidence. CE-16 owns candidate assembly and consistency; CE-14 compares the supplied authoritative values without repairing nested inconsistencies.
- **Exact hierarchy:** Lexicographic comparison applies, in order: (1) `hardViolationCount` ascending; (2) `mustCompletedCount` descending; (3) `completedCount` descending; (4) `riskPenalty` ascending; (5) `totalTravelMinutes` ascending; (6) `taxiCost` ascending; and (7) `experiencePenalty` ascending. A lower-level metric can never compensate for a worse higher-level metric. No weighted, normalized, composite, cost-per-minute, minutes-per-currency, or opaque ranking score exists.
- **Comparator contract:** `compareRouteCandidates(left, right)` returns a negative number when `left` ranks before `right`, zero when all seven confirmed hierarchy metrics are equal, and a positive number when `right` ranks before `left`. It is pure and deterministic.
- **Stable ties:** When all seven metrics tie, `compareRouteCandidates()` returns zero. `rankRoutes()` preserves caller-supplied order among tied candidates using original input index only as a stable sorting mechanism. Input index is not a `CandidateMetric`, domain preference, or additional ranking field.
- **Excluded tie-breaks:** Exact hierarchy ties do not use `candidate.id`, `propertyOrder`, `transportModes`, `status`, `estimatedEndAt`, `totalWaitingMinutes`, `taxiLegCount`, `RouteRisk.score`, `RouteRisk.level`, `RouteRisk.legs`, explanations, violation ordering, or conflict ordering. Candidate ID lexical order is not ranking policy.
- **Status and eligibility boundary:** CE-14 does not filter supplied candidates. `feasible`, `partial`, and `conflicted` are not separate ranking keys; all supplied candidates enter the hierarchy at `hardViolationCount`. CE-15 owns option eligibility and extraction.
- **Hard-violation precedence:** Fewer hard violations outrank every lower-level advantage, including more must or total completions, lower risk, faster travel, lower taxi cost, or lower experience penalty.
- **Must-completion precedence:** When hard violations tie, higher `mustCompletedCount` wins and cannot be overridden by ordinary completion, risk, travel, taxi cost, or experience. This is the CE-14 ranking foundation for Case 11; missing-must detection remains CE-08 ownership.
- **Total-completion precedence:** When hard violations and must completion tie, higher `completedCount` wins over lower risk, faster travel, lower taxi cost, or lower experience penalty. This is the CE-14 ranking foundation for Case 08; taxi unlock causality remains CE-13 ownership.
- **Risk precedence:** When the first three fields tie, lower `candidate.metrics.riskPenalty` wins. CE-14 does not recalculate CE-11 risk and does not directly rank by `RouteRisk.level` or `RouteRisk.score`; upstream code must already have converted relevant risk evidence into the authoritative penalty.
- **Case 05 foundation:** With earlier fields equal, Option A at `riskPenalty = 5` and `totalTravelMinutes = 28` loses to Option B at `riskPenalty = 0` and `totalTravelMinutes = 31`. Three extra travel minutes cannot override lower risk penalty.
- **Travel-time precedence:** When hard violations, must completions, total completions, and risk tie, lower `totalTravelMinutes` wins ahead of taxi cost and experience penalty. `estimatedEndAt` is not part of the CE-14 recommended hierarchy.
- **Taxi-cost precedence:** When the first five fields tie, lower `taxiCost` wins. Cost cannot override hard feasibility, must completion, total completion, risk, or travel time.
- **Experience penalty:** `experiencePenalty` is the final confirmed business field and is considered only after every preceding field ties. CE-14 consumes its numeric value without calculating it from waiting, walking, transfers, backtracking, route preferences, or agent identity.
- **Case 12 boundary:** Same-agent continuity is not implemented and remains deferred/P1. No agent, agent ID, broker, or contact identity participates in current Daily Route ranking.
- **Non-ranking simulation totals and explanations:** Differences only in `estimatedEndAt`, `totalWaitingMinutes`, or `taxiLegCount` produce a hierarchy tie. Future CE-15 fastest extraction may use estimated end under its separately confirmed semantics. Explanation codes including `avoid_late`, `transit_detour`, `unlock_extra_viewing`, `lower_transit_risk`, `lower_taxi_cost`, and `earlier_finish` remain evidence, not ranking weights.
- **Numeric validation:** `hardViolationCount`, `mustCompletedCount`, and `completedCount` must be non-negative integers. `riskPenalty`, `totalTravelMinutes`, `taxiCost`, and `experiencePenalty` must be finite and non-negative. Malformed internal ranking evidence throws `RangeError`; CE-04 remains responsible for source-input validation and CE-14 does not translate such evidence into `invalid_input`.
- **Collection behavior:** `rankRoutes()` accepts readonly candidate input, ranks every supplied candidate, does not mutate it, returns a new frozen outer array, preserves original candidate references, and preserves input order among exact hierarchy ties. Empty input yields a new frozen empty array. A single candidate yields a new frozen one-element array holding the same reference. Repeated identical inputs produce the same candidate-reference order.
- **Case 08 foundation:** When hard violations and must completion tie, a candidate completing one additional property ranks first even with higher taxi cost, longer travel, or worse experience penalty. CE-14 does not reevaluate whether taxi caused the gain; causal value remains CE-13 ownership.
- **Case 11 foundation:** With equal hard violations, higher must completion defeats attractive lower-level metrics. In the realistic missing-must foundation, a candidate with no hard violation defeats one carrying `must_visit_unscheduled`, because hard-violation count is first. CE-14 performs no opportunity-cost analysis.
- **Comparator algebra and dominance:** Tests cover reflexivity, antisymmetry for non-tied candidates, representative transitivity, repeatability, and every adjacent dominance boundary: hard violations over must completion; must completion over total completion; total completion over risk; risk over travel time; travel time over taxi cost; and taxi cost over experience penalty. Extreme lower-level advantages cannot reverse these boundaries.
- **Immutability:** Inputs and candidates are not mutated. The returned outer array is new and frozen. Candidates are neither cloned nor modified, their references are preserved, and repeated ranking retains the same reference order.
- **Deterministic tests:** 56 CE-14 focused tests and 459 repository tests across 19 files. Coverage includes all seven hierarchy fields; every adjacent-level dominance boundary; Cases 05, 08, and 11; exact stable ties; ignored candidate ID, property order, transport modes, estimated end, waiting, taxi-leg count, `RouteRisk` metadata, explanations, and status; comparator reflexivity, antisymmetry, and transitivity; malformed counts and numeric values; single-candidate validation; empty and single input; input immutability; frozen output; reference preservation; and repeatability. Focused CE-14 Vitest, `npm test`, `npm run lint`, `npx tsc --noEmit`, `git diff --check`, and source-boundary audits pass.
- **Mapped TEST_CASES:** Cases 05, 08, 11. Case 12 is explicitly not mapped as required.
- **Decision Gates:** Daily CE-14 hierarchy requires no Decision Gate closure. Gate A remains unresolved for future whole-plan ranking, Gate F remains unresolved for future whole-plan risk aggregation, Gate H remains unresolved for future whole-plan tie behavior, and Gate C remains unresolved for future search crossover.
- **Definition of done:** Higher-level metrics cannot be overridden; search has no ranking semantics; comparator and collection contracts are deterministic and immutable; all recorded checks pass.
- **Non-goals:** Type or config changes; candidate generation; order or gap search; mode enumeration; timeline simulation; constraint evaluation; risk recalculation; taxi-value or taxi-budget evaluation; `RouteCandidate` assembly; provider calls; `TravelMatrix` dependency; weighted scoring; cheapest selection; recommended or fastest option extraction; `RouteOption` construction; same-agent behavior; Case 12; whole-plan ranking; multi-day logic; UI; storage; network; and CE-15 implementation. None are implemented in CE-14.
- **Future-scale notes:** Comparator remains independent from candidate source.

### CE-15 — Daily cheapest/recommended/fastest extraction

- **Status:** NEXT
- **Prerequisites:** CE-14.
- **Goal:** Extract and deduplicate user-facing Daily Route options.
- **Scope:** Cheapest, recommended, and fastest selectors; property-order/mode fingerprint; combined objective labels for duplicate routes.
- **Likely ownership:** `src/lib/route/extractRouteOptions.ts`; `test/route/extractRouteOptions.test.ts`.
- **Deterministic tests:** All labels same, two labels same, distinct options, infeasible candidates excluded as required by current daily contracts.
- **Mapped TEST_CASES:** Case 13.
- **Decision Gates:** Gate G applies to whole-plan topology only.
- **Definition of done:** Extraction is deterministic and does not mutate/rerank candidates; duplicates collapse correctly; all checks pass.
- **Non-goals:** Whole-plan options, UI cards, persistence.
- **Future-scale notes:** Daily option output remains stable beneath future plan orchestration.

### CE-16 — Integrated optimizeDayRoute()

- **Status:** PLANNED
- **Prerequisites:** CE-02 through CE-15.
- **Goal:** Integrate the complete pure-TypeScript Daily Route optimizer over a precomputed matrix.
- **Scope:** Orchestrate validation, normalization, search, simulation, constraints, modes, risk, taxi rules, ranking, explanations, and daily option extraction.
- **Likely ownership:** `src/lib/route/optimizeDayRoute.ts`; integrated daily tests.
- **Deterministic tests:** End-to-end same input/matrix repeatability; relevant focused and acceptance suites.
- **Mapped TEST_CASES:** Current Daily Route Cases 01–11, 13, 16, 17. Cases 12, 14, and 15 are not completion requirements.
- **Decision Gates:** Gate C does not block V0.1A; unresolved multi-day gates do not alter this daily API.
- **Definition of done:** All mapped current daily cases pass; route imports no provider; output is deterministic; lint/typecheck/diff checks pass; accepted in review.
- **Non-goals:** Multi-day types, Day Assignment, UI, LocalStorage, providers/maps, dynamic rerouting, Plan B, Case 12.
- **Future-scale notes:** Integration depends on search interfaces, not DFS-specific semantics.

### CE-17 — Multi-day input, eligible-day derivation, and validation

- **Status:** PLANNED
- **Prerequisites:** CE-16 and resolution of contract-blocking Gates B, D, E, and I as applicable.
- **Goal:** Define multi-day source contracts and pure rules for available dates, eligibility, and validation.
- **Scope:** Available-date collection, per-date availability, optional maximum-active-day/finish-by constraints, eligible-day derivation, fixed/limited/flexible rules, unavailable-fixed-date conflict, multi-day result foundations.
- **Likely ownership:** `src/lib/plan/types.ts`, `src/lib/plan/deriveEligibleDays.ts`, `src/lib/plan/validatePlanInput.ts`, `test/plan/*`.
- **Deterministic tests:** Empty/duplicate/non-consecutive dates, fixed date included/absent, limited/flexible eligibility, daily availability, no invented dates.
- **Mapped TEST_CASES:** Cases 18, 22, 24, 25 foundations.
- **Decision Gates:** B (budget contract), D (per-date settings), E (undated unconfirmed eligibility), I (result invariant) must be resolved before affected contracts are finalized.
- **Definition of done:** Concrete contracts reflect only closed policies; active/eligible dates can only derive from supplied dates; current daily contracts remain unchanged; all checks pass.
- **Non-goals:** Assignment search, daily route reimplementation, whole-plan ranking, UI.
- **Future-scale notes:** Date collections are not fixed three-element tuples.

### CE-18 — Replaceable Day Assignment candidate generation

- **Status:** PLANNED
- **Prerequisites:** CE-17.
- **Goal:** Generate deterministic property-to-eligible-day assignments through a replaceable search strategy.
- **Scope:** Strategy interface, initial DFS/backtracking assignment traversal, deterministic ordering, pruning through pure eligibility/constraint callbacks, active-day subsets, assignment deduplication.
- **Likely ownership:** `src/lib/plan/search/types.ts`, `src/lib/plan/search/dfsAssignments.ts`, focused plan-search tests.
- **Deterministic tests:** Fixed immovability, flexible choices, limited eligibility, fewer active dates than available, stable candidate set, no unavailable date.
- **Mapped TEST_CASES:** Cases 18–23.
- **Decision Gates:** Gate C informs future crossover but does not block initial DFS; Gate H affects final ranking, not candidate generation.
- **Definition of done:** Search defines no eligibility/ranking semantics; candidates are deterministic and valid; strategy is replaceable; all checks pass.
- **Non-goals:** Calling daily optimizer, aggregating metrics, choosing recommended plan.
- **Future-scale notes:** Support future stronger search without changing plan rules.

### CE-19 — Multi-day plan assembly and aggregation

- **Status:** PLANNED
- **Prerequisites:** CE-16, CE-17, CE-18 and resolution of aggregation-shape Gates F/G as needed.
- **Goal:** Build whole-plan candidates by optimizing every active day independently and aggregating confirmed metrics.
- **Scope:** Convert assignment to daily inputs, call `optimizeDayRoute()` per active date, retain independent timelines, combine completion/travel/cost and closed risk metrics, propagate conflicts/explanations.
- **Likely ownership:** `src/lib/plan/assemblePlan.ts`, `src/lib/plan/aggregatePlanMetrics.ts`, integrated plan tests.
- **Deterministic tests:** Stable daily call set/order, non-consecutive dates, per-day monotonicity, exact aggregate totals, fixed appointments retained.
- **Mapped TEST_CASES:** Cases 18–24.
- **Decision Gates:** F (risk aggregation) and G (whole-plan option topology) must close before affected output/aggregation behavior is finalized; B may affect taxi aggregation.
- **Definition of done:** No provider calls; daily optimizer remains the only daily-route engine; aggregate metrics have one source of truth; all checks pass.
- **Non-goals:** Whole-plan ranking policy, UI, cross-day rerouting.
- **Future-scale notes:** Assembly is independent from assignment strategy.

### CE-20 — Multi-day ranking and active-day constraints

- **Status:** PLANNED
- **Prerequisites:** CE-19 and closure of Gates A, B, F, G, H, and I where they affect final semantics.
- **Goal:** Compare whole-plan candidates and select active dates under confirmed constraints.
- **Scope:** Whole-plan hierarchy, maximum-active-day and finish-by enforcement, deterministic tie handling, applicable taxi/risk aggregation, actionable partial/conflict ranking.
- **Likely ownership:** `src/lib/plan/rankPlans.ts`, `src/lib/plan/evaluatePlanConstraints.ts`, focused tests.
- **Deterministic tests:** Active-date subset, optional constraints, one-versus-multiple-day comparisons after Gate A, exact tie behavior after Gate H, no lower-level override.
- **Mapped TEST_CASES:** Cases 19, 21, 23, 25 plus acceptance placeholders activated only after their gates close.
- **Decision Gates:** A, B, F, G, H, I.
- **Definition of done:** Only closed policies are encoded; hierarchy is explicit and not hidden in assignment search; all checks pass.
- **Non-goals:** Integrated public API, UI, dynamic rerouting.
- **Future-scale notes:** Ranking remains candidate-source independent.

### CE-21 — Integrated optimizeMultiDayPlan()

- **Status:** PLANNED
- **Prerequisites:** CE-17 through CE-20 and all gates required by their finalized contracts.
- **Goal:** Integrate deterministic multi-day planning over the accepted Daily Route optimizer and precomputed travel data.
- **Scope:** Validation, eligibility, assignment candidate generation, per-day optimization, aggregation, whole-plan ranking, conflicts/explanations, and final result.
- **Likely ownership:** `src/lib/plan/optimizeMultiDayPlan.ts`; integrated multi-day acceptance tests.
- **Deterministic tests:** Repeated-input determinism, full Cases 18–25, daily suite regression, active-date subset, fixed-date preservation, independent daily timelines.
- **Mapped TEST_CASES:** Cases 18–25. Cases 12, 14, and 15 are not completion requirements.
- **Decision Gates:** All contract/ranking gates required by CE-17–CE-20 must be closed; Gate C and Gate J may remain deferred because they concern future scale/rerouting.
- **Definition of done:** Cases 18–25 and daily regressions pass; no unavailable date or provider call is introduced; all repository checks pass; milestone receives explicit review acceptance.
- **Non-goals:** Product UI, maps, LocalStorage, real providers, dynamic rerouting, Plan B, Case 12.
- **Future-scale notes:** V0.1 UI may expose three dates, but integrated contracts must not permanently cap domain capacity at three.

## 7. Decision Gate register

All gates below are **UNRESOLVED**. Documentation of alternatives is not a
decision, and implementation must not silently choose one.

### Gate A — One-day high-risk versus two-day lower-risk recommendation

- **Question:** When both plans feasibly complete all important properties, when should a higher-risk/tighter/more-taxi one-day plan rank below a relaxed two-day plan?
- **Why deferred:** This is a product trade-off between compactness and executability, not derivable from the daily hierarchy.
- **Must resolve before:** CE-20 whole-plan ranking is finalized.
- **Status:** UNRESOLVED.

### Gate B — Multi-day taxi-budget scope

- **Question:** Is taxi budget one shared whole-plan budget or a separate budget for each day?
- **Why deferred:** Either choice changes multi-day contracts, aggregation, and feasibility.
- **Must resolve before:** Affected CE-17 contracts and CE-20 ranking behavior are finalized.
- **Status:** UNRESOLVED.

### Gate C — Search crossover for larger plans

- **Question:** At what measured scale should DFS/backtracking give way to Branch and Bound, Beam Search, a solver, or another strategy?
- **Why deferred:** 4–8 is current performance coverage; no evidence supports a numeric crossover yet.
- **Must resolve before:** Declaring or implementing a post-CE-21 larger-plan performance tier such as 10–15 properties.
- **Status:** UNRESOLVED; does not block replaceable search interfaces or V0.1A DFS.

### Gate D — Per-date settings beyond availability

- **Question:** Does each date contain only date/start/end availability, or may origin, transport strategy, buffer, taxi settings, and preferences also vary by date?
- **Why deferred:** The approved architecture confirms per-date availability but not the ownership of other settings.
- **Must resolve before:** CE-17 contracts are finalized.
- **Status:** UNRESOLVED.

### Gate E — Unconfirmed-property date eligibility

- **Question:** If an unconfirmed property has no date, is it eligible for all available dates, excluded until confirmed, or handled another explicit way?
- **Why deferred:** Current raw input permits an optional date but defines no cross-day meaning for absence.
- **Must resolve before:** CE-17 eligibility rules are finalized.
- **Status:** UNRESOLVED.

### Gate F — Whole-plan risk aggregation

- **Question:** Is whole-plan risk represented by a sum, maximum daily risk, worst leg, distribution, or another hierarchy?
- **Why deferred:** Each representation can change plan ranking despite identical daily results.
- **Must resolve before:** CE-19 aggregation and CE-20 ranking are finalized.
- **Status:** UNRESOLVED.

### Gate G — Whole-plan option topology

- **Question:** Does the final result expose one recommended plan, cheapest/recommended/fastest whole plans, a recommended plan plus daily alternatives, or another structure?
- **Why deferred:** Daily three-option extraction does not determine the product's aggregate option structure.
- **Must resolve before:** CE-19/CE-20 output and ranking contracts are finalized.
- **Status:** UNRESOLVED.

### Gate H — Equivalent active-date tie-breaking

- **Question:** If whole-plan candidates are otherwise equivalent, prefer earlier dates, consecutive dates, fewer gaps, user entry order, or no additional preference?
- **Why deferred:** No approved product preference currently distinguishes them.
- **Must resolve before:** CE-20 final ranking.
- **Status:** UNRESOLVED.

### Gate I — Partial multi-day result invariant

- **Question:** Exactly when is a multi-day result success, partial, or failure, including unavailable fixed-date appointments?
- **Why deferred:** The daily result invariant does not determine aggregate status and the policy was intentionally deferred.
- **Must resolve before:** Affected CE-17 result contracts and CE-20 ranking are finalized.
- **Status:** UNRESOLVED.

### Gate J — Cross-day reassignment during future dynamic rerouting

- **Question:** May a disruption on one day move a future flexible property to another user-supplied eligible day?
- **Why deferred:** Current rerouting semantics are day-scoped and rerouting is post-Core-Engine scope.
- **Must resolve before:** Future post-CE-21 dynamic-rerouting implementation.
- **Status:** UNRESOLVED.

## 8. TEST_CASE coverage matrix

| Case | Status | Primary milestone(s) | Notes |
| --- | --- | --- | --- |
| 01 | Current V0.1A | CE-07, CE-08, CE-09, CE-16 | Daily fixed appointments and buffer |
| 02 | Current V0.1A | CE-03, CE-07, CE-08, CE-16 | Day-scoped start window |
| 03 | Current V0.1A | CE-02, CE-03, CE-07, CE-16 | Finish-before conversion |
| 04 | Current V0.1A | CE-08, CE-09, CE-10, CE-16 | Gap rule separated from insertion search |
| 05 | Current V0.1A | CE-11, CE-14, CE-16 | Transit risk |
| 06 | Current V0.1A | CE-12, CE-13, CE-16 | Taxi avoids lateness |
| 07 | Current V0.1A | CE-12, CE-13, CE-16 | Transit detour |
| 08 | Current V0.1A | CE-12, CE-13, CE-14, CE-16 | Taxi unlocks completion |
| 09 | Current V0.1A | CE-12, CE-13, CE-16 | Baseline mode combinations |
| 10 | Current V0.1A | CE-09, CE-12, CE-16 | Mode can change order |
| 11 | Current V0.1A | CE-08, CE-09, CE-14, CE-16 | Current requirement is must-visit preservation/conflict; opportunity-cost enhancement may remain P1 |
| 12 | P1 / DEFERRED | None in current Core Engine | Must not gate CE-14, CE-16, or CE-21 |
| 13 | Current V0.1A | CE-15, CE-16 | Daily option deduplication |
| 14 | DEFERRED | Post-CE-21 rerouting plan | Not current Core Engine acceptance |
| 15 | DEFERRED | Post-CE-21 Plan B plan | Not current Core Engine acceptance |
| 16 | Current V0.1A | CE-05, CE-06, CE-08, CE-16 | Missing/degraded travel data |
| 17 | Current V0.1A | CE-04, CE-16 | One-property daily input is valid |
| 18 | Current multi-day | CE-17, CE-18, CE-19, CE-21 | Cross-date fixed appointments succeed |
| 19 | Current multi-day | CE-18, CE-19, CE-20, CE-21 | Flexible property chooses better eligible day |
| 20 | Current multi-day | CE-18, CE-19, CE-21 | Move flexible property to Day 2 |
| 21 | Current multi-day | CE-18, CE-19, CE-20, CE-21 | Must-visits distributed across days |
| 22 | Current multi-day | CE-17, CE-18, CE-21 | Unavailable fixed date; Gate I controls aggregate status |
| 23 | Current multi-day | CE-18, CE-20, CE-21 | Three available, two active |
| 24 | Current multi-day | CE-17, CE-19, CE-21 | Different per-date availability |
| 25 | Current multi-day | CE-17, CE-20, CE-21 | One date infeasible; no invented date; Gate I controls status |

Decision-Gate acceptance placeholders in `TEST_CASES.md` do not enter passing
criteria until their gates close.

## 9. Future-scale considerations

- 4–8 properties is V0.1A scenario and performance coverage, not a valid-input maximum.
- Inputs above eight must not be rejected solely because of that target.
- Future 10–15-property plans likely need stronger search; exact crossover is Gate C.
- Search replacement must not rewrite eligibility, normalization, simulation, constraints, risk, taxi value, ranking, or explanations.
- V0.1 product/UI may expose up to three available dates, but domain collections must not permanently cap capacity at three.
- Available dates may be non-consecutive.
- Provider batching/caching and real provider replacement must remain outside optimizer rules.

## 10. Post-Core-Engine sequence

Substantial product UI may be considered only after CE-21 passes deterministic
acceptance and review. That milestone is an earliest allowed point, not automatic
authorization.

Do not automatically begin or bundle:

- product or Route Center UI;
- map UI or real map APIs;
- LocalStorage or other persistence;
- real geocoding/transit providers;
- dynamic rerouting;
- Plan B;
- Case 12 same-agent preference.

Each requires separately approved scope and sequencing.

## 11. Maintenance rule

When a CE item changes, update this ledger's relevant entry, coverage mapping,
gate references, and status in one reviewable change. Do not copy the detailed
ledger into MVP, PRD, the algorithm contract, TEST_CASES, or AGENTS.

Status may advance only after the item-specific deterministic tests and required
repository checks pass and the completed scope has been reviewed. Keep a
lightweight history through version control rather than an additional duplicated
status table inside this document.
