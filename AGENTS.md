# Project Instructions

## Product

This is a mobile-first rental viewing route planner.

The product helps users turn multiple rental properties, viewing appointments,
time constraints, and transport choices into an executable viewing schedule.

This product is NOT:

- a rental listing marketplace
- a real-time navigation app
- a shortest-distance route planner

The core value is executable schedule optimization.

## Source of Truth

Before making product or route-logic changes, read:

1. `docs/MVP.md`
2. `docs/PRD.md`
3. `docs/ROUTE_ALGORITHM.md`
4. `docs/TEST_CASES.md`

For route optimization logic:

`docs/ROUTE_ALGORITHM.md` is the primary source of truth.

For product behavior, fields, page rules, and acceptance criteria:

`docs/PRD.md` is the primary source of truth.

For scope and priorities:

`docs/MVP.md` is the primary source of truth.

For route-engine acceptance:

`docs/TEST_CASES.md` is the primary source of truth.

If requirements appear inconsistent, do not silently choose one.
Report the contradiction before changing behavior.

## Product Principles

The main user flow is:

Add properties
→ Set trip conditions
→ Generate viewing route
→ Route center
→ Start viewing

Timeline is the primary information structure.

Map is secondary and helps users understand spatial distribution.

Input must remain lightweight.

Do not introduce unnecessary forms or configuration options.

Use user-friendly wording in the UI.

Avoid exposing internal algorithm terminology such as:

- hard constraint
- lexicographic ranking
- optimization score
- route penalty

## Route Optimization Principles

The route engine does NOT optimize only for shortest distance.

It jointly optimizes:

- property order
- transport mode
- appointment feasibility
- must-visit completion
- completed-property count
- lateness risk
- total travel time
- taxi cost
- route experience

Never silently:

- move a fixed appointment
- remove a must-visit property
- exceed taxi budget
- overwrite an accepted route
- reorder completed properties
- fabricate missing travel data

Public transit is the default.

Taxi should only be recommended when it materially improves the whole-day plan,
for example:

- avoiding lateness
- avoiding a major public-transit detour
- allowing an additional viewing
- restoring feasibility of a must-visit property

Candidate routes must be compared using the hierarchical rules defined in
`docs/ROUTE_ALGORITHM.md`.

Do not replace these rules with one opaque weighted score.

## Architecture

Route optimization logic must remain independent from React UI.

Do NOT implement route calculation directly inside React components.

Core route logic should live under:

`src/lib/route/`

Suggested structure:

```text
src/lib/route/
├─ types.ts
├─ config.ts
├─ normalizeWindows.ts
├─ simulateTimeline.ts
├─ generateOrders.ts
├─ enumerateModes.ts
├─ calculateRisk.ts
├─ rankRoutes.ts
├─ optimizeRoute.ts
└─ providers/
   ├─ TravelTimeProvider.ts
   └─ MockTravelTimeProvider.ts
```

The UI should consume route-engine outputs rather than reimplement route rules.

## Travel Data

The route engine must read from a precomputed travel matrix.

Do not call a map API inside route-search loops.

Use an abstraction such as:

```ts
interface TravelTimeProvider {
  getTransitRoute(
    from: Location,
    to: Location
  ): Promise<TransitRoute>;

  getTaxiRoute(
    from: Location,
    to: Location
  ): Promise<TaxiRoute>;
}
```

V0.1 should use:

`MockTravelTimeProvider`

Real map integration should come later without changing the core optimizer.

## V0.1 Development Scope

Build V0.1 before integrating a real map API.

V0.1 should support:

- manual property input
- fixed viewing times
- viewing time windows
- flexible viewing times
- must-visit / if-time priority
- trip start and end time
- three transport strategies
- optional taxi budget
- mock transit and taxi data
- hard-constraint checking
- DFS / backtracking candidate generation
- appointment-gap insertion
- public-transit risk
- taxi combination comparison
- full timeline simulation
- cheapest / recommended / fastest outputs
- explanation codes
- route timeline UI
- map placeholder
- LocalStorage persistence

Do not add Supabase or real map APIs until the route engine is stable.

## Coding Rules

Use TypeScript.

Prefer strict typing.

Avoid `any` unless there is a documented reason.

Prefer small pure functions for route logic.

Keep business logic separate from UI components.

Do not modify unrelated modules while implementing a task.

Do not introduce large dependencies without explaining why.

Do not use machine learning for V0.1 route optimization.

Keep configurable thresholds in centralized config files.

## Testing Rules

Route-rule changes require tests.

Before changing route logic, read:

`docs/TEST_CASES.md`

Important rules must have deterministic test data.

Tests should verify:

- route feasibility
- property order
- transport mode where relevant
- taxi budget
- time-window compliance
- must-visit handling
- conflict codes
- reroute behavior
- explanation codes

Completed properties must never be reordered during rerouting.

Must-visit properties must never be silently removed.

## Implementation Order

Unless explicitly instructed otherwise, implement in this order:

1. Core data models
2. Time-window normalization
3. Timeline simulation
4. Hard constraints
5. Candidate order generation
6. Public-transit risk
7. Transport-mode combinations
8. Candidate route comparison
9. Explanation generation
10. Cheapest / recommended / fastest extraction
11. Unit tests
12. Basic UI
13. LocalStorage
14. Real map API
15. Dynamic rerouting
16. Plan B

Do not start with a visually polished UI before the route engine is testable.

## Change Workflow

Before making a substantial change:

1. Read the relevant documentation.
2. Explain the planned change.
3. Identify affected files.
4. Implement the smallest coherent change.
5. Run relevant tests and linting.
6. Report what changed and any remaining limitations.

Do not rewrite large unrelated parts of the project without approval.
