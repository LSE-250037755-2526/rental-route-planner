# Route and Multi-day Planning Algorithm Contract

> Algorithm and domain-semantics source of truth, distilled from `PRD.md` and
> the route-enhancement scope in `MVP.md`. UI and search implementations must not
> silently change these rules. Detailed CE sequencing exists only in
> `CORE_ENGINE_BACKLOG.md`.

## 1. Terminology and optimizer boundaries

- **Viewing Plan / Multi-day Plan** — the complete plan spanning one or more active dates.
- **Available Date** — a date supplied by the user as possible.
- **Active Date / Active Day** — an available date selected by the planner for use.
- **Eligible Day** — an available date on which a property is allowed to be scheduled.
- **Day Assignment** — assignment of properties to eligible active days.
- **Daily Route** — the route for exactly one active `CalendarDate`.
- **Daily Route Optimization** — ordering, mode, timeline, and daily option extraction within one date.
- **Multi-day Planning** — eligibility, Day Assignment, daily optimization, aggregation, and whole-plan ranking.

Use “route” for a Daily Route and “plan” for the aggregate Viewing Plan.

The current CE-01 source still names the single-day settings contract
`PlanSettings` and the single-day result `OptimizationResult`. CE-01.1 will
rename them to `DayPlanSettings` and `DayRouteOptimizationResult`. Those target
names do not yet exist in source.

The integrated daily API `optimizeDayRoute()` is a CE-16 target, not a current
implementation. Concrete multi-day TypeScript contracts and
`optimizeMultiDayPlan()` do not exist yet and belong to CE-17 through CE-21.

## 2. Two separate optimization pipelines

### 2.1 Daily Route pipeline

```text
properties assigned to exactly one CalendarDate
+ single-day settings (target name after CE-01.1: DayPlanSettings)
+ precomputed TravelMatrix
→ day-route input validation
→ day-scoped time-window normalization
→ candidate-order search
→ feasibility evaluation and pruning
→ transport-mode candidate search
→ same-day full timeline simulation
→ constraints, risk, and taxi-value evaluation
→ hierarchical daily ranking
→ explanations and daily option extraction
→ optimizeDayRoute()
```

A daily call must contain only properties assigned or eligible for its target
date. Mixed dates inside one daily call are invalid daily-route input. This does
not make a multi-date Viewing Plan invalid.

### 2.2 Multi-day Planning pipeline

```text
available dates
+ per-date availability
+ properties
+ optional multi-day constraints
→ validate user-supplied dates
→ derive eligibleDays for each property
→ Day Assignment candidate search
→ optimize each active day independently
→ aggregate whole-plan metrics
→ rank multi-day candidates
→ optimizeMultiDayPlan()
```

The user supplies possible dates, not the exact active-day count. The planner
may activate fewer dates than supplied and must never activate a date the user
did not supply. Optional maximum-active-day and finish-by constraints further
restrict candidate plans.

Fixed-date appointments require exactly their fixed date. That date becomes an
eligible assignment only when it is also user-supplied and available; otherwise
validation reports an explicit conflict instead of inventing or activating the
date. Limited-date properties may move only among their eligible dates.
Fully flexible properties may use user-supplied dates subject to the eligibility
contract finalized in CE-17. Eligibility for an undated unconfirmed property is
still an unresolved Decision Gate.

If the user supplies only one date and that availability cannot accommodate all
important properties, the planner must not fabricate another date. It must
surface insufficient supplied availability and an actionable conflict or
partial outcome. The exact multi-day success/partial/failure invariant remains
unresolved until its Decision Gate closes.

## 3. Deterministic date and time model

Each Daily Route has one independent same-day time axis:

- `CalendarDate` target format: strict `YYYY-MM-DD`.
- `ClockTime` target format: strict `HH:mm`.
- `MinuteOfDay`: integer 0–1439.
- The date, not a cumulative minute offset, distinguishes days.
- Available dates may be non-consecutive.
- A Daily Route must not silently cross or wrap past midnight.
- Multi-day planning must not represent Day 2 as minutes 1440–2879.
- Optimization must not depend on `Date.now()`, locale parsing, or timezone state.

Examples:

```text
2026-09-20 09:00 → date 2026-09-20, minute 540
2026-09-21 09:00 → date 2026-09-21, minute 540
```

Adding 20 minutes to 23:50 must not silently become 00:10 in the same Daily
Route. CE-02 will implement these primitives; current aliases do not yet enforce
the formats or bounds.

## 4. Core daily-route objective

A Daily Route does not optimize only for shortest geographic distance. It
optimizes property order and transport mode jointly under appointment windows,
must-visit priority, latest end, viewing duration, buffer, transport strategy,
and the applicable taxi budget.

The daily objective is to complete as many high-priority properties as possible
while reducing lateness risk, travel time, unnecessary taxi spend,
backtracking, transfers, walking, and waiting.

## 5. Daily decision priority

Daily Route candidates are compared hierarchically, not by one opaque weighted
score:

1. Hard constraints: time-window feasibility, must-visit preservation, latest-end feasibility.
2. Completion efficiency: maximize feasible completed properties and use available gaps.
3. Executability: minimize lateness risk and preserve reasonable buffers.
4. Transport efficiency: reduce total travel time and obvious backtracking.
5. Cost efficiency: prefer public transit, use taxi only on high-value legs, stay within the applicable budget.
6. Experience: fewer transfers, less walking, and less waiting.

A lower-level objective must never override a higher-level objective. Same-agent
continuity is P1/deferred and is not part of the current V0.1A completion gate.

Whole-plan ranking is a separate rule set. Several cross-day priorities—such as
one high-risk day versus two lower-risk days—remain Decision Gates and must not
be inferred from this daily hierarchy.

## 6. Current and future domain objects

For contracts already implemented by CE-01, `src/lib/route/types.ts` is the
authority for the exact current TypeScript shape. This section describes their
domain roles; it does not duplicate their interfaces or override this document's
algorithm semantics.

### Property

Current route-domain concepts include:

- identity, address/display name, and location identity;
- viewing time type: fixed, window, flexible, or unconfirmed;
- date where supplied by the viewing-time input;
- must / if-time importance;
- viewing duration;
- optional agent;
- status.

The current `Property` uses a structured `viewingTime` union rather than raw
flattened earliest/latest fields. CE-01 also defines normalized-output type
vocabulary, but CE-03 will implement the day-scoped transformation to normalized
start bounds.

### Single-day settings

Current CE-01 source: `PlanSettings`.

Target name after CE-01.1: `DayPlanSettings`.

It represents exactly one date and includes origin, earliest start, latest end,
transport strategy, taxi-budget state, fixed-appointment buffer, and route
preferences.

CE-01.1 changes this contract's name only; its current fields and invariants
remain unchanged.

### Daily route outputs

Current route-level names remain appropriate:

- `RouteStop`
- `SimulationResult`
- `RouteCandidate`
- `RouteOption`

Current CE-01 result name: `OptimizationResult`.

Target name after CE-01.1: `DayRouteOptimizationResult`.

CE-01.1 changes this result contract's name only; its current fields and
invariants remain unchanged.

### Multi-day contracts

The multi-day layer will eventually represent available dates, per-date
availability, eligible days, Day Assignments, active days, aggregated metrics,
and an optimization result. This document intentionally does not prescribe
concrete TypeScript interface names or fields before CE-17 and its Decision
Gates.

## 7. Day-scoped viewing-time normalization

Normalization is evaluated for one target `CalendarDate`.

- Fixed 14:00 on the target date → earliest and latest start are 14:00.
- The same fixed appointment normalized for another date → not eligible for that day.
- 13:00–15:00 on the target date → direct start-time window.
- “Finish before 17:00” → derive latest start using viewing duration.
- Flexible → use the target day's planning window after eligibility is established.
- Unconfirmed → may participate in daily candidates but is not a mandatory anchor; undated eligibility remains unresolved.

“Not eligible for this target day” is distinct from malformed input. If viewing
duration changes, every derived finish-before window must be recalculated.

## 8. Daily hard constraints and time anchors

Hard constraints take priority over efficiency and cost:

- valid target date and time windows;
- fixed appointment remains on its date and time;
- must-visit properties are preserved or produce an explicit conflict;
- no start before daily earliest start;
- no silent exceedance of daily latest end;
- completed properties are frozen in later rerouting work;
- viewing duration and fixed-appointment buffer are included;
- fixed times and narrow windows form time anchors;
- missing travel data is not fabricated;
- the applicable taxi budget is not exceeded.

Must-visit properties must never be silently deleted. A fixed appointment whose
date is absent from the user's available dates produces an actionable
multi-day-input conflict; the planner must not activate that date automatically.

## 9. Rules and search strategy are separate

Business/domain rules define truth. Search strategies choose what to explore.
Search may call pure evaluators but must not define the evaluators' semantics.

Business/domain rules include:

- date eligibility;
- window normalization;
- `canFitInGap` and other feasibility checks;
- timeline simulation;
- hard constraints and must-visit preservation;
- appointment buffers;
- transport-mode legality and availability;
- budget validity and exceedance;
- transit risk and taxi value;
- candidate metrics;
- ranking and explanations.

Search responsibilities include:

- which property orders to try;
- which property to attempt in which gap;
- which eligible day to assign a property to;
- which legal transport-mode combinations to enumerate;
- traversal order and search-space pruning.

Initial daily and Day Assignment searches may use DFS/backtracking. Future
Branch and Bound, Beam Search, or solver-based implementations must be
replaceable without rewriting normalization, simulation, constraints, risk,
ranking, or explanations.

## 10. Daily gap feasibility and insertion search

Time anchors form the skeleton of one Daily Route.

The pure feasibility rule for inserting a property before the next anchor is:

```text
currentEnd
+ travelToCandidate
+ candidateDuration
+ travelToNextAnchor
+ safetyBuffer
<= nextAnchorLatestTime
```

This rule determines whether a proposed insertion fits. The search strategy
determines which flexible or wide-window properties to try before, after, or
between which anchors. Search may prefer exploring insertions that could
increase completion, but final completion and risk value are determined by
simulation and ranking rules outside the traversal.

## 11. Travel architecture and precomputed matrix

Travel acquisition is outside the route engine.

Future intended ownership is `src/lib/travel/` for:

- `TravelTimeProvider` and provider implementations;
- travel edges and matrix construction;
- provider failure handling;
- external travel-data acquisition.

`src/lib/route/` must not import or know about `TravelTimeProvider`. The Daily
Route optimizer consumes a precomputed `TravelMatrix` only. The multi-day
planner orchestrates daily optimization with precomputed data and must not call
providers inside assignment search, route search, simulation, or ranking.

V0.1A uses deterministic mock travel data. A later real provider may replace the
mock acquisition layer without changing optimizer rules.

## 12. Public-transit executability risk

Transit is evaluated by more than nominal duration. Current configurable V0.1A
risk guidance is:

```text
riskScore =
  (transferCount >= 2 ? 2 : 0)
+ (walkMeters >= 800 ? 1 : 0)
+ (buffer < 10 ? 2 : buffer < 15 ? 1 : 0)
+ optional complex-transfer adjustment
```

- 0–1 → Low
- 2 → Medium
- ≥3 → High

When daily candidates have similar travel time, prefer the lower-risk option
with more buffer according to the daily hierarchy. Risk thresholds stay in
centralized configuration. Whole-plan risk aggregation is unresolved and is not
defined by summing these scores here.

## 13. Route order and transport mode are jointly optimized

Do not permanently implement:

```text
pick order first → choose transit/taxi later
```

Transport mode can change which property order is feasible or optimal.

Mode legality is a domain rule. Enumerating which legal mode sequences to
explore is search strategy. Every explored order/mode combination must be
simulated from the start of the Daily Route.

### transit_only

- The main Daily Route does not proactively use taxi.
- If transit cannot satisfy a critical window, taxi may appear only as a later backup/Plan B suggestion.

### transit_first

Default strategy:

- baseline comparison includes all-transit;
- baseline comparison includes relevant one-taxi-leg combinations;
- baseline comparison includes relevant two-taxi-leg combinations;
- other necessary key combinations may also be explored;
- the applicable taxi budget is never exceeded.

The zero/one/two-leg comparison depth is a baseline coverage requirement, not a
permanent universal maximum.

### efficiency_first

- May explore more legal taxi combinations.
- Still cannot exceed the applicable budget.

V0.1A validates local enumeration for 4–8 properties. This is performance
coverage, not a supported-input maximum.

## 14. When taxi is valuable

Taxi is not recommended merely because it is faster. V0.1A prioritizes:

### `avoid_late`

Transit misses the next valid daily window while taxi restores feasibility.

### `transit_detour`

Current configurable guidance may use:

```text
minutesSaved >= 25
AND transitMinutes / taxiMinutes >= 1.8
```

or multiple transit transfers. The threshold is internal and is not ordinary
user input.

### `unlock_extra_viewing`

Changing a key leg to taxi allows another property to be completed before the
daily latest end or restores daily must-visit feasibility.

Overall schedule value takes priority over pure minutes saved per currency unit.
Whether a taxi budget is shared across the whole Viewing Plan or assigned per
day remains an unresolved Decision Gate.

## 15. Full same-day timeline simulation

Every explored property-order and mode combination must be simulated from the
daily start. Recalculate:

- arrival;
- waiting;
- viewing start and end;
- buffer;
- estimated daily end;
- taxi cost;
- completion count;
- risk.

Do not replace one segment duration without recalculating downstream times. Each
active date is simulated independently and must have a monotonic 0–1439
timeline.

## 16. Daily candidate ranking

The current recommended Daily Route comparison key is:

```text
hardViolationCount      ascending
mustCompletedCount      descending
completedCount          descending
riskPenalty             ascending
totalTravelMinutes      ascending
taxiCost                ascending
experiencePenalty       ascending
```

Only compare the next field when the preceding field is equal or equivalent.
Search traversal must not own or change this hierarchy.

Same-agent preference is P1/deferred and is not required for CE-14, CE-16,
CE-21, or current V0.1A acceptance.

## 17. Daily option extraction

From daily candidates, extract and deduplicate:

- **Cheapest** — feasible Daily Route with lowest taxi spend.
- **Recommended** — Daily Route selected by the hierarchy above.
- **Fastest** — feasible Daily Route finishing earliest or minimizing travel within strategy and budget.

Deduplicate by property order plus transport-mode sequence. If all labels resolve
to one Daily Route, expose one option with the applicable labels.

This section does not decide whether the final multi-day result exposes one
whole plan, three whole-plan options, or daily alternatives. That topology is an
unresolved Decision Gate.

## 18. Explanations and conflicts

Optimization must output human-readable explanations and structured codes.
Daily coverage includes, where applicable:

- `appointment_conflict`
- `time_window_conflict`
- `late_risk` as risk, not a feasibility violation
- `end_time_exceeded`
- `address_unresolved`
- `taxi_budget_exceeded`
- `transit_detour`

Taxi explanations show estimated cost, minutes saved, and schedule value.
Multi-day explanations must eventually identify why a user-supplied date was
activated and why a property was assigned to an eligible day. They must never
suggest or use an unavailable date.

## 19. Deferred/P1 route behavior

### Route opportunity cost

For an `if_time` property, a future implementation may compare the best route
with and without the property and report its impact. A must-visit property is
never auto-removed.

### Same-agent soft constraint

Same-agent continuity may affect a future experience tie-break only when higher
daily metrics are equivalent. It must never cause lateness. This is Case 12 and
is explicitly outside current V0.1A completion.

### Plan B

Plan B may inspect fragile daily nodes and try a key taxi leg before moving or
skipping a non-must flexible property. It must reuse the same business rules and
must not become another optimization engine. This is Case 15 and is deferred.

### Dynamic rerouting

Future daily rerouting freezes completed properties, current location, current
time, and where practical the executing leg, then reuses the same Daily Route
Optimization rules for remaining properties. This is Case 14 and is deferred.
Whether future rerouting may reassign a flexible property across user-supplied
dates remains an unresolved Decision Gate.

## 20. Scale boundaries

V0.1A tests and tunes the core scenario of 4–8 properties. More than eight
properties is not invalid input and must not be rejected solely because of this
target. Future 10–15-property support should primarily strengthen or replace
candidate search rather than rewrite business rules. The exact crossover is
unresolved pending performance evidence.

V0.1 product/UI may expose up to three available dates. Three is not a permanent
domain maximum; collections must not be fixed three-element tuples, and future
four- or five-day support should not require a domain redesign.

## 21. Core Engine boundary

The Core Engine Proof covers the complete deterministic Daily Route engine,
integrated daily optimizer, multi-day eligibility and Day Assignment layer,
whole-plan assembly/ranking, and integrated multi-day optimizer.

Substantial product UI begins only after the integrated multi-day engine passes
deterministic acceptance and review. This boundary does not automatically
authorize UI, providers/maps, LocalStorage, dynamic rerouting, or Plan B.

Detailed CE status, test mappings, Decision Gates, definitions of done, and
non-goals exist only in `docs/CORE_ENGINE_BACKLOG.md`.

Do not use machine learning for V0.1 optimization.
