# Stage 3: Household and Age

**Status:** Draft. The decisions at the end are open. Depends on stage 2 (cash
flows; see [decisions.md](../decisions.md#stage-2-cash-flows)). Stage 6
(accounts and taxes, [drafts/accounts-taxes.md](accounts-taxes.md)) and the
Medicare and IRMAA work depend on it.

Adds a **household**: the one or two people the plan is for, each with a birth
year. From that the engine knows each person's age in every projection year,
so a flow can start or stop at an age ("Social Security from 67") and later
stages can apply age-based rules (RMDs, Medicare).

## Problem

A retirement plan is mostly described in ages, not calendar years: "retire at
62", "claim Social Security at 70", "RMDs from 73", "Medicare at 65". So far
the engine has only calendar years, which leaves the caller to work out each
date. For a couple it's worse: each person has their own age, their own
Social Security and their own accounts, so one `birthYear` isn't enough.

People are not money, so the household is **its own input group** and not
part of `portfolio`:

- Most of its users aren't portfolio code. Flows use it for start ages. Tax
  uses it for filing status, Medicare and IRMAA use it for ages, and RMDs use
  the account owner's birth year.
- The dependency is the other way round. Stage 6 accounts will name their
  owner (`owner: "pat"`), so the portfolio refers to the household.
- Topics never import other topics
  ([architecture.md](../architecture.md#dependency-rule)), so a separate group
  that the engine passes to the builders that need it fits the existing
  pattern.

## Design outline

### Code

A new topic folder, `topics/household/`, as listed in
[architecture.md](../architecture.md#topic-modules):

| File | Contents |
|---|---|
| `types.ts` | `Person`, `Household`, `HouseholdSlice` |
| `validate.ts` | `validateHousehold` |
| `schedule.ts` | `agesFor`: each person's age in a year |

No `steps.ts`: the household moves no money.

The flows topic is extended for `person`, `fromAge` and `toAge`
(`types.ts`, `validate.ts`, `schedule.ts`).

### Input

A new optional `household` group, plus three optional fields on every flow:

```ts
// topics/household/types.ts
export interface Person {
  id: string;          // unique; referenced by flows (and stage 6 accounts)
  birthYear: number;   // calendar year
}

export interface Household {
  people: Person[];    // 1 or 2
}

// topics/flows/types.ts
export interface FlowBase {
  id: string;
  amount: number;
  fromYear?: number;
  toYear?: number;
  person?: string;     // id of the person the flow belongs to; none = joint; see Decisions 4 and 9
  fromAge?: number;    // first active age of `person`, inclusive; instead of fromYear
  toAge?: number;      // last active age of `person`, inclusive; instead of toYear
}

// engine/input.ts
interface ProjectionInput {
  timeline:    Timeline;
  assumptions: Assumptions;
  portfolio:   Portfolio;
  spending:    SpendingInput;
  flows?:      CashFlow[];
  household?:  Household;   // optional; see Decision 3
}
```

People are an array with ids, like `flows`, so other topics can refer to them
by id, and per-person output is keyed by id.

**What "age" means:** a person's age in a year is the age they reach during
that calendar year, `calendarYear - birthYear`. The engine works in whole
years, and this is the convention the IRS uses for RMD ages. Birth months are
out of scope (see below).

#### Example

A couple, following the leanings in the Decisions below. Pat was born in
1960 and Sam in 1963, and the projection starts in 2026:

```ts
const input: ProjectionInput = {
  timeline: { startYear: 2026, years: 30 },
  assumptions: { returnRate: 0.05, inflationRate: 0.03 },
  portfolio: { startBalance: 1_200_000 },
  spending: { annual: 90_000 },

  household: {
    people: [
      { id: "pat", birthYear: 1960 },   // 66 in 2026
      { id: "sam", birthYear: 1963 },   // 63 in 2026
    ],
  },

  flows: [
    // Pat claims Social Security at 67 → starts 2027
    { id: "pat-ss", type: "income", source: "socialSecurity",
      amount: 32_000, indexing: "inflation", person: "pat", fromAge: 67 },
    // Sam waits until 70 → starts 2033
    { id: "sam-ss", type: "income", source: "socialSecurity",
      amount: 28_000, indexing: "inflation", person: "sam", fromAge: 70 },
    // Pat's pension began at 60, before the projection → active from year 1
    { id: "pat-pension", type: "income", source: "pension",
      amount: 18_000, indexing: "none", person: "pat", fromAge: 60 },
    // Sam keeps saving until 65 → 2026–2028
    { id: "sam-401k", type: "contribution",
      amount: 23_000, person: "sam", toAge: 65 },
    // Sam's salary, also until 65
    { id: "sam-salary", type: "income", source: "other",
      amount: 85_000, indexing: "inflation", person: "sam", toAge: 65 },
    // Rental income is joint: no person, dated by calendar year
    { id: "rental", type: "income", source: "other",
      amount: 12_000, indexing: "inflation", fromYear: 2030 },
  ],
};
```

The 2027 output row then includes:

```ts
{ year: 2, calendarYear: 2027, ages: { pat: 67, sam: 64 },
  flows: { "pat-ss": 32_960, … }, … }
```

With one person, `person` can be left out (Decision 4):

```ts
household: { people: [{ id: "me", birthYear: 1962 }] },
flows: [
  { id: "ss", type: "income", source: "socialSecurity",
    amount: 30_000, indexing: "inflation", fromAge: 67 },
],
```

The example shows:
- **The same fields work for both kinds of flow.** `fromAge` starts income
  (`pat-ss`, `sam-ss`), and `toAge` stops a contribution (`sam-401k`).
- **A start age can be in the past.** `pat-pension` began before the
  projection, so it's active from year 1.
- **Joint flows still use calendar years.** `rental` has no `person`.
- **Nothing that exists today breaks.** `household` and the new flow fields
  are optional, so current inputs work unchanged.

**Follow-up: wages.** Sam's salary is `income` with `source: "other"`. While
it exceeds spending, the excess is reinvested as `surplus` (stage 2,
Decision 2). That works for now, but stage 6 taxes wages differently from
Social Security (payroll tax, and wages can fund IRA contributions), so a
`source: "wages"` may be needed then.

### Validation

New rules for [validation.md](../validation.md#rules):

| Field | Rule | Why |
|---|---|---|
| `household.people` | 1 or 2 entries | A household with nobody in it is meaningless; more than two adults is out of scope. |
| `household.people[i].id` | non-empty string, unique across people | Flows refer to people by id, and output is keyed by it. |
| `household.people[i].birthYear` | whole number; age at `timeline.startYear` from 0 to `LIMITS.age.max` (e.g. 120) | Catches a typo such as `196` for `1960`, or a birth year after the projection starts. |
| `flows[i].person` | must name a person in `household.people` | A flow can't belong to someone who doesn't exist. |
| `flows[i].fromAge`, `.toAge` | whole numbers from 0 to `LIMITS.age.max`; `fromAge` ≤ `toAge` when both are given | Same reasoning as `fromYear`/`toYear`. |
| `fromAge` with `fromYear`, `toAge` with `toYear` | not both | Two different start dates for one flow is always a mistake. |
| `fromAge` or `toAge` | needs `person` (see Decision 4), and so needs `household` | An age is meaningless without someone to have it. |
| `toAge` | ≥ the person's age at `timeline.startYear` | Same as `toYear` ≥ `startYear`: a flow that ends before the projection never runs, so it's a typo. A past `fromAge` is fine, since the flow is active from year 1. |
| `fromAge` with `toYear`, `fromYear` with `toAge` | converted to calendar years (`birthYear + age`), the start is ≤ the end | Same reasoning as `fromYear`/`toYear`: a range that ends before it starts is always a mistake. |

The flow checks need the people, so `validateFlows` runs after
`validateHousehold` and takes the person ids and birth years as a plain
argument (`Record<string, number>`), not the `Household` type, so flows still
import nothing from another topic.

**A start age before the projection starts is allowed.** A `fromYear` before
`startYear` is rejected as a mistake, but `fromAge: 60` for someone already 62
is normal ("my pension started at 60"). The flow is active from year 1. An
end age before the projection is not: like a `toYear` before `startYear`, the
flow would never run.

### Schedule

Ages are known in advance, so they go in the schedule. The household builder
adds one field to each row:

```ts
// topics/household/types.ts
export interface HouseholdSlice {
  ages: Record<string, number>;   // each person's age this year, keyed by person id
}

// topics/household/schedule.ts
export const agesFor = (household: Household, y: YearRef): HouseholdSlice => ({
  ages: Object.fromEntries(
    household.people.map((p) => [p.id, y.calendarYear - p.birthYear]),
  ),
});

// engine/schedule.ts
type ScheduleYear = YearRef & SpendingSlice & FlowsSlice & HouseholdSlice;
```

Like `calendarYear`, the age is worked out once, here, and no other builder
repeats the subtraction. With no household, `ages` is `{}`.

The flows builder needs ages for `fromAge`/`toAge`, and how it gets them is
Decision 5. Either way, a flow's active range is still decided by calendar
year, and its growth still runs from projection year 1
([Decision 5 of stage 2](../decisions.md#stage-2-cash-flows)), so a flow
starting at an age grows the same way as one starting at a `fromYear`.

#### How it fits together

This walkthrough follows the current leanings: `birthYear` (Decision 1),
always `people` (2), optional `household` (3), a default `person` when there
is only one (4), birth years passed to the flows builder (5b), and one
`person` per flow (9a). Update it if any of those change.

```
validate                buildSchedule (once per projection)
────────                ───────────────────────────────────────────────────
validateHousehold  ──►  birthYears = { pat: 1960, sam: 1963 }   (once)
validateFlows      ──►
 (gets birthYears)      for each year y:
                          ├─ YearRef           year, calendarYear
                          ├─ spendingFor       spending
                          ├─ flowForYear       income, contributions, flows
                          │    └─ resolve each flow's ages to calendar years
                          │       using birthYears; then the existing
                          │       calendar-year range check and growth
                          └─ agesFor           ages: { pat: 66, sam: 63 }
```

The ages and the flows' dates both come from `birthYear`, but separately.
Flows never read the `ages` slice. `ages` is there for output now, and for
RMDs and Medicare later.

1. **Validate.** `validateHousehold` runs first. Then
   `validateFlows(flows, timeline, birthYears)` checks that every `person`
   exists, that `fromAge` isn't combined with `fromYear`, and that a flow
   using an age has a person (given, or the only person). Once validation
   passes, the builders can assume every lookup succeeds.
2. **Build the birth-year lookup, once, in the engine.** It's a plain
   `Record<string, number>`, so flows take it without importing household
   types:

   ```ts
   const birthYears = Object.fromEntries(
     (input.household?.people ?? []).map((p) => [p.id, p.birthYear]),
   );  // {} when there's no household
   ```
3. **For each year, spread in each topic's slice:**

   ```ts
   projectionYears(input.timeline).map((y) => ({
     ...y,
     ...spendingFor(input.spending, input.assumptions.inflationRate, y),
     ...flowForYear(flows, y, input.timeline, inflationRate, birthYears),
     ...agesFor(input.household, y),     // { ages: {} } when no household
   }));
   ```
4. **Inside `flowAmount`, ages become calendar years before the existing
   logic runs:**

   ```ts
   const who = cf.person ?? onlyPerson(birthYears);   // Decision 4 default
   const fromYear = cf.fromYear
     ?? (cf.fromAge !== undefined ? birthYears[who]! + cf.fromAge : timeline.startYear);
   const toYear = cf.toYear
     ?? (cf.toAge !== undefined ? birthYears[who]! + cf.toAge : lastYear);
   // unchanged from here: range check on calendarYear, growth from year 1
   ```

   After this, an age-dated flow is an ordinary year-dated flow, so the
   range check and the growth formula don't change. A `fromAge` that falls
   before the projection starts resolves to a `fromYear` before `startYear`,
   and the range check treats the flow as active from year 1, with no special
   case. The conversion repeats every year, which costs next to nothing; a
   `resolveDates(cf, …)` helper could do it once per flow instead.
5. **`agesFor` adds `ages` to each row.** It's `calendarYear - birthYear`
   for each person, keyed by id, and passes through `simulate` into the
   output row unchanged.

**Example.** Pat (born 1960) and Sam (born 1963), `startYear: 2026`:

| Flow | Input | Resolves to | Active |
|---|---|---|---|
| Pat's Social Security | `person: "pat", fromAge: 67` | `fromYear: 2027` | 2027 on |
| Sam's 401(k) contributions | `person: "sam", toAge: 65` | `toYear: 2028` | 2026–2028 |
| Pat's pension | `person: "pat", fromAge: 60` | `fromYear: 2020` | year 1 on (already started) |
| Rental income | `fromYear: 2030` (no person, joint) | unchanged | 2030 on |

The row for 2027 has `ages: { pat: 67, sam: 64 }`. With no household,
`birthYears` and `ages` are both `{}`. Validation has already rejected any
`fromAge`, so flows behave exactly as they do today.

### Simulation

No change. The household moves no money, and no year step reads the ages
until stage 6 (RMDs) and Medicare.

### Equations

No change to either equation in
[architecture.md](../architecture.md#4-two-equations-every-year).

### Output

- Each row gains `ages`, keyed by person id, spread in from the schedule like
  the other slices. With no household it is `{}`.
- No new summary fields. (A later "age when the money runs short" could be
  read from `firstShortfallYear` and `ages`.)

### Breaking changes

None, if `household` is optional (Decision 3). Existing inputs, and flows
without `person`/`fromAge`/`toAge`, behave exactly as before.

## Out of scope

- **Birth months and days.** Medicare starts in the month of a 65th birthday,
  and Social Security's full retirement age has months. Whole years are
  enough for an annual projection; stage 4 can revisit claiming ages.
- **More than two adults, and dependants.** Dependants matter to tax (and to
  the "qualifying surviving spouse" filing status), so they are revisited in
  stage 6.
- **Filing status.** See Decision 6.
- **Mortality and survivor years.** See Decision 7.

## Decisions

Open. Each lists a leaning, not a choice.

1. **`birthYear` or `startAge`.** The roadmap lists both. *Leaning:*
   `birthYear`. It's a fixed fact, so it stays right when `startYear`
   changes, for the same reason stage 2 chose calendar years for `fromYear`
   (Decision 6 there). A `startAge` would have to be changed every time the
   plan is re-run in a new year.
2. **Single person shorthand.** Allow `household: { birthYear }` for one
   person, or always `people: [...]`? *Leaning:* always `people`. One shape
   is simpler to validate and document, and adding a spouse later doesn't
   change the shape.
3. **Required or optional `household`.** Required breaks every existing input
   and test, while nothing in stage 3 *needs* it except age-based flows.
   *Leaning:* optional now, with validation requiring it when a flow uses
   `fromAge`/`toAge`. Revisit in stage 6, where RMDs and taxes may make it
   required.
4. **Default `person`.** With one person, may a flow give `fromAge` without
   `person`? *Leaning:* yes, default to the only person, and require
   `person` when there are two. It keeps single-person plans short; the cost
   is that adding a spouse makes some flows invalid until they name a person,
   which is the right moment to decide whose flow it is.
5. **How the flows builder gets ages.** Topics can't import each other, so:
   - **a.** `flowForYear` takes the row's `ages: Record<string, number>` as an
     argument and compares `ages[flow.person]` with `fromAge`/`toAge`.
   - **b.** `flowForYear` takes the birth years and converts once:
     `fromYear = birthYear + fromAge`.
   - **c.** The engine converts `fromAge` to `fromYear` before building the
     schedule, so flows never see ages.

   *Leaning:* **b**. It's a one-line conversion with no per-year lookup, the
   validation already takes the birth years in the same shape, and error
   messages can still name `fromAge`. **c** would hide `fromAge` from the
   flows topic that owns the field, against the topic-module rule.
6. **Filing status.** It belongs to the household, but nothing uses it until
   stage 6, and it isn't fixed: when a spouse dies, the survivor files
   jointly that year and as single afterwards (or as a qualifying surviving
   spouse, with a dependant). *Leaning:* leave it out of stage 3, and in
   stage 6 derive it per year from the people (and their death years, if
   Decision 7 adds them) as a schedule field, rather than take it as input.
   Possibly an optional input to override it (e.g. married filing
   separately).
7. **Mortality.** A `deathYear` (or planning age) per person would let flows
   stop when someone dies, and make survivor years possible: one Social
   Security check stops, the larger benefit continues, and filing status
   changes. *Leaning:* not in stage 3, but keep `Person` an object so a
   `deathYear?` field can be added without a breaking change. Stage 4 (Social
   Security) is the natural place, since survivor benefits are where it
   matters most.
8. **`LIMITS.age`.** Add `age: { min: 0, max: 120 }` to the exported
   `LIMITS`, so clients can reuse it in their forms? *Leaning:* yes, as with
   `years`.
9. **One `person` per flow.** `person` does two jobs: it says whose flow it
   is (which stage 6 needs for tax and account ownership, and survivor rules
   need later), and whose age `fromAge`/`toAge` are measured against. One
   person covers almost every flow: each spouse has their own Social
   Security, pension, salary and individual accounts, so a couple has one
   flow each. A flow without `person` belongs to the household jointly (e.g.
   rental income) and is dated with `fromYear`/`toYear`, as today. A single
   `person` can't express:
   - a joint flow that starts at an age ("from when the older of us turns
     65"), which needs `fromYear` or two flows; or
   - a start and end that follow different people ("from my 60th birthday
     until my spouse turns 70").

   Options:
   - **a.** A single `person`, used for both jobs.
   - **b.** Separate the jobs: `owner?: string`, and the ages as objects,
     `fromAge?: { person: string; age: number }` (likewise `toAge`).

   *Leaning:* **a** for stage 3. Both gaps are rare and have workarounds, and
   **b** can be added later as a second accepted shape for `fromAge`/`toAge`
   without a breaking change. Revisit in stage 6, when ownership starts to
   matter for tax.

## Changes to reference docs

Once approved:

- **projection.md:** the `household` group, the `person`/`fromAge`/`toAge`
  flow fields, the definition of age, and `ages` on each row.
- **validation.md:** the household rules and the new flow rules above; the
  order (household before flows).
- **architecture.md:** `topics/household/` in the code layout,
  `HouseholdSlice` in `ScheduleYear`, the household builder in
  `buildSchedule`, and the `household` line in the input sketch (replacing
  `household: { birthYear: number; ... }`).
- **README.md:** stage 3 status.
- **drafts/accounts-taxes.md:** `household: { birthYear }` becomes
  `household: { people }`, and RMDs use the account owner's birth year.
