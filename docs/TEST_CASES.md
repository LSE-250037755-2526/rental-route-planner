# Route Algorithm Test Cases

> Source of truth: PRD V1.2 section 17.6.
>
> These are product acceptance cases for the route engine. Convert each case into automated tests before or alongside implementation.

## Case 01 — Two fixed appointments with enough time

**Given**
- Two fixed-time appointments
- Sufficient travel and viewing time

**Expected**
- Generate a conflict-free route
- Preserve the default appointment buffer

## Case 02 — Time-window property

**Given**
- A property with a 13:00–15:00 viewing window

**Expected**
- Choose a feasible arrival within the window
- Do not treat it as fully fixed
- Do not treat it as fully flexible

## Case 03 — “Finish before” conversion

**Given**
- Property must be finished before 17:00
- Viewing duration = 30 minutes

**Expected**
- Latest start time becomes 16:30
- If viewing duration changes, recalculate the derived window

## Case 04 — Insert a property into an appointment gap

**Given**
- A usable gap exists between fixed appointments
- A flexible / wide-window property can fit

**Expected**
- Insert the property into the gap
- Do not make the next appointment late

## Case 05 — Prefer lower public-transit risk

**Given**
- Option A: transit 28 min, 2 transfers, 900 m walking, 5 min buffer
- Option B: direct rail 31 min, 15 min buffer

**Expected**
- Prefer the lower-risk option even though it is 3 minutes slower

## Case 06 — Taxi avoids lateness

**Given**
- Strategy = public transit first, taxi when necessary
- Transit would arrive late
- Taxi can arrive on time
- Taxi budget is sufficient

**Expected**
- Generate an `avoid_late` taxi recommendation
- Show taxi cost
- Show minutes saved
- Explain that taxi avoids lateness

## Case 07 — Transit detour

**Given**
- Transit = 55 min
- Taxi = 18 min
- The internal detour threshold is satisfied

**Expected**
- Generate a `transit_detour` candidate
- If taxi budget is insufficient, the recommendation must not be adoptable

## Case 08 — Taxi unlocks one extra viewing

**Given**
- All-transit plan cannot fit one additional property before latest end
- One taxi leg makes the additional property feasible

**Expected**
- Produce `unlock_extra_viewing`
- Recommended-route comparison reflects the completion-count advantage

## Case 09 — Compare 0, 1, and 2 taxi legs

**Given**
- Taxi budget = ¥60

**Expected**
- Compare at least:
  - all transit
  - each relevant single-taxi-leg plan
  - relevant two-taxi-leg plans
- Select by full-day timeline value, not by single-leg minutes-per-yuan

## Case 10 — Transport mode changes optimal property order

**Given**
- The same set of properties
- Different transport-mode combinations make different orders feasible

**Expected**
- Optimizer is allowed to return a different property order because of transport mode
- It must not lock the property order before mode comparison

## Case 11 — Must-visit vs opportunity cost

**Given**
- A must-visit property causes the route to exceed the latest end
- A far non-must property has high route opportunity cost

**Expected**
- Preserve the must-visit property and surface the conflict
- Opportunity cost may be calculated for the non-must property
- Do not silently remove either property

## Case 12 — Same agent is only a soft constraint

**Given**
- Two properties share the same agent

**Expected**
- Prefer consecutive scheduling only when higher-level metrics are equivalent and within the time-difference threshold
- If consecutive scheduling creates lateness, do not group them

## Case 13 — Deduplicate three route options

**Given**
- Cheapest, recommended, and fastest all resolve to the same property order and mode sequence

**Expected**
- Show one route option, not three identical cards

## Case 14 — Dynamic rerouting freezes completed work

**Given**
- A property is cancelled or rescheduled after part of the day is complete

**Expected**
- Completed properties remain unchanged
- Re-run the same optimizer from current location and current time for remaining properties

## Case 15 — Plan B before full reroute

**Given**
- Current viewing overruns and creates a high-risk node
- A pre-generated Plan B can restore feasibility

**Expected**
- Offer Plan B first
- If Plan B cannot restore feasibility, run full rerouting

## Case 16 — Missing address / transit data

**Given**
- Address or public-transit data cannot be resolved

**Expected**
- Do not fabricate route data
- If only taxi data is available and strategy allows it, a clearly marked degraded-data option may be generated
- Otherwise return a clear actionable error / conflict

## Case 17 — Only one property

**Given**
- Only one valid property

**Expected**
- Prompt the user to add at least two properties
- Do not generate a multi-property route

## Case 18 — Properties across multiple dates

**Given**
- Properties contain appointments across multiple dates

**Expected**
- Require the user to select the planning date
- Do not mix multiple days into one single-day route

---

# Additional automated-test expectations

For each route-engine test:

- use deterministic mock travel data
- assert exact or bounded ordering where the product rule requires it
- assert transport mode where relevant
- assert feasibility / conflict codes
- assert taxi budget is never exceeded
- assert must-visit properties are never silently removed
- assert completed properties are never reordered during reroute
- assert timeline times are monotonic
- assert explanations / reason codes are emitted for key decisions
