# Route and Multi-day Planning Test Cases

> Deterministic acceptance source of truth for the Core Engine. Add or update
> automated tests before or alongside the CE milestone that implements a rule.
> Milestone ownership lives only in `CORE_ENGINE_BACKLOG.md`.

## Coverage status

Current V0.1A Daily Route Core Engine specifications:

- Cases 01–11
- Case 13
- Cases 16–17
- CE-16.1 Open/Fixed End acceptance groups 01–28

The CE-16.1 groups below are the locked acceptance contract for the next
milestone. CE-16.1 source and automated-test implementation have not started;
the accepted current source remains the CE-16 origin-to-properties baseline.

Current V0.1A multi-day specifications, introduced with the multi-day layer:

- Cases 18–25

Deferred/P1 specifications, not current V0.1A completion requirements:

- Case 12 — same-agent soft preference
- Case 14 — dynamic rerouting
- Case 15 — Plan B

Case 12 must not be required by CE-14, CE-16, CE-21, or another current Core
Engine completion gate. Cases 14 and 15 likewise remain outside current Core
Engine completion.

Unless a case explicitly tests date handling, its properties are assigned to one
valid target date and its timeline is evaluated only within that date.

## Current Daily Route cases

### Case 01 — Two fixed appointments with enough time

**Given**

- Two fixed-time appointments on the same target date
- Sufficient travel and viewing time

**Expected**

- Generate a conflict-free Daily Route
- Preserve the default appointment buffer

### Case 02 — Time-window property

**Given**

- A property with a 13:00–15:00 start-time window on the target date

**Expected**

- Choose a feasible start within the window
- Do not treat it as fully fixed
- Do not treat it as fully flexible

### Case 03 — “Finish before” conversion

**Given**

- Property must be finished before 17:00 on the target date
- Viewing duration = 30 minutes

**Expected**

- Latest start becomes 16:30
- If viewing duration changes, recalculate the derived window

### Case 04 — Insert a property into an appointment gap

**Given**

- A usable same-day gap exists between fixed appointments
- A flexible or wide-window property can fit

**Expected**

- Pure gap feasibility reports that the proposed insertion fits
- Candidate search may insert the property into that gap
- The next appointment is not late

The feasibility rule and the search choice of which property/gap to try are
separate responsibilities.

### Case 05 — Prefer lower public-transit risk

**Given**

- Option A: transit 28 minutes, 2 transfers, 900 m walking, 5-minute buffer
- Option B: direct rail 31 minutes, 15-minute buffer

**Expected**

- Prefer the lower-risk option even though it is 3 minutes slower

### Case 06 — Taxi avoids lateness

**Given**

- Strategy = public transit first, taxi when necessary
- Transit would arrive late
- Taxi can arrive on time
- Applicable taxi budget is sufficient

**Expected**

- Generate an `avoid_late` taxi recommendation
- Show taxi cost and minutes saved
- Explain that taxi avoids lateness

### Case 07 — Transit detour

**Given**

- Transit = 55 minutes
- Taxi = 18 minutes
- The configured detour threshold is satisfied

**Expected**

- Generate a `transit_detour` candidate
- If the applicable taxi budget is insufficient, the candidate is not adoptable

### Case 08 — Taxi unlocks one extra viewing

**Given**

- All-transit cannot fit one additional property before the daily latest end
- One taxi leg makes the additional property feasible

**Expected**

- Produce `unlock_extra_viewing`
- Recommended Daily Route comparison reflects the completion advantage

### Case 09 — Compare zero, one, and two taxi legs

**Given**

- Applicable taxi budget = ¥60

**Expected**

- Baseline comparison includes all-transit
- Baseline comparison includes every relevant single-taxi-leg plan
- Baseline comparison includes relevant two-taxi-leg plans
- Other necessary key combinations may also be inspected
- Selection uses the full daily timeline, not single-leg minutes per yuan

Zero/one/two taxi legs is baseline comparison coverage, not a permanent maximum.
Mode legality and budget validity are domain rules; enumeration is search.

### Case 10 — Transport mode changes optimal property order

**Given**

- The same assigned property set
- Different mode combinations make different orders feasible

**Expected**

- The optimizer may return a different property order because of transport mode
- It must not lock property order before mode comparison

### Case 11 — Must-visit versus opportunity cost

**Given**

- A must-visit property causes the Daily Route to exceed latest end
- A far non-must property has high potential route opportunity cost

**Expected**

- Preserve the must-visit property and surface the conflict
- Do not silently remove either property
- Opportunity-cost calculation may remain unimplemented because that enhancement is P1

### Case 13 — Deduplicate three Daily Route options

**Given**

- Cheapest, recommended, and fastest resolve to the same property order and mode sequence

**Expected**

- Expose one Daily Route option carrying the applicable objective labels
- Do not show three duplicate options

### Case 16 — Missing address or transit data

**Given**

- Address or public-transit data cannot be resolved

**Expected**

- Do not fabricate route data
- If only taxi data exists and strategy allows it, a clearly marked degraded-data option may be generated
- Otherwise return an actionable error or conflict

### Case 17 — Only one property

**Given**

- Exactly one valid property assigned to a Daily Route

**Expected**

- The Daily Route optimizer accepts and handles the one-property input
- Product UX may suggest adding another property to create a multi-property route
- The multi-property threshold must not make one-property optimizer input invalid

## CE-16.1 Open/Fixed End acceptance groups

These groups extend, rather than invalidate, the accepted CE-16 daily optimizer.
Existing scenarios migrate to explicit Open End unless a scenario specifically
tests Fixed End. Concrete TypeScript type names remain implementation
recommendations until CE-16.1 source work is accepted.

### Open End

1. **Valid finalized route** — An explicit Open End produces a complete,
   finalized Daily Route; it is not treated as missing input, provisional, or
   incomplete.
2. **Completion is final viewing end** — `routeCompletionAt` equals the final
   property's `viewingEndAt`.
3. **No terminal matrix requirement** — Matrix preparation requests no
   property-to-end pair for Open End.
4. **No terminal evidence** — Open End has no terminal leg or mode and adds no
   terminal travel time, taxi cost/count, risk, or taxi explanation.
5. **`latestEnd` boundary** — Final viewing end before or exactly equal to
   `latestEnd` is feasible; a later completion produces
   `end_time_exceeded` with the deterministic exceeded amount.
6. **Distinct from return to origin** — Open End remains different from Fixed
   End at `originLocationId`; the optimizer never silently turns Open into a
   return trip.

### Fixed End

7. **Explicit different destination** — Fixed End with a destination different
   from the final property produces `origin → properties → destination` and an
   ordinary directed terminal leg.
8. **Return to origin** — Return to start is represented as Fixed End whose
   destination identity equals `originLocationId`, not as a special mode or an
   Open default.
9. **Terminal transit within deadline** — Available terminal transit arriving
   before or exactly at `latestEnd` is included and remains deadline-feasible.
10. **Terminal transit after deadline** — Terminal transit arriving after
    `latestEnd` produces `end_time_exceeded`; lateness is represented by
    `exceededByMinutes`.
11. **Terminal taxi restores feasibility** — When legal, available, valuable,
    and within budget, terminal taxi may replace late terminal transit and
    restore deadline feasibility.
12. **Terminal time in totals and completion** — Ordinary terminal travel is
    included in total travel time and route completion is destination arrival,
    not final viewing end.
13. **Terminal taxi in cost, count, and budget** — Ordinary terminal taxi cost
    and leg count are included exactly once and participate in applicable
    budget validity.
14. **Deadline-slack terminal risk** — Signed slack is
    `latestEnd - arrivalAtEndLocation`; CE-11 risk receives
    `max(0, signedSlack)`, while late arrival retains zero risk-buffer input and
    a separate exceeded amount. Existing thresholds and weights are unchanged.
15. **Terminal `avoid_late`** — Terminal taxi that avoids
    `end_time_exceeded` may use `avoid_late`, with `lateIssuesAvoided = 1` and
    `maximumLateByMinutesAvoided` equal to the avoided
    `exceededByMinutes`.
16. **Terminal `transit_detour`** — An ordinary terminal taxi may use the
    existing `transit_detour` reason only when the existing configured rule is
    satisfied.
17. **Terminal `unlock_extra_viewing`** — An ordinary terminal taxi may use the
    existing `unlock_extra_viewing` reason when the existing schedule-value
    rule is satisfied; no terminal-only reason code is introduced.

### Same-location Fixed End

18. **Final property equals destination** — Equal final-property and Fixed-end
    location identities select the same-location terminal path.
19. **Canonical no-travel completion** — Exactly one canonical no-travel
    terminal state completes the route at final viewing end.
20. **No provider or self-edge** — The canonical state requires no provider
    call, no TravelMatrix self-edge, and no reverse-edge inference.
21. **No duplicate terminal candidates** — Search does not generate transit
    and taxi variants for the same-location terminal.
22. **Zero terminal contribution** — The terminal contributes zero travel
    time, cost, taxi count, and risk and requires no terminal mode.

### General end-contract coverage

23. **Terminal travel-data states** — Ordinary Fixed terminal handling
    preserves missing-entry, unavailable, degraded, and provider-failure
    distinctions; it does not infer reverse data or fabricate zero-duration
    travel.
24. **Same-day overflow** — Terminal travel that exceeds minute 1439 or crosses
    the day boundary is not wrapped into the next day and produces the
    applicable deterministic conflict.
25. **Open/Fixed identity** — Candidate and option identity never deduplicates
    Open End with Fixed End, including Fixed no-travel.
26. **Destination/mode identity** — Identity distinguishes different Fixed
    destinations and ordinary terminal transit from ordinary terminal taxi.
27. **Determinism and immutability** — Repeated evaluation yields equivalent
    ordered results without mutating settings, properties, travel data, or
    prior results.
28. **CE-16 regression coverage** — Existing CE-16 acceptance scenarios retain
    their accepted behavior after being migrated to explicit Open End, except
    where a scenario is intentionally converted to test Fixed End.

## Deferred/P1 Daily Route cases

### Case 12 — Same agent is only a soft constraint

**Status:** P1 / deferred; not required for current V0.1A Core Engine acceptance.

**Given**

- Two properties share the same agent

**Expected**

- Prefer consecutive scheduling only when higher-level metrics are equivalent and within the future configured threshold
- If consecutive scheduling creates lateness, do not group them

### Case 14 — Dynamic rerouting freezes completed work

**Status:** Deferred until post-Core-Engine dynamic rerouting work.

**Given**

- A property is cancelled or rescheduled after part of a day is complete

**Expected**

- Completed properties remain unchanged
- Re-run the same Daily Route rules from current location/time for remaining properties
- Cross-day reassignment behavior remains a Decision Gate

### Case 15 — Plan B before full reroute

**Status:** Deferred until post-Core-Engine Plan B work.

**Given**

- A viewing overruns and creates a high-risk node
- A pre-generated Plan B can restore daily feasibility

**Expected**

- Offer Plan B first
- If Plan B cannot restore feasibility, run full Daily Route rerouting

## Current Multi-day Planning cases

### Case 18 — Cross-date fixed appointments succeed

**Given**

- Available date 2026-09-20 with availability 09:00–18:00
- Available date 2026-09-21 with availability 09:00–18:00
- Property A fixed on 2026-09-20 at 10:00
- Property B fixed on 2026-09-21 at 14:00
- Deterministic travel data makes each appointment reachable on its date

**Expected**

- Multi-day planning succeeds
- A remains on 2026-09-20
- B remains on 2026-09-21
- No fixed appointment crosses dates
- Each Daily Route timeline is independently monotonic

### Case 19 — Flexible property is assigned to the better eligible day

**Given**

- Available dates: 2026-09-20 and 2026-09-21, both 09:00–18:00
- Fixed A is on 2026-09-20 at 10:00
- Fixed B is on 2026-09-21 at 10:00
- Flexible C is eligible for both dates and takes 30 minutes
- All higher-level feasibility/completion/risk metrics are equal
- Deterministic matrix: A→C transit = 60 minutes; B→C transit = 10 minutes

**Expected**

- C is assigned to 2026-09-21
- The assignment is deterministic for the same inputs and matrix
- No unavailable date is activated

### Case 20 — Day 1 cannot fit everything, so flexible property moves to Day 2

**Given**

- 2026-09-20 availability = 09:00–12:00
- 2026-09-21 availability = 09:00–18:00
- A has a fixed appointment on 2026-09-20 at 10:00
- Flexible B is eligible for both dates
- Deterministic travel and viewing durations make B infeasible on 2026-09-20 but feasible on 2026-09-21

**Expected**

- A remains on 2026-09-20
- B is assigned to 2026-09-21
- Both Daily Routes respect their own availability

### Case 21 — Must-visit properties are distributed across days

**Given**

- Available dates: 2026-09-20 and 2026-09-21
- Must-visit A is fixed on 2026-09-20 at 10:00
- Must-visit B is fixed on 2026-09-21 at 14:00
- Must-visit C is eligible only on 2026-09-21 and has a feasible window before B
- Deterministic travel data makes A feasible on Day 1 and C→B feasible on Day 2

**Expected**

- All must-visit properties are preserved
- A is assigned to 2026-09-20
- C and B are assigned to 2026-09-21 in a feasible order
- No must-visit is silently removed or moved outside its eligible days

### Case 22 — Fixed appointment date is unavailable

**Given**

- The only available date supplied is 2026-09-20
- Property A is fixed on 2026-09-21 at 14:00

**Expected**

- Return an explicit actionable conflict for the unavailable fixed date
- Do not activate 2026-09-21
- Do not move A to 2026-09-20
- Exact multi-day success/partial/failure status remains governed by Decision Gate I

### Case 23 — Three dates are available but only two are active

**Given**

- Available dates: 2026-09-20, 2026-09-21, and 2026-09-22
- A is fixed on 2026-09-20
- B is fixed on 2026-09-21
- All submitted properties fit across those two dates
- No property requires 2026-09-22

**Expected**

- Active dates are exactly 2026-09-20 and 2026-09-21
- 2026-09-22 remains unused
- The user is not required to choose “two days” in advance

### Case 24 — Daily availability differs by date

**Given**

- 2026-09-20 availability = 09:00–18:00
- 2026-09-21 availability = 13:00–17:00
- A is eligible for 2026-09-20 and scheduled at 10:00
- B is eligible for 2026-09-21 and fixed at 14:00

**Expected**

- Day 1 scheduling uses only 09:00–18:00
- Day 2 scheduling uses only 13:00–17:00
- Each Daily Route validates its own start/end bounds independently

### Case 25 — One supplied date is infeasible and no date is invented

**Given**

- The only available date is 2026-09-20, 09:00–12:00
- Must-visit A is fixed at 10:00
- Must-visit B is fixed at 10:15
- Viewing duration and deterministic travel data make both appointments impossible to satisfy

**Expected**

- Do not fabricate or activate 2026-09-21
- Preserve both must-visit properties in the conflict information
- Explain that supplied availability is insufficient
- Provide an actionable path to add another available date or modify an appointment
- Exact multi-day success/partial/failure status remains governed by Decision Gate I

## Decision-Gate acceptance placeholders

The following scenario stays documented but does not enter current passing
criteria until its gate closes:

1. A feasible one-day plan with tighter buffers, higher risk, or more taxi use versus a feasible lower-risk two-day plan. Gate A decides the recommendation hierarchy.

Do not encode an expected winner for that scenario yet.

Gate B is user-resolved. Future CE-17 through CE-20 multi-day acceptance must
include a plan whose aggregate taxi spend is tested against one shared
whole-plan budget. The full cap must not be independently reusable on every
active day. This is not current source behavior until the multi-day layer is
implemented.

## Cross-cutting automated-test expectations

For each applicable Core Engine test:

- use deterministic dates, settings, and mock travel data;
- assert exact or bounded ordering only where the product rule requires it;
- assert transport mode where relevant;
- assert feasibility and conflict codes;
- assert each Daily Route respects its current applicable budget contract and,
  once multi-day budget aggregation is implemented, assert total plan taxi
  spend does not exceed the one shared whole-plan budget;
- assert must-visit properties are never silently removed;
- assert active dates are a subset of user-supplied dates;
- assert fixed appointments never change dates;
- assert Day Assignment is deterministic for deterministic inputs;
- assert every Daily Route timeline is independently monotonic within 0–1439;
- assert no Daily Route silently wraps midnight;
- assert explanations/reason codes for key decisions;
- keep rule-level expectations independent from DFS or another traversal implementation.
