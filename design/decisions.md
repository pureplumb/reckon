# Decisions

The record of **why** for each implemented stage: the problem, the choices
made and the options rejected, and any breaking changes. How the library
works now is in the reference docs ([projection.md](projection.md),
[validation.md](validation.md), [architecture.md](architecture.md)); this file
doesn't repeat it.

Each entry links to the commit holding the full stage doc, for the detail
that was condensed away.

---

## Stage 3: Household and age

Accepted and implemented 2026-11-26, following the draft's leanings. Full
stage doc: `git show 4f3bc2c:design/drafts/household.md`.

### Problem

A retirement plan is mostly described in ages ("retire at 62", "Social
Security at 70", "RMDs from 73"), but the engine had only calendar years, so
the caller worked out every date. For a couple each person has their own age,
Social Security and accounts, so a single `birthYear` isn't enough.

The household is **its own input group**, not part of `portfolio`: most of its
users aren't portfolio code (flows, and later tax, Medicare, IRMAA and RMDs),
and stage 6 accounts will name their owner, so the dependency runs from the
portfolio to the household.

### Decisions

1. **`birthYear` or `startAge`.** *Chosen:* `birthYear`. It's a fixed fact,
   so it stays right when `startYear` changes (the same reason stage 2 chose
   calendar years for `fromYear`). A `startAge` would need editing every time
   the plan is re-run in a new year.
2. **Single-person shorthand** (`household: { birthYear }`). *Chosen:* always
   `people: [...]`. One shape is simpler to validate and document, and adding
   a spouse doesn't change it.
3. **Required or optional `household`.** *Chosen:* optional, required only
   when a flow uses an age. Required would break every existing input while
   nothing else in stage 3 needs it. Revisit in stage 6 (RMDs, taxes).
4. **Default `person`.** *Chosen:* with one person, an age-dated flow may
   leave out `person`; with two it must name one. Adding a spouse then makes
   those flows invalid, which is the right moment to decide whose they are.
5. **How the flows builder gets ages.** Options: (a) pass each row's `ages`
   and compare per year; (b) pass birth years and convert
   `fromYear = birthYear + fromAge`; (c) convert in the engine so flows never
   see ages. *Chosen:* **b**. A one-line conversion, the same shape validation
   takes, and error messages can still name `fromAge`. **c** would hide
   `fromAge` from the topic that owns it.
6. **Filing status.** *Chosen:* not in stage 3. Nothing uses it until stage 6,
   and it changes over time (a surviving spouse), so stage 6 should derive it
   per year as a schedule field, possibly with an optional override.
7. **Mortality** (`deathYear` or a planning age). *Chosen:* not in stage 3.
   `Person` stays an object so `deathYear?` can be added without a breaking
   change; stage 4 (Social Security survivor benefits) is the natural place.
8. **`LIMITS.age`.** *Chosen:* export `age: { min: 0, max: 120 }`, as with
   `years`, so clients can reuse it.
9. **One `person` per flow.** `person` says both whose flow it is and whose
   age `fromAge`/`toAge` use. Options: (a) one `person` for both; (b)
   `owner?` plus `fromAge?: { person, age }`. *Chosen:* **a**. It can't
   express a joint flow starting at an age, or a range that follows two
   people, but both are rare and have workarounds (`fromYear`, or two flows),
   and **b** can be added later as a second accepted shape without a breaking
   change. Revisit in stage 6, when ownership matters for tax.

### Other choices

- **Age is `calendarYear - birthYear`**: the age reached during the year, in
  whole years, the IRS convention for RMD ages. Birth months are out of scope.
- **A past `fromAge` is allowed** ("my pension started at 60"; active from
  year 1), but a past `toAge` is rejected, like a `toYear` before
  `startYear`: the flow would never run.
- **Ages are worked out once, in the schedule** (`agesFor`), like
  `calendarYear`. Flows don't read them; they resolve their own dates from
  the birth years.
- **No `steps.ts`:** the household moves no money, so simulation and both
  yearly equations are unchanged.
- **Follow-up: wages.** A salary is `income` with `source: "other"` for now.
  Stage 6 taxes wages differently from Social Security, so it may add
  `source: "wages"`.

### Breaking changes

None. `household` and the new flow fields are optional, and existing inputs
behave as before. Each output row gains `ages` (`{}` with no household).

---

## Stage 2: Cash flows

Accepted 2026-11-22 (1–6) and 2026-11-23 (7). Implemented 2026-11-24. Full
stage doc: `git show af95c43:design/cash-flows.md`.

### Problem

The engine only took money out. Real plans put money in (contributions) and
cover most retirement spending partly with income (pension, Social Security).
The two look alike but reach the portfolio differently: a contribution raises
the balance, income reduces the withdrawal. Modelling a $30k pension as a
contribution would add $30k and withdraw $30k, and get the shortfall wrong.
So spending, income and contributions are treated as kinds of one idea, a
cash flow, and netted each year.

### Decisions

1. **Indexing default.** `"none"` suits pensions, `"inflation"` suits Social
   Security, so no default is safe for income. *Chosen:* `indexing` is
   required on income, so the choice is always explicit; contributions
   default to `"none"`.
2. **Income above spending.** Reinvest it or drop it? *Chosen:* reinvest it as
   `surplus`. An option to drop it can be added later.
3. **Rename `annualWithdrawal` to `spending.annual`.** Once income exists, the
   withdrawal is calculated, not entered, so the old name would mislead.
   *Chosen:* rename now, while nothing outside the repo calls the library.
4. **Replace `depletedInYear`.** With a $0 start allowed and money arriving
   later, "balance hit 0" is ambiguous: a plan that starts at $0 and saves
   would count as depleted in year 1. *Chosen:* `firstShortfallYear`, the
   first year spending isn't fully covered.
5. **What dollars a flow's `amount` is in.** Today's dollars, growing from
   year 1 like `spending`, or the dollars of the flow's first year, growing
   from `fromYear`? *Chosen:* today's dollars. It matches `spending`, and
   Social Security estimates are quoted that way. Pensions whose
   cost-of-living increases start at first payment are stage 4.
6. **Calendar or projection years for `fromYear`/`toYear`.** *Chosen:*
   calendar years. `startYear` is required, so they're always available; they
   match how people think ("Social Security from 2028"); and a flow's dates
   stay right if `startYear` changes. The growth formula still uses the
   projection year. Stage 3 may add `fromAge`.
7. **Group the input by topic.** *Chosen:* group it now (`timeline`,
   `assumptions`, `portfolio`, `spending`, `flows`). Later stages add
   accounts, taxes and ages, which a flat input would mix together, and this
   stage was already breaking.

### Other choices

- **Two stages, schedule then simulate.** No stage 2 flow depends on the
  balance, so everything except the money moving in and out of the portfolio
  is worked out up front. Rejected: one loop doing both. The split lets the
  schedule be tested without balances, costs at most a few thousand
  calculations, makes Monte Carlo (stage 7) "build once, simulate many", and
  makes taxes (stage 6) a new step rather than a rewrite.
- **`startBalance` relaxed to ≥ 0**, since contributions can build a balance
  from nothing.
- **Spending is not in the `CashFlow` list.** There is exactly one, it's
  required, and it always grows with inflation, so a single number is
  simpler. Stage 5 may turn it into flows (e.g. `type: "expense"`).
- **Flows are a discriminated union of interfaces**, not classes (instances
  don't survive JSON) and not `FlowBase & {…}` intersections (worse compiler
  messages). Per-kind behaviour uses a lookup table checked with
  `satisfies Record<CashFlow["type"], …>`, or a `switch` ending in a `never`
  check, so adding a kind is a build error until every place handles it.
  `ts-pattern` was considered and left out until matching gets more complex.
- **Balances in a `SimState` keyed by account**, with one `default` account,
  so stage 6 adds accounts without restructuring the loop. Contributions have
  room for an `account` field in stage 6.
- **A `toYear` past the last projection year is allowed**; the flow just
  stops with the projection.

### Breaking changes

- Input grouped by topic (Decision 7).
- `annualWithdrawal` → `spending.annual` (Decision 3).
- `summary.depletedInYear` → `summary.firstShortfallYear` (Decision 4). The
  two can differ by a year: $100, $50 a year, 0% return ends year 2 at $0
  with spending covered, so the old field was 2 and the new one is 3.
