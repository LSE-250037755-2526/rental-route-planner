# Project Instructions

## Product

This is a mobile-first rental viewing planner.

The product helps users turn multiple rental properties, viewing appointments,
available dates, daily availability, time constraints, and transport choices
into an executable Viewing Plan. A Viewing Plan may use one or more active dates;
each active date contains exactly one Daily Route.

This product is NOT:

- a rental listing marketplace
- a real-time navigation app
- a shortest-distance route planner

The core value is executable schedule optimization.

## Source of Truth

Before making product, route-logic, or planning-logic changes, read:

1. `AGENTS.md` for engineering governance
2. `docs/CORE_ENGINE_BACKLOG.md` for the detailed CE implementation ledger
3. the relevant authoritative documents below

Document ownership is:

- `docs/MVP.md` — MVP scope, target user, core value, and product boundaries
- `docs/PRD.md` — product behavior, inputs, flows, states, conflicts, outputs, and acceptance semantics
- `docs/ROUTE_ALGORITHM.md` — daily-route and multi-day optimization/domain semantics
- `docs/TEST_CASES.md` — deterministic acceptance specifications
- `docs/CORE_ENGINE_BACKLOG.md` — CE status, sequencing, dependencies, tests, gates, and definition of done
- `AGENTS.md` — engineering governance and mandatory guardrails

The backlog coordinates implementation but does not override product or
algorithm semantics in the authoritative documents. Detailed CE changes belong
in the backlog rather than being duplicated across the other documents.

If requirements appear inconsistent, do not silently choose one. Report the
contradiction before changing behavior.

## Terminology

- **Viewing Plan / Multi-day Plan** — the complete user plan spanning one or more active dates.
- **Available Date** — a date supplied by the user as possible.
- **Active Date / Active Day** — an available date selected by the optimizer for use.
- **Eligible Day** — an available date on which a property is allowed to be scheduled.
- **Day Assignment** — assignment of properties to eligible active days.
- **Daily Route** — the route for exactly one active `CalendarDate`.
- **Daily Route Optimization** — ordering, mode, and timeline optimization within one date.
- **Multi-day Planning** — day assignment, daily optimization, aggregation, and whole-plan ranking.

Use “route” primarily for one Daily Route and “plan” primarily for the aggregate
Viewing Plan.

## Product Principles

The main user flow is:

Add properties
→ Set available dates and trip conditions
→ Generate Viewing Plan
→ Route Center
→ Follow each active day's Daily Route

The user supplies available dates and availability for each date. The optimizer
selects which supplied dates become active and may use fewer dates than the user
provided. It must never silently use an unavailable date. Optional constraints
such as maximum active days or a finish-by date restrict, but do not replace,
the optimizer's active-day decision.

Timeline is the primary information structure within each active day. Map is
secondary and helps users understand spatial distribution.

Input must remain lightweight. Do not introduce unnecessary forms or
configuration options.

Use user-friendly wording in the UI. Avoid exposing internal algorithm
terminology such as:

- hard constraint
- lexicographic ranking
- optimization score
- route penalty

## Optimization Principles

Multi-day planning and Daily Route Optimization are separate layers:

```text
available dates and per-date availability
→ eligible-day derivation
→ replaceable Day Assignment search
→ optimize each active day independently
→ aggregate whole-plan metrics
→ rank whole-plan candidates
```

Within a Daily Route, the engine does not optimize only for shortest distance.
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

- use a date the user did not supply as available
- move a fixed appointment to another date or time
- assign a property outside its eligible days
- remove a must-visit property
- exceed the applicable taxi budget
- overwrite an accepted route
- reorder completed properties
- fabricate missing travel data

Public transit is the default. Taxi should only be recommended when it
materially improves the relevant Daily Route, for example by avoiding lateness,
avoiding a major transit detour, allowing an additional viewing, or restoring
must-visit feasibility.

Daily candidates and whole-plan candidates must use the hierarchical rules in
`docs/ROUTE_ALGORITHM.md`. Do not replace those rules with one opaque weighted
score. Whole-plan policies marked as Decision Gates remain unresolved until the
backlog says otherwise.

## Architecture

Planning and route logic must remain independent from React UI. Do not
implement optimization directly inside React components.

Responsibility boundaries are mandatory even if exact future filenames evolve:

```text
src/lib/route/
  daily route domain and business rules
  search/
    replaceable daily candidate-generation/search strategy

src/lib/plan/
  future multi-day domain rules and aggregation
  search/
    future replaceable Day Assignment search

src/lib/travel/
  travel acquisition, providers, and TravelMatrix construction
```

Business/domain rules include date eligibility, normalization, gap feasibility,
timeline simulation, hard constraints, must-visit preservation, buffers,
transport-mode legality, budget validity, risk, taxi value, candidate metrics,
ranking, and explanations.

Search strategy decides which property orders, gap insertions, eligible-day
assignments, and legal transport-mode combinations to explore. Search may call
pure rule evaluators, but it must not define domain truth.

Do not hide ranking, risk, explanations, or hard constraints inside DFS or any
other traversal. DFS/backtracking is an initial replaceable strategy; future
Branch and Bound, Beam Search, or solver-based search must not require rewriting
the domain rules.

The V0.1A scenario and performance target is 4–8 properties. This is not a
product, engine, or validation maximum. Do not hardcode an eight-property limit
solely from that target. V0.1 product/UI may expose up to three available dates,
but the domain architecture must not permanently cap plans at three days.

## Time Model

Each Daily Route has exactly one `CalendarDate` and its own same-day time axis:

- `CalendarDate` target format is strict `YYYY-MM-DD`.
- `ClockTime` target format is strict `HH:mm`.
- `MinuteOfDay` is an integer from 0 through 1439.
- Available dates may be non-consecutive.
- A Daily Route must not silently cross or wrap past midnight.
- Multi-day planning must not use one cumulative cross-day minute axis.
- Route logic must not depend on `Date.now()`, locale parsing, or optimizer timezone state.

Current source aliases are not proof that CE-02 validation already exists.

## Travel Data

Travel acquisition is outside the route engine.

`src/lib/travel/` should own provider abstractions, mock/real provider behavior,
travel-data failure handling, and TravelMatrix construction. `src/lib/route/`
must not import or know about `TravelTimeProvider`.

The Daily Route optimizer consumes a precomputed `TravelMatrix` only. The
multi-day planner may orchestrate daily optimization with precomputed data, but
provider calls must not occur inside assignment search, route search,
simulation, or ranking.

V0.1 uses deterministic mock travel data. Real map integration comes later
without changing optimizer business rules.

## Core Engine Development Scope

The Core Engine Proof runs through an accepted integrated multi-day optimizer:

daily domain engine
→ integrated Daily Route optimizer
→ multi-day planning layer
→ integrated multi-day optimizer
→ only then substantial product UI work may be considered

The detailed and current CE sequence exists only in
`docs/CORE_ENGINE_BACKLOG.md`.

Substantial UI must not begin before CE-21 passes deterministic acceptance and
review. Passing CE-21 establishes only the earliest allowed point; it does not
authorize UI work automatically.

Real providers/maps, LocalStorage, dynamic rerouting, and Plan B require their
own later approved scope. Do not begin them as part of the Core Engine Proof.

## Coding Rules

Use TypeScript.

Prefer strict typing. Avoid `any` unless there is a documented reason.

Prefer small pure functions for domain rules. Keep business logic separate from
UI components and from replaceable search traversal.

Do not modify unrelated modules while implementing a task. Do not introduce
large dependencies without explaining why. Do not use machine learning for
V0.1 optimization. Keep configurable thresholds in centralized config files.

Current source uses the daily contracts `DayPlanSettings` and
`DayRouteOptimizationResult`. CE-01.1 completed this name-only clarification
without changing their fields or invariants. Do not create multi-day source
contracts before CE-17.

## Testing Rules

Testing is continuous. Each daily and multi-day CE milestone must define or
update deterministic tests before or alongside implementation and pass them
before moving on.

Before changing optimization logic, read `docs/TEST_CASES.md` and the relevant
entry in `docs/CORE_ENGINE_BACKLOG.md`.

Search-strategy refactors must preserve rule-level tests. Replacing traversal
must not require rewriting expected domain behavior.

Tests should verify, where relevant:

- route feasibility
- property order and Day Assignment
- active dates are a subset of supplied dates
- fixed appointments stay on their dates
- transport mode
- taxi-budget behavior
- time-window compliance
- must-visit handling
- conflict codes
- deterministic per-day timelines
- explanations and reason codes

Case 12 is P1/deferred. Cases 14 and 15 are also deferred from current Core
Engine completion. Do not add them to CE-14, CE-16, CE-21, or another V0.1A
completion gate.

## Change Workflow

Before making a substantial change:

1. Read `AGENTS.md`, `docs/CORE_ENGINE_BACKLOG.md`, and relevant authoritative documents.
2. Explain the planned change and identify affected files.
3. Confirm unresolved Decision Gates are not being silently decided.
4. Implement the smallest coherent change.
5. Add or update deterministic tests continuously.
6. Run relevant tests, lint, TypeScript checking, and `git diff --check`.
7. Report modified files, rule mappings, uncovered cases, and unrelated-rule preservation.

Do not rewrite large unrelated parts of the project without approval.
