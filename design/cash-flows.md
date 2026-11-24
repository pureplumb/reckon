# Stage 2: Cash Flows

**Status:** Draft. All decisions accepted (1–6 on 2026-11-22, 7 on
2026-11-23).

This stage introduces the engine structure described in
[architecture.md](architecture.md): input grouped by topic, per-topic schedule
builders, and year steps in a fixed order.

Adds money arriving each year: **contributions** (savings deposited into the
portfolio) and **income** (pension, Social Security and similar). Both start
simple, with room for later stages to add type-specific rules (claiming ages,
pension options, account types).

## Problem

The engine in [projection.md](projection.md) only takes money out. Real plans
also put money in, and in retirement most spending is covered partly by income
rather than by withdrawals.

Contributions and income look alike (money arriving each year) but reach the
portfolio differently:

| | Contribution (savings deposit) | Income (pension, Social Security) |
|---|---|---|
| Where it goes | Into the portfolio | Pays for spending first |
| Effect | Raises the balance | Reduces how much is withdrawn |
| Usual life stage | Before retirement | During retirement |
| Inflation adjustment | Often a fixed amount, or rises with wages | Social Security rises with inflation; most pensions don't |

Modelling income as a contribution gives the wrong results. A $30k pension
covering $30k of spending should mean nothing is withdrawn. As a contribution,
the model would add $30k and withdraw $30k, and the shortfall logic would
behave differently.

So spending, income and contributions are treated as kinds of one general
idea, a **cash flow**, and netted each year.

## Design

### Input

```ts
type Indexing = "inflation" | "none" | { rate: number };

// Fields shared by every kind of flow. Never used on its own.
interface FlowBase {
  id: string;            // unique; used in per-flow output and error messages
  amount: number;        // >= 0, in year-1 (today's) dollars; see Decision 5
  fromYear?: number;     // first active calendar year, inclusive; default: startYear; see Decision 6
  toYear?: number;       // last active calendar year, inclusive; default: last projection year
}

interface Contribution extends FlowBase {
  type: "contribution";
  indexing?: Indexing;   // default "none"; see Decision 1
}

interface Income extends FlowBase {
  type: "income";
  source: "pension" | "socialSecurity" | "other";
  indexing: Indexing;    // required; see Decision 1
}

type CashFlow = Contribution | Income;

// Grouped by topic; see Decision 7 and architecture.md
interface ProjectionInput {
  timeline:    { startYear: number; years: number };
  assumptions: { returnRate: number; inflationRate: number };
  portfolio:   { startBalance: number };  // >= 0 (was > 0)
  spending:    { annual: number };        // replaces annualWithdrawal; see Decision 3
  flows?:      CashFlow[];
}
```

| Was | Now |
|---|---|
| `startYear`, `years` | `timeline.startYear`, `timeline.years` |
| `returnRate`, `inflationRate` | `assumptions.returnRate`, `assumptions.inflationRate` |
| `startBalance` | `portfolio.startBalance` |
| `annualWithdrawal` | `spending.annual` |
| — | `flows` (new) |

- `CashFlow` is a **discriminated union**: `type` tells TypeScript which kind
  of flow it is, and after checking it the compiler knows which fields exist
  (`source` only on `Income`).
- Each kind is declared as an interface that `extends FlowBase`, rather than
  as `FlowBase & { ... }`. The two mean the same, but interfaces give clearer
  compiler error messages and give each kind a name to use in code (`Income`).
- Each kind can gain its own fields later without affecting the others
  (Social Security: claiming age and benefit amount; pension: survivor
  benefit), or become its own interface (`SocialSecurity extends FlowBase`).
  Code that handles flows is exhaustive over `type`, so the compiler points
  out every place a new kind must be handled. Which form to use depends on
  what each kind needs:

  | Each kind... | Use | Example |
  |---|---|---|
  | maps to a value | a lookup table checked with `satisfies Record<CashFlow["type"], …>` | which total a flow adds to (see [The schedule](#the-schedule)) |
  | needs its own logic | a `switch` on `type` ending in `const unhandled: never = flow` | stage 6: Social Security is taxed under its own formula |

  TypeScript has no `match` expression. The `ts-pattern` library provides
  one, but it's a dependency worth adding only if code starts matching on
  combinations of fields in several places.
- Classes are not used for flows: class instances don't survive conversion to
  and from JSON, which would break the plain-data principle.
- `spending.annual` replaces `annualWithdrawal`. Once income exists the amount
  withdrawn is calculated rather than entered, so the old name would mislead.
- **Spending is a cash flow in concept but not in the `CashFlow` list.**
  There is exactly one spending amount, it's required, and it always grows with
  inflation, so a single number is simpler than a flow. `buildSchedule` treats
  it like a flow internally. Stage 5 (essential and discretionary spending)
  adds fields inside the `spending` group, and may turn it into flows with
  their own kind, such as `type: "expense"`.

### A flow's amount in a given year

A flow is active in calendar years `fromYear` to `toYear`, compared against
each year's `y.calendarYear` (from
[`projectionYears`](architecture.md#the-years-to-project)). In an active year,
with projection year `y.year`:

```
value(y) = amount * (1 + g)^(y.year - 1)
```

where `g` is `inflationRate` for `"inflation"`, 0 for `"none"`, or the given
rate for `{ rate }`. This is the same convention as `spending`: amounts are
stated in year-1 dollars and grow from year 1. A flow that starts in year 10
with `"inflation"` therefore pays `amount` in today's dollars, not `amount`
nominal dollars (see Decision 5).

### Structure: two stages

```
flows ──► buildSchedule() ──► per-year amounts ──► simulate() ──► rows
          (pure: what happens      (table)          (pure: balance
           each year)                                over time)
```

- **`buildSchedule`** runs first. It turns every flow, and spending, into an
  amount for each year: active years and indexing now, claiming ages and
  similar later. It never looks at the balance.
- **`simulate`** is the balance loop, reading those amounts year by year.

`projectPortfolio()` stays the public function and calls both:

```ts
export const projectPortfolio = (input: ProjectionInput): ProjectionResult => {
  validateProjectionInput(input);
  const schedule = buildSchedule(input);  // everything known in advance
  return simulate(input, schedule);       // the balance loop
};
```

This works because, in this stage, no flow depends on the portfolio: a
$20,000 pension pays $20,000 whether the portfolio is doing well or is empty.
Only the money moving into and out of the portfolio (withdrawal, shortfall,
surplus, growth) depends on the balance, so only that stays in the loop.

#### The schedule

`buildSchedule` returns one row per year:

```ts
interface ScheduleYear {
  year: number;                   // 1-based projection year
  calendarYear: number;           // startYear + year - 1
  spending: number;               // inflation-adjusted target
  income: number;                 // sum of active income flows
  contributions: number;          // sum of active contribution flows
  flows: Record<string, number>;  // each flow's amount, keyed by id
}

function buildSchedule(input: ProjectionInput): ScheduleYear[];
```

It takes each year from `projectionYears` (a `YearRef` holding `year` and
`calendarYear`) and adds a slice from each topic's builder
([architecture.md](architecture.md#building-the-schedule)): `spendingFor`
(spending) and `flowsFor` (income, contributions, flows). For each year they:
1. calculate spending: `spending.annual * (1 + inflationRate)^(year - 1)`
2. work out each flow's amount: 0 outside `fromYear` to `toYear`, otherwise
   `amount * (1 + g)^(year - 1)` (see
   [A flow's amount in a given year](#a-flows-amount-in-a-given-year)).
   The `flows` record is built in one step:

   ```ts
   const amounts = Object.fromEntries(
     flows.map((f) => [f.id, flowAmount(f, y, input)]),
   );
   ```

3. add each amount to `income` or `contributions` according to the flow's
   `type`, using a lookup table:

   ```ts
   const TOTAL_FOR = {
     income: "income",
     contribution: "contributions",
   } as const satisfies Record<CashFlow["type"], "income" | "contributions">;

   const totals = { income: 0, contributions: 0 };
   for (const f of flows) totals[TOTAL_FOR[f.type]] += amounts[f.id]!;
   ```

   The `satisfies Record<CashFlow["type"], …>` check requires an entry for
   every flow type, so adding a type without one is a build error. Each
   amount is calculated once and the totals are read from `amounts`.

For the [worked example](#worked-example) the schedule is:

| Year | Calendar | Spending  | pension   | ss        | savings   | Income    | Contributions |
|------|----------|-----------|-----------|-----------|-----------|-----------|---------------|
| 1    | 2026     | 60,000.00 | 20,000.00 | 0.00      | 10,000.00 | 20,000.00 | 10,000.00     |
| 2    | 2027     | 61,800.00 | 20,000.00 | 0.00      | 10,000.00 | 20,000.00 | 10,000.00     |
| 3    | 2028     | 63,654.00 | 20,000.00 | 25,461.60 | 0.00      | 45,461.60 | 0.00          |
| 4    | 2029     | 65,563.62 | 20,000.00 | 26,225.45 | 0.00      | 46,225.45 | 0.00          |

The rule for what goes in the schedule and what goes in `simulate`, with a
table placing later features, is in
[architecture.md](architecture.md#what-goes-where).

#### Why split it
- Each stage can be tested on its own: `buildSchedule` (active years,
  indexing, calendar-year conversion) without any balance calculation.
- The cost is negligible: years × flows is at most a few thousand simple
  calculations.
- Monte Carlo (stage 7) becomes "build the schedule once, simulate many times
  with different returns".
- Taxes (stage 6) become one more step inside `simulate` rather than a rewrite.

#### Preparing for multiple accounts

A real portfolio is several accounts (traditional IRA, Roth, taxable), which
arrive in stage 6 ([accounts-taxes.md](accounts-taxes.md)). Account balances
**cannot** go in the schedule: each year's withdrawal is capped by the balance,
and the balance depends on earlier withdrawals. They are state, updated year
by year in `simulate`. This stage shapes the code so stage 6 adds accounts
without restructuring the loop:

- **`simulate` keeps balances in a state object keyed by account**
  (`SimState` in `core/state.ts`; see [Simulation state](#simulation-state)),
  holding a single `default` account for now. Steps change balances only
  through `deposit` and `withdrawUpTo`, so stage 6 changes which account those
  use without touching the steps' callers. Output fields such as
  `startBalance` and `endBalance` are the total across accounts, which today
  is the one account.
- **`ScheduleYear` has room for per-account inputs.** Stage 6 adds, for
  example, each account's return rate and contributions for each year. No
  fields are added now.
- **Contribution flows have room for an `account` field.** Stage 6 adds an
  optional `account` naming which account receives the money. Until then,
  every contribution goes to the single account.

### Algorithm

`buildSchedule` is implemented (`src/engine/schedule.ts`). This section
describes the `simulate` side: how each year's balance changes, using the
schedule.

All money moves at the **start** of the year, before growth, as in the current
engine.

#### `projectPortfolio`

```ts
// engine/project.ts
export const projectPortfolio = (input: ProjectionInput): ProjectionResult => {
  validateProjectionInput(input);
  const schedule = buildSchedule(input);
  return simulate(input, schedule);
};
```

#### Simulation state

Balances live in a `SimState` keyed by account. Stage 2 has one `default`
account. The state and its three balance operations are in `core/state.ts`,
so every topic's year steps can use them without importing from `engine`
(see the [dependency rule](architecture.md#dependency-rule)):

```ts
// core/state.ts
export interface SimState {
  accounts: Record<string, number>;   // balance per account id
}

export const totalBalance = (state: SimState): number;
export const deposit = (state: SimState, amount: number): void;          // into "default" until stage 6
export const withdrawUpTo = (state: SimState, amount: number): number;   // takes at most the balance; returns what it took
```

`withdrawUpTo` is the only place a withdrawal is capped, which is what keeps
every balance ≥ 0.

The starting state comes from the portfolio topic:

```ts
// topics/portfolio/steps.ts
export const initialState = (portfolio: Portfolio): SimState =>
  ({ accounts: { default: portfolio.startBalance } });
```

#### `simulate`

`simulate` creates the state, runs one year per schedule row, then builds the
summary from the rows:

```ts
// engine/simulate.ts
export const simulate = (
  input: ProjectionInput,
  schedule: ScheduleYear[],
): ProjectionResult => {
  const state = initialState(input.portfolio);
  const years = schedule.map((s) => simulateYear(state, s, input.assumptions));
  return { years, summary: summarize(years) };
};
```

Steps change `state` in place, but only inside `simulate`: it creates the
state and shares it with nothing, so `simulate` is still pure from the outside.

#### One year

`simulateYear` calls the year steps in the order set in
[architecture.md](architecture.md#3-simulation-year-steps-in-a-fixed-order)
and assembles the row. It contains no topic logic itself:

```ts
// engine/simulate.ts
const simulateYear = (
  state: SimState,
  s: ScheduleYear,
  assumptions: Assumptions,
): ProjectionYear => {
  const startBalance = totalBalance(state);

  depositContributions(state, s.contributions);                    // 1. flows
  // 2. takeRmds arrives in stage 6
  const { withdrawal, shortfall, surplus } =
    withdrawForSpending(state, s.spending, s.income);              // 3. spending
  reinvest(state, surplus);                                        // 4. flows
  const growth = grow(state, assumptions.returnRate);              // 5. portfolio

  const endBalance = totalBalance(state);
  return {
    ...s,   // year, calendarYear, spending, income, contributions, flows
    startBalance, withdrawal, shortfall, surplus, growth, endBalance,
    endBalanceReal: endBalance / inflationFactor(assumptions.inflationRate, s.year),
  };
};
```

#### The year steps

Each step lives in the topic that owns it, takes only what it needs, and
returns only the values recorded in the row:

| Order | Step | File | Signature | Does |
|---|---|---|---|---|
| 1 | `depositContributions` | `topics/flows/steps.ts` | `(state, contributions) => void` | `deposit(state, contributions)` |
| 3 | `withdrawForSpending` | `topics/spending/steps.ts` | `(state, spending, income) => { withdrawal, shortfall, surplus }` | see below |
| 4 | `reinvest` | `topics/flows/steps.ts` | `(state, surplus) => void` | `deposit(state, surplus)` |
| 5 | `grow` | `topics/portfolio/steps.ts` | `(state, returnRate) => number` | multiplies each account by `1 + returnRate`; returns the total growth |

`withdrawForSpending` nets spending against income:

```ts
// topics/spending/steps.ts
export const withdrawForSpending = (state: SimState, spending: number, income: number) => {
  const need = spending - income;
  const withdrawal = need > 0 ? withdrawUpTo(state, need) : 0;
  return {
    withdrawal,
    shortfall: Math.max(need, 0) - withdrawal,
    surplus: Math.max(-need, 0),   // income above spending; see Decision 2
  };
};
```

- Contributions made in a year can fund that year's withdrawal, because they
  are deposited first.
- Start-of-year contributions earn that year's full return. That's the
  generous assumption for money coming in, just as start-of-year withdrawals
  are the cautious one for money going out.
- `shortfall` is exactly 0 when spending is covered (the withdrawal equals the
  need), so `shortfall > 0` is a reliable test with no floating-point noise.
- After the balance reaches 0, every step still runs: `withdrawUpTo` returns
  0, the full need becomes shortfall, and later contributions or surplus can
  rebuild the balance.

#### Summary

The summary is calculated from the finished rows, so the rows are the only
source of truth and there are no running totals to keep in step:

```ts
// engine/summary.ts
export const summarize = (years: ProjectionYear[]): ProjectionSummary => {
  const last = years.at(-1)!;
  const total = (f: (y: ProjectionYear) => number) => years.reduce((t, y) => t + f(y), 0);
  return {
    endBalance: last.endBalance,
    endBalanceReal: last.endBalanceReal,
    totalWithdrawn: total((y) => y.withdrawal),
    totalShortfall: total((y) => y.shortfall),
    totalIncome: total((y) => y.income),
    totalContributions: total((y) => y.contributions),
    firstShortfallYear: years.find((y) => y.shortfall > 0)?.year ?? null,
  };
};
```

`years` is never empty, because validation requires `timeline.years ≥ 1`.

#### Equations

Every year satisfies the two equations in
[architecture.md](architecture.md#4-two-equations-every-year), with
`taxes = 0` and `reinvested = surplus`:

```
income + withdrawal + shortfall = spending + surplus
endBalance = startBalance + contributions + surplus - withdrawal + growth
```

A shared test helper checks both on every row of every `simulate` test.

#### Change from the current engine

`firstShortfallYear` replaces `depletedInYear` (Decision 4), and the two can
differ by one year. With $100, $50 a year and 0% return, year 2 withdraws the
last $50 and ends at $0 with spending fully covered: `depletedInYear` is 2,
but the first shortfall is in year 3, so `firstShortfallYear` is 3. The "no
flows matches the current engine" test compares every other field, and
expects this difference.

### Output

`ProjectionYear` is the schedule row plus the values `simulate` adds, so a new
schedule slice in a later stage reaches the output automatically:

```ts
// engine/result.ts
export interface ProjectionYear extends ScheduleYear {
  // from the schedule: year, calendarYear, spending, income, contributions, flows
  startBalance: number;
  withdrawal: number;     // taken from the portfolio for spending
  shortfall: number;      // spending not covered by income or withdrawals
  surplus: number;        // income above spending, reinvested
  growth: number;
  endBalance: number;     // nominal
  endBalanceReal: number; // in year-0 dollars
}

export interface ProjectionSummary {
  endBalance: number;
  endBalanceReal: number;
  totalWithdrawn: number;
  totalShortfall: number;
  totalIncome: number;              // new
  totalContributions: number;       // new
  firstShortfallYear: number | null; // replaces depletedInYear; see Decision 4
}

export interface ProjectionResult {
  years: ProjectionYear[];
  summary: ProjectionSummary;
}
```

`withdrawal` keeps its meaning: money taken out of the portfolio.

### Worked example

$500,000, 5% return, 3% inflation, $60,000 spending, starting in 2026, with:
- a pension of $20,000, `indexing: "none"`, all years
- Social Security of $24,000 in today's dollars, `indexing: "inflation"`, from
  year 3 (2028)
- contributions of $10,000, `indexing: "none"`, years 1 to 2 (2026 to 2027)

As input:

```ts
{
  timeline:    { startYear: 2026, years: 4 },
  assumptions: { returnRate: 0.05, inflationRate: 0.03 },
  portfolio:   { startBalance: 500_000 },
  spending:    { annual: 60_000 },
  flows: [
    { id: "pension", type: "income", source: "pension", amount: 20_000, indexing: "none" },
    { id: "ss", type: "income", source: "socialSecurity", amount: 24_000, indexing: "inflation", fromYear: 2028 },
    { id: "savings", type: "contribution", amount: 10_000, indexing: "none", toYear: 2027 },
  ],
}
```

| Year | Start      | Contributions | Spending  | Income    | Withdrawal | Growth    | End        | End (real) |
|------|------------|---------------|-----------|-----------|------------|-----------|------------|------------|
| 1    | 500,000.00 | 10,000.00     | 60,000.00 | 20,000.00 | 40,000.00  | 23,500.00 | 493,500.00 | 479,126.21 |
| 2    | 493,500.00 | 10,000.00     | 61,800.00 | 20,000.00 | 41,800.00  | 23,085.00 | 484,785.00 | 456,956.36 |
| 3    | 484,785.00 | 0.00          | 63,654.00 | 45,461.60 | 18,192.40  | 23,329.63 | 489,922.23 | 448,348.24 |
| 4    | 489,922.23 | 0.00          | 65,563.62 | 46,225.45 | 19,338.17  | 23,529.20 | 494,113.26 | 439,013.23 |

Year 3 income is $20,000 pension + $25,461.60 Social Security
($24,000 × 1.03²), stated in today's dollars (Decision 5). Income never
exceeds spending here, so there is no surplus, and `firstShortfallYear` is
`null`.

### Validation

Same approach as [validation.md](validation.md): TypeScript types cover the
shape (`type`, `source`, `indexing`), and each topic module adds a few guard
checks for its own group. They throw a `RangeError` whose message names the
full path, e.g. `flows[2].amount must be >= 0, got -5` or
`timeline.years must be a whole number in the range 1-150, got 0`.

The existing rules are unchanged apart from the field paths and
`startBalance`. New and changed rules:

| Field | Rule | Why |
|---|---|---|
| `flows[i].id` | non-empty, unique across flows | Output is keyed by `id`; duplicates would overwrite each other. |
| `flows[i].amount` | finite, ≥ 0 | A negative flow would reverse its meaning. |
| `flows[i].fromYear`, `.toYear` | whole numbers ≥ `timeline.startYear`; `fromYear` ≤ `toYear` | A reversed range, or one starting before the projection, is always a mistake. |
| `flows[i].indexing` `{ rate }` | > -1 and ≤ 1 | Same as `returnRate`, including the units hint. |
| `portfolio.startBalance` | ≥ 0 (was > 0) | Contributions can build a balance from $0. |

## Changes to reference docs

When this stage is implemented:

- **projection.md:** grouped input with `spending` and `flows`, new output
  fields, the two-stage structure, the new algorithm and worked example.
  `annualWithdrawal` is removed, and `depletedInYear` is replaced by
  `firstShortfallYear`. **Breaking changes.**
- **validation.md:** field paths in rules and messages, flow rules, and
  `startBalance` relaxed to ≥ 0.
- **architecture.md:** status becomes Implemented.
- **README.md:** stage 2 status.

## Decisions

All accepted: 1–6 on 2026-11-22, 7 on 2026-11-23.

1. **Default `indexing` when it isn't given.** `"none"` is safer for pensions;
   `"inflation"` is right for Social Security.
   *Decision:* `indexing` is required for income flows, so the choice is always
   explicit; contributions default to `"none"`.
2. **Income above spending (surplus).** Reinvest it, or drop it?
   *Decision:* reinvest it, as in the algorithm above. An option to drop it
   can be added later if needed.
3. **Rename `annualWithdrawal` to `spending`.** A breaking change, but nothing
   outside this repo calls the library yet.
   *Decision:* rename now, while it costs nothing.
4. **`depletedInYear` definition.** Once `startBalance` can be 0 and money can
   arrive later, "balance hit 0" becomes ambiguous (a plan that starts at $0
   and saves would count as depleted in year 1).
   *Decision:* replace it with `firstShortfallYear`, the first year spending
   is not fully covered.
5. **What dollars a flow's `amount` is in.** Either today's (year-1) dollars,
   growing from year 1 like `spending`, or the dollars of the flow's first
   active year, growing from `fromYear`.
   *Decision:* today's dollars. It matches `spending`, and Social Security
   estimates are quoted in today's dollars. Pensions whose cost-of-living
   increases start only once payments begin are handled in stage 4.
6. **Calendar years or projection years for `fromYear` and `toYear`.** Either
   calendar years (`fromYear: 2028`) or 1-based projection years
   (`fromYear: 3`).
   *Decision:* calendar years. `startYear` is required, so they are always
   available. They match how people think ("Social Security from 2028"), and a
   flow's dates stay correct if the projection's `startYear` changes.
   Each year's `YearRef` carries its calendar year, so flows are compared
   against it directly and the growth formula still uses the projection year.
   Stage 3 (age) can later add an alternative such as `fromAge`.
7. **Group the input by topic.** Keep `ProjectionInput` flat, or group it
   (`timeline`, `assumptions`, `portfolio`, `spending`, `flows`)?
   *Decision:* group it now. Later stages add accounts, taxes and ages, and a
   flat input would mix every topic together. This stage is already a breaking
   change (Decision 3, `startBalance` relaxed), so grouping now avoids a second
   break later. See [architecture.md](architecture.md#1-input-grouped-by-topic).

## Testing

- `buildSchedule`:
  - a flow is 0 outside `fromYear` to `toYear`
  - each indexing mode grows as specified
  - the defaults for `fromYear`, `toYear`, and contribution `indexing`
  - `projectionYears` pairs each projection year with the right calendar year
  - a flow is active exactly from its `fromYear` to its `toYear`, as calendar
    years
  - the worked example's schedule table above
  - `spendingFor` and `flowsFor` on their own
- Year steps and state, each on its own:
  - `withdrawUpTo` never takes more than the balance, and returns what it took
  - `withdrawForSpending`: need covered, need partly covered (shortfall),
    income above spending (surplus, no withdrawal)
  - `grow` returns the growth and applies it to every account
- `summarize`: totals equal the sums of the rows; `firstShortfallYear` is the
  first row with `shortfall > 0`, or `null`
- `simulate`:
  - the worked example above
  - with no flows, results match the current engine, except
    `firstShortfallYear` (see
    [Change from the current engine](#change-from-the-current-engine))
  - income equal to spending means no withdrawal and no change to the balance
    except growth
  - income above spending is reinvested as surplus
  - contributions fund a same-year withdrawal
  - both yearly equations hold on every row of every test projection (a
    shared helper in `tests/helpers/`, called from each `simulate` test)
  - after depletion, later contributions or surplus rebuild the balance
  - a $0 start with contributions builds a balance, and `firstShortfallYear`
    stays `null` while spending is covered
  - `firstShortfallYear` is the first year with `shortfall > 0`, even if the
    balance later recovers
- Output: `flows` contains every flow's id with the right amount each year.
- Validation: the rules table above, with messages naming the full path.
