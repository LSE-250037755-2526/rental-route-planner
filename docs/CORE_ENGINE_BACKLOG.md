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
- CE-01.1 — **NEXT**
- CE-02 through CE-21 — **PLANNED**

Current source includes the Vitest foundation, route-domain models, centralized
configuration, and deterministic configuration tests.

Current source still uses:

- `PlanSettings`
- `OptimizationResult`

CE-01.1 will rename these daily contracts to:

- `DayPlanSettings`
- `DayRouteOptimizationResult`

Those target names have not been implemented yet. No concrete multi-day source
contract, date/time helper, provider, matrix builder, search implementation,
daily optimizer, or multi-day optimizer exists yet.

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

- **Status:** NEXT
- **Prerequisites:** CE-01 and approved documentation migration.
- **Goal:** Remove daily-versus-multi-day naming ambiguity before CE-02.
- **Scope:** Rename `PlanSettings` to `DayPlanSettings` and `OptimizationResult` to `DayRouteOptimizationResult`; update current source references only.
- **Likely ownership:** `src/lib/route/types.ts` and any compile-time references discovered by the task.
- **Deterministic tests:** Existing tests plus TypeScript compilation; add a focused type test only if needed to make the rename reviewable.
- **Mapped TEST_CASES:** None; contract naming only.
- **Decision Gates:** None.
- **Definition of done:** Both renames compile; fields/invariants are unchanged; full tests, lint, type checking, and `git diff --check` pass.
- **Non-goals:** `optimizeDayRoute()`, date logic, multi-day contracts, `eligibleDays`, business-rule changes.
- **Future-scale notes:** Keep `RouteCandidate`, `RouteOption`, `RouteStop`, and `SimulationResult` unchanged.

### CE-02 — Deterministic date/time primitives

- **Status:** PLANNED
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

- **Status:** PLANNED
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

- **Status:** PLANNED
- **Prerequisites:** CE-02 and CE-03.
- **Goal:** Reject malformed daily input without treating valid multi-day product input as invalid.
- **Scope:** Exactly one target date, daily availability bounds, assigned-property date compatibility, valid durations/settings, one-property validity, and required matrix identities where appropriate.
- **Likely ownership:** `src/lib/route/validateDayRouteInput.ts`; `test/route/validateDayRouteInput.test.ts`.
- **Deterministic tests:** Mixed dates in one daily call, one valid property, invalid same-day ranges, empty/malformed inputs, no midnight wrap.
- **Mapped TEST_CASES:** Case 17; daily boundary used by Cases 18, 22, 24, 25.
- **Decision Gates:** None; multi-day partial/failure semantics belong to Gate I and CE-17/20.
- **Definition of done:** A daily call rejects mixed dates locally; multi-date plans are not globally rejected; one-property input remains valid; all checks pass.
- **Non-goals:** Day Assignment, multi-day validation, timeline simulation.
- **Future-scale notes:** No property-count maximum derived from V0.1A guidance.

### CE-05 — Travel-data contracts and matrix builder

- **Status:** PLANNED
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

- **Status:** PLANNED
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

- **Status:** PLANNED
- **Prerequisites:** CE-02, CE-03, CE-04, CE-05, CE-06.
- **Goal:** Simulate a complete same-day route for a supplied order and legal mode sequence.
- **Scope:** Departure, travel, arrival, waiting, viewing start/end, buffers, estimated end, travel/wait totals, taxi cost/count, and downstream recomputation.
- **Likely ownership:** `src/lib/route/simulateTimeline.ts`; `test/route/simulateTimeline.test.ts`.
- **Deterministic tests:** Fixed appointments, windows, waiting, exact totals, downstream changes, 1439 boundary/no-wrap, immutable input.
- **Mapped TEST_CASES:** Cases 01–03 and timeline foundations for Cases 06–10.
- **Decision Gates:** None.
- **Definition of done:** Full same-day simulation is pure and deterministic; every downstream time is recomputed; no provider calls; all checks pass.
- **Non-goals:** Feasibility verdicts, risk score, ranking, search.
- **Future-scale notes:** Simulation API must be reusable by any search strategy.

### CE-08 — Daily constraints, anchors, and conflicts

- **Status:** PLANNED
- **Prerequisites:** CE-07.
- **Goal:** Evaluate daily hard constraints and derive time anchors independently from search.
- **Scope:** Window/appointment/latest-end checks, must-visit preservation, buffer inclusion, travel-data conflicts, anchor derivation, structured violations/conflicts.
- **Likely ownership:** `src/lib/route/evaluateConstraints.ts`, `src/lib/route/deriveAnchors.ts`, focused tests.
- **Deterministic tests:** Conflicting appointments, insufficient travel, must-visit conflict, end-time exceedance, fixed/narrow anchors, risk not misclassified as feasibility.
- **Mapped TEST_CASES:** Cases 01–02 and 11; foundations for Case 04.
- **Decision Gates:** None.
- **Definition of done:** Rules return structured deterministic outcomes; must-visits are never silently removed; search is not implemented here; all checks pass.
- **Non-goals:** Candidate enumeration, risk calculation, multi-day conflicts.
- **Future-scale notes:** Evaluators remain traversal-agnostic.

### CE-09 — Daily candidate-order search

- **Status:** PLANNED
- **Prerequisites:** CE-08.
- **Goal:** Generate deterministic daily property-order candidates through a replaceable search boundary.
- **Scope:** Search interface, initial DFS/backtracking traversal, deterministic ordering, pruning by pure constraint/feasibility callbacks, candidate deduplication.
- **Likely ownership:** `src/lib/route/search/types.ts`, `src/lib/route/search/dfsOrders.ts`, focused search tests.
- **Deterministic tests:** Candidate coverage on small sets, stable traversal, pruning does not redefine rule outcomes, no hard eight-property validation.
- **Mapped TEST_CASES:** Cases 01, 10, 11; preparation for Case 04.
- **Decision Gates:** Gate C records future search crossover but does not block V0.1A DFS.
- **Definition of done:** DFS is replaceable; ranking/risk/explanations are absent from traversal; all checks pass.
- **Non-goals:** Gap-specific search integration, mode combinations, ranking.
- **Future-scale notes:** Strategy interface must support later Branch and Bound, Beam Search, or solver replacement.

### CE-10 — Daily gap feasibility and insertion-search integration

- **Status:** PLANNED
- **Prerequisites:** CE-08 and CE-09.
- **Goal:** Use appointment gaps without collapsing feasibility rules into search.
- **Scope:** Pure `canFitInGap`-style rule plus search integration deciding which property/gap candidates to attempt.
- **Likely ownership:** `src/lib/route/canFitInGap.ts`, `src/lib/route/search/gapInsertion.ts`, separate rule and search tests.
- **Deterministic tests:** Exact fit, one-minute miss, travel-to-next-anchor, buffer inclusion, deterministic candidate insertion.
- **Mapped TEST_CASES:** Case 04.
- **Decision Gates:** None.
- **Definition of done:** Pure feasibility tests pass independently of insertion traversal; inserted candidates do not make the next anchor late; all checks pass.
- **Non-goals:** Risk-based ranking, modes, whole-plan assignment.
- **Future-scale notes:** Another search may reuse the same gap evaluator.

### CE-11 — Transit risk

- **Status:** PLANNED
- **Prerequisites:** CE-07 and centralized CE-01 config.
- **Goal:** Calculate Daily Route/leg transit risk independently from feasibility and search.
- **Scope:** Transfers, walking, buffer thresholds, risk codes/levels, candidate risk metric inputs.
- **Likely ownership:** `src/lib/route/calculateRisk.ts`; `test/route/calculateRisk.test.ts`.
- **Deterministic tests:** Exact threshold boundaries, low/medium/high results, `late_risk` remains risk rather than violation.
- **Mapped TEST_CASES:** Case 05.
- **Decision Gates:** Gate F governs future whole-plan aggregation, not daily calculation.
- **Definition of done:** Risk is deterministic and config-driven; no search or ranking semantics are embedded; all checks pass.
- **Non-goals:** Whole-plan risk, candidate ranking, dynamic prediction.
- **Future-scale notes:** Risk API remains reusable by alternate searches.

### CE-12 — Transport-mode legality and combination search

- **Status:** PLANNED
- **Prerequisites:** CE-05, CE-07, CE-08, CE-09.
- **Goal:** Jointly explore daily order/mode candidates while separating legal truth from enumeration.
- **Scope:** Pure mode availability/strategy legality rules; replaceable enumeration of legal transit/taxi sequences; transit-first baseline coverage of zero, one, and two taxi legs plus other necessary key combinations.
- **Likely ownership:** `src/lib/route/isModeAllowed.ts`, `src/lib/route/search/enumerateModes.ts`, separate rule/search tests.
- **Deterministic tests:** Strategy legality, unavailable mode, baseline combination coverage, mode-dependent order feasibility, deterministic enumeration.
- **Mapped TEST_CASES:** Cases 06–10.
- **Decision Gates:** Gate B budget scope is not decided here; use only the applicable daily budget input supplied by the current contract.
- **Definition of done:** Legality tests pass without enumerator; enumerator never emits illegal modes; zero/one/two is not encoded as a universal hard maximum; all checks pass.
- **Non-goals:** Taxi value, budget-policy interpretation, ranking.
- **Future-scale notes:** Large combination spaces may use stronger search without changing legality.

### CE-13 — Taxi value and budget behavior

- **Status:** PLANNED
- **Prerequisites:** CE-07, CE-08, CE-11, CE-12.
- **Goal:** Enforce the applicable daily taxi budget and explain high-value taxi legs.
- **Scope:** `avoid_late`, `transit_detour`, `unlock_extra_viewing`, configured thresholds, capped/unlimited/unset policy after the task's decision review, budget enforcement.
- **Likely ownership:** `src/lib/route/evaluateTaxiValue.ts`, `src/lib/route/evaluateTaxiBudget.ts`, focused tests.
- **Deterministic tests:** Exact threshold boundaries, insufficient cap, unset-state behavior after approval, full-timeline value, no exceedance.
- **Mapped TEST_CASES:** Cases 06–09.
- **Decision Gates:** Gate B remains unresolved for multi-day scope; CE-13 must not silently choose whole-plan versus per-day semantics.
- **Definition of done:** Daily behavior is explicit and tested; taxi is not recommended merely for being faster; all checks pass.
- **Non-goals:** Whole-plan taxi aggregation, multi-day budget contract, option ranking.
- **Future-scale notes:** Taxi combination strategy remains replaceable.

### CE-14 — Daily hierarchical ranking

- **Status:** PLANNED
- **Prerequisites:** CE-07, CE-08, CE-11, CE-13.
- **Goal:** Rank Daily Route candidates by the confirmed hierarchy without an opaque weighted score.
- **Scope:** Deterministic comparison using violations, must/completed totals, risk penalty, travel, taxi cost, and experience penalty; stable tie behavior.
- **Likely ownership:** `src/lib/route/rankRoutes.ts`; `test/route/rankRoutes.test.ts`.
- **Deterministic tests:** One-field-at-a-time hierarchy, risk versus small time difference, completion versus cost, stable ties.
- **Mapped TEST_CASES:** Cases 05, 08, 11. Case 12 is explicitly not mapped as required.
- **Decision Gates:** None for daily hierarchy; Gates A/F/H apply only to whole-plan ranking.
- **Definition of done:** Higher-level metrics cannot be overridden; search has no ranking semantics; all checks pass.
- **Non-goals:** Same-agent preference (Case 12), whole-plan ranking, option extraction.
- **Future-scale notes:** Comparator remains independent from candidate source.

### CE-15 — Daily cheapest/recommended/fastest extraction

- **Status:** PLANNED
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
