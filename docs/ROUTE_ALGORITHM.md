# Route Algorithm Contract

> Source of truth: distilled from `PRD.md` V1.2 sections 8 and 17.3–17.5, plus the route-enhancement scope in `MVP.md`.
>
> This document defines the route engine contract. UI code must not silently change these rules.

## 1. Core objective

The system does **not** optimize only for shortest geographic distance.

It optimizes **property order + transport mode jointly** under appointment time windows, must-visit priority, latest end time, viewing duration, buffer time, transport strategy, and optional taxi budget.

The goal is to complete as many high-priority properties as possible in a short period while reducing lateness risk, travel time, unnecessary taxi spending, backtracking, transfers, walking, and waiting.

## 2. Decision priority

Candidate route options are compared lexicographically / hierarchically, not by one opaque weighted score:

1. Hard constraints: time-window feasibility, must-visit preservation, latest-end feasibility.
2. Completion efficiency: maximize feasible completed properties and use available gaps.
3. Executability: minimize lateness risk and preserve reasonable buffers.
4. Transport efficiency: reduce total travel time and obvious backtracking.
5. Cost efficiency: prefer public transit, use taxi only on high-value legs, stay within budget.
6. Experience: fewer transfers, less walking, less waiting, same-agent continuity when higher-level metrics are equivalent.

A lower-level objective must never override a higher-level objective.

## 3. Core data objects

### Property

- `id`
- `address`
- `lat/lng`
- `displayName` — defaults from address
- `timeType = fixed | window | flexible | unconfirmed`
- `earliestTime`
- `latestTime`
- `importance = must | if_time`
- `durationMinutes` — default 30
- `agentName?`
- `status`

### PlanSettings

- `date`
- `origin`
- `earliestStart`
- `latestEnd`
- `transportStrategy = transit_only | transit_first | efficiency_first`
- `taxiBudget?`
- `bufferMinutes` — default 15
- `routePreferences[]`

### TravelEdge

- `fromId`
- `toId`
- `transitMinutes`
- `transitCost`
- `transferCount`
- `walkMeters`
- `taxiMinutes`
- `taxiCost`
- `dataStatus`

### RouteStop

- `propertyId`
- `order`
- `arrivalAt`
- `viewingStartAt`
- `viewingEndAt`
- `travelMode = transit | taxi`
- `travelMinutes`
- `travelCost`
- `reasonCodes[]`
- `riskCodes[]`

### RouteOption

- `id`
- `type = cheapest | recommended | fastest`
- `stops[]`
- `completedCount`
- `mustCompletedCount`
- `totalTravelMinutes`
- `estimatedEndAt`
- `taxiCost`
- `taxiLegCount`
- `riskLevel`
- `explanations[]`

### FallbackPlan (P1)

- `trigger`
- `affectedStopId`
- `replacementModes / reorderedPropertyIds`
- `estimatedImpact`

## 4. Normalize all viewing times into time windows

All viewing-time inputs are converted into `earliestTime / latestTime` before optimization.

- Fixed 14:00 → `earliestTime = latestTime = 14:00`
- 13:00–15:00 → direct window
- “Afternoon flexible” → convert using the product preset
- “Finish before 17:00” → derive the latest possible start using `durationMinutes`
- Unconfirmed → may participate in candidate ordering but must not become a mandatory time anchor

If viewing duration changes, any derived “finish-before” window must be recalculated.

## 5. Hard constraints and time anchors

Hard constraints take priority over efficiency and cost:

- valid time windows
- must-visit properties should be preserved
- do not start before `earliestStart`
- aim not to exceed `latestEnd`
- completed properties are frozen
- viewing duration is included
- fixed-appointment buffer is included
- fixed times / narrow windows form time anchors

Must-visit properties must never be silently deleted. If they cannot be satisfied, the route must surface a conflict.

## 6. Candidate order generation and gap insertion

Use time anchors as the skeleton of the day.

Flexible or wide-window properties are inserted before, after, or between anchors only when the insertion remains feasible.

Core feasibility condition:

```text
currentEnd
+ travelToCandidate
+ candidateDuration
+ travelToNextAnchor
+ safetyBuffer
<= nextAnchorLatestTime
```

The engine should proactively detect usable gaps between appointments and prefer insertions that increase completed-property count without increasing lateness risk.

For 4–8 properties, V1 uses DFS / backtracking with hard-constraint pruning. Beam Search can be considered later if scale increases.

## 7. Travel matrix must be precomputed

Before route search, precompute travel data among:

- origin
- every property

Each `TravelEdge` should contain both public-transit and taxi data where available.

The route optimizer **must only read the matrix**. It must not call a map API inside the search loop.

V0.1 uses `MockTravelTimeProvider`.
A later version replaces it with `AmapTravelTimeProvider`.

The route algorithm must remain independent from the map provider.

## 8. Public-transit executability risk

Public transit is evaluated by more than nominal duration.

V1 default configurable risk score:

```text
riskScore =
  (transferCount >= 2 ? 2 : 0)
+ (walkMeters >= 800 ? 1 : 0)
+ (buffer < 10 ? 2 : buffer < 15 ? 1 : 0)
+ optional complex-transfer adjustment
```

Risk level:

- 0–1 → Low
- 2 → Medium
- ≥3 → High

When two options have similar travel time, prefer the lower-risk option with more buffer.

Thresholds must be centralized configuration, not scattered across UI components.

## 9. Route order and transport mode are jointly optimized

Do not permanently implement:

```text
pick order first → choose transit/taxi later
```

Transport mode can change which property order is feasible or optimal.

For every feasible property order, generate transport-mode combinations allowed by the selected strategy and budget, then simulate the full timeline again.

### transit_only

- main route does not proactively use taxi
- if transit cannot satisfy a critical time window, taxi may appear only as a backup / Plan B suggestion

### transit_first

Default strategy.

- compare all-transit
- compare at least one-taxi-leg combinations
- compare at least two-taxi-leg combinations
- include other necessary key combinations when useful
- never exceed budget

### efficiency_first

- may compare more taxi combinations
- still cannot exceed total taxi budget

Because the target route has only 4–8 properties, transport combinations should be enumerated locally from the precomputed matrix rather than triggering new map requests.

## 10. When taxi is valuable

Taxi is not recommended merely because it is faster.

V1 prioritizes three reason codes:

### `avoid_late`

Transit misses the next valid time window, while taxi restores feasibility.

### `transit_detour`

Default internal V1 trigger may be:

```text
minutesSaved >= 25
AND transitMinutes / taxiMinutes >= 1.8
```

or public transit has multiple transfers.

This is an internal configurable threshold and is not exposed to ordinary users.

### `unlock_extra_viewing`

Changing a key leg to taxi allows at least one additional property to be completed before `latestEnd`, or restores feasibility of a must-visit property.

The engine may calculate basic value-for-money, but overall schedule value takes priority over pure “minutes saved per yuan”.

## 11. Full timeline simulation is mandatory

Every property-order + transport-mode combination must be simulated from the start.

Recalculate:

- `arrivalAt`
- waiting time
- `viewingStartAt`
- `viewingEndAt`
- buffer
- `estimatedEndAt`
- taxi cost
- completion count
- risk

Do not locally replace only one segment duration without recalculating all downstream times.

## 12. Candidate ranking

Recommended route uses this comparison key:

```text
hardViolationCount      ascending
mustCompletedCount      descending
completedCount          descending
riskPenalty             ascending
totalTravelMinutes      ascending
taxiCost                ascending
experiencePenalty       ascending
```

Only move to the next field when the previous field is equal / equivalent.

## 13. Extract three user-facing options

From the candidate set, extract and deduplicate:

### Cheapest

Feasible route with the lowest taxi spend.

### Recommended

Default route using the hierarchical comparison above, generally balancing public transit, feasibility, completion count, risk, time, and cost.

### Fastest

Feasible route that finishes earliest / minimizes travel time within the user’s transport strategy and taxi budget.

Deduplicate by the fingerprint of:

```text
property order + transport mode sequence
```

If all three resolve to the same route, show only one result.

## 14. Route opportunity cost (P1)

For `importance = if_time`, the optimizer may compare:

```text
best route with property
vs
best route excluding property
```

Report:

- added travel time
- end-time change
- whether another property becomes infeasible

Never auto-remove a must-visit property.

## 15. Same-agent soft constraint (P1)

Only when higher-level metrics are equivalent should same-agent continuity improve `experiencePenalty`.

Suggested V1 equivalence threshold:

```text
total travel time difference <= 10 minutes
```

Same-agent continuity must never cause lateness or violate a time window.

## 16. Plan B (P1)

After ranking, inspect the 1–2 most fragile nodes, such as:

- `buffer < 15 minutes`
- public-transit `riskLevel = high`

Fallback order:

1. try taxi on the key leg
2. if still infeasible, move / skip a non-must wide-window property

Plan B uses the same route rules and must not become a separate optimization algorithm.

## 17. Dynamic rerouting

When a change occurs:

- freeze completed properties
- freeze current location
- freeze current time
- preserve the currently executing leg where practical
- update changed windows / cancellation / overrun
- apply remaining taxi budget
- call the same `optimizeRoute()` on remaining properties

Do not maintain a separate rerouting engine.

## 18. Required explanation and risk codes

Every optimization must output human-readable explanations plus structured codes.

At minimum support:

- `appointment_conflict`
- `time_window_conflict`
- `late_risk`
- `end_time_exceeded`
- `address_unresolved`
- `taxi_budget_exceeded`
- `transit_detour`

Taxi recommendation explanations must show:

- estimated taxi cost
- minutes saved
- schedule value / reason

## 19. Reference optimization pipeline

```text
optimizeRoute(properties, settings, matrix)
  → normalizeWindows
  → searchFeasibleOrdersWithPruning
  → enumerateModePlans
  → simulateFullTimeline
  → lexicographicRank
  → extractAndDedupe(cheapest, recommended, fastest)
```

## 20. V0.1 implementation boundary

V0.1 should validate route logic before real map integration:

- manual property entry
- fixed / window / flexible viewing time
- `MockTravelTimeProvider`
- hard constraints
- DFS / backtracking + pruning
- automatic gap insertion
- three transport strategies
- 0–2 key taxi-leg combination comparison
- cheapest / recommended / fastest output
- explanations
- timeline + map placeholder

Do not use machine learning for V0.1.
