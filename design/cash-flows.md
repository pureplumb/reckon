# Stage 2: Cash Flows

**Status:** Draft. All decisions accepted on 2026-11-22.

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

interface ProjectionInput {
  startBalance: number;  // >= 0 (was > 0)
  returnRate: number;
  inflationRate: number;
  spending: number;      // replaces annualWithdrawal; see Decision 3
  flows?: CashFlow[];
  years: number;
  startYear: number;
}
```

- `CashFlow` is a **discriminated union**: `type` tells TypeScript which kind
  of flow it is, and after checking it the compiler knows which fields exist
  (`source` only on `Income`).
- Each kind is declared as an interface that `extends FlowBase`, rather than
  as `FlowBase & { ... }`. The two mean the same, but interfaces give clearer
  compiler error messages and give each kind a name to use in code (`Income`).
- Each kind can gain its own fields later without affecting the others
  (Social Security: claiming age and benefit amount; pension: survivor
  benefit), or become its own interface (`SocialSecurity extends FlowBase`).
  Code that handles flows uses a `switch` on `type` with an exhaustiveness
  check (`const unhandled: never = flow`), so the compiler points out every
  place a new kind must be handled.
- Classes are not used for flows: class instances don't survive conversion to
  and from JSON, which would break the plain-data principle.
- `spending` replaces `annualWithdrawal`. Once income exists the amount
  withdrawn is calculated rather than entered, so the old name would mislead.
- **`spending` is a cash flow in concept but not in the `CashFlow` list.**
  There is exactly one spending amount, it's required, and it always grows with
  inflation, so a single number is simpler than a flow. `buildSchedule` treats
  it like a flow internally. Stage 5 (essential and discretionary spending) may
  turn it into flows with their own kind, such as `type: "expense"`.

### A flow's amount in a given year

A flow is active in calendar years `fromYear` to `toYear`. `buildSchedule`
converts these to 1-based projection years with
`y = calendarYear - startYear + 1`. In an active projection year `y`:

```
value(y) = amount * (1 + g)^(y - 1)
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

For each year it:
1. calculates spending: `spending * (1 + inflationRate)^(year - 1)`
2. works out each flow's amount: 0 outside `fromYear` to `toYear`, otherwise
   `amount * (1 + g)^(year - 1)` (see
   [A flow's amount in a given year](#a-flows-amount-in-a-given-year))
3. adds the amount to `income` or `contributions` according to the flow's
   `type`, using the `switch` with the `never` check.

For the [worked example](#worked-example) the schedule is:

| Year | Calendar | Spending  | pension   | ss        | savings   | Income    | Contributions |
|------|----------|-----------|-----------|-----------|-----------|-----------|---------------|
| 1    | 2026     | 60,000.00 | 20,000.00 | 0.00      | 10,000.00 | 20,000.00 | 10,000.00     |
| 2    | 2027     | 61,800.00 | 20,000.00 | 0.00      | 10,000.00 | 20,000.00 | 10,000.00     |
| 3    | 2028     | 63,654.00 | 20,000.00 | 25,461.60 | 0.00      | 45,461.60 | 0.00          |
| 4    | 2029     | 65,563.62 | 20,000.00 | 26,225.45 | 0.00      | 46,225.45 | 0.00          |

#### What goes where

The rule for this and later stages: anything that can be known in advance
goes in `buildSchedule`; anything that depends on the portfolio goes in
`simulate`. The schedule holds the planned amounts, and `simulate` can adjust
them as the portfolio changes. Some planned features look like schedule items
but belong in `simulate`:

| Feature | Where | Why |
|---|---|---|
| Social Security claiming age, pension start (stages 3–4) | `buildSchedule` | Fixed by dates and ages |
| RMDs (stage 6) | `simulate` | Based on the previous year-end balance |
| Taxes (stage 6) | `simulate` | Depend on how much is withdrawn |
| Spending guardrails (stage 5) | `simulate` | Cut spending after a bad year |

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

- **`simulate` keeps balances in a state object keyed by account**, holding a
  single account for now:

  ```ts
  interface SimState {
    accounts: Record<string, number>;  // balance per account id
  }

  // Stage 2: one account holding the whole portfolio
  const state: SimState = { accounts: { default: input.startBalance } };
  ```

  In the algorithm below, `balance` means `state.accounts.default`. Output
  fields such as `startBalance` and `endBalance` are the total across
  accounts, which today is the one account.
- **`ScheduleYear` has room for per-account inputs.** Stage 6 adds, for
  example, each account's return rate and contributions for each year. No
  fields are added now.
- **Contribution flows have room for an `account` field.** Stage 6 adds an
  optional `account` naming which account receives the money. Until then,
  every contribution goes to the single account.

### Algorithm

All money moves at the **start** of the year, before growth, as in the current
engine.

`simulate` has the same shape as the current loop. The withdrawal target has
moved into the schedule, and netting against income and contributions is new:

```
balance = startBalance
for s in schedule:
    need       = s.spending - s.income
    withdrawal = min(max(need, 0), balance + s.contributions)
    surplus    = max(-need, 0)        // income above spending; see Decision 2
    shortfall  = max(need, 0) - withdrawal
    afterFlows = balance + s.contributions + surplus - withdrawal
    growth     = afterFlows * returnRate
    endBalance = afterFlows + growth
    record row: s's fields plus the values above
    update totals and firstShortfallYear
    balance    = endBalance
```

- Contributions made in a year can fund that year's withdrawal.
- Start-of-year contributions earn that year's full return. That's the
  generous assumption for money coming in, just as start-of-year withdrawals
  are the cautious one for money going out.
- When there is no surplus, every year satisfies
  `income + withdrawal + shortfall = spending`.

### Output

New fields on `ProjectionYear`:

```ts
spending: number;               // inflation-adjusted spending target
income: number;                 // total income this year
contributions: number;          // total contributions this year
surplus: number;                // income above spending, reinvested
flows: Record<string, number>;  // each flow's amount this year, keyed by id
```

`withdrawal` keeps its meaning: money taken out of the portfolio. `shortfall`
becomes spending not covered by income or withdrawals.

New fields on `summary`: `totalIncome`, `totalContributions`.

`summary.depletedInYear` is replaced by `firstShortfallYear: number | null`:
the first year spending wasn't fully covered (`shortfall > 0`), or `null` if
it always was (see Decision 4).

### Worked example

$500,000, 5% return, 3% inflation, $60,000 spending, starting in 2026, with:
- a pension of $20,000, `indexing: "none"`, all years
- Social Security of $24,000 in today's dollars, `indexing: "inflation"`, from
  year 3 (2028)
- contributions of $10,000, `indexing: "none"`, years 1 to 2 (2026 to 2027)

As input:

```ts
{
  startBalance: 500_000, returnRate: 0.05, inflationRate: 0.03,
  spending: 60_000, years: 4, startYear: 2026,
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
shape (`type`, `source`, `indexing`), and `validateProjectionInput` adds a few guard
checks that throw a `RangeError` naming the flow, e.g.
`flows[2].amount must be >= 0, got -5`.

| Field | Rule | Why |
|---|---|---|
| `id` | non-empty, unique across flows | Output is keyed by `id`; duplicates would overwrite each other. |
| `amount` | finite, ≥ 0 | A negative flow would reverse its meaning. |
| `fromYear`, `toYear` | whole numbers ≥ `startYear`; `fromYear` ≤ `toYear` | A reversed range, or one starting before the projection, is always a mistake. |
| `indexing` `{ rate }` | > -1 and ≤ 1 | Same as `returnRate`, including the units hint. |
| `startBalance` | ≥ 0 (was > 0) | Contributions can build a balance from $0. |

## Changes to reference docs

When this stage is implemented:

- **projection.md:** new input (`spending`, `flows`), new output fields, the
  two-stage structure, the new algorithm and worked example. `annualWithdrawal`
  is removed, and `depletedInYear` is replaced by `firstShortfallYear`.
  **Breaking changes.**
- **validation.md:** flow rules, and `startBalance` relaxed to ≥ 0.
- **README.md:** stage 2 status.

## Decisions

All accepted on 2026-11-22.

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
   `buildSchedule` converts them to projection years
   (`y = calendarYear - startYear + 1`), so the formulas above are unchanged.
   Stage 3 (age) can later add an alternative such as `fromAge`.

## Testing

- `buildSchedule`:
  - a flow is 0 outside `fromYear` to `toYear`
  - each indexing mode grows as specified
  - the defaults for `fromYear`, `toYear`, and contribution `indexing`
  - calendar years convert to the right projection years
  - the worked example's schedule table above
- `simulate`:
  - the worked example above
  - with no flows, results match the current engine
  - income equal to spending means no withdrawal and no change to the balance
    except growth
  - income above spending is reinvested as surplus
  - contributions fund a same-year withdrawal
  - the `income + withdrawal + shortfall = spending` identity holds in years
    without surplus
  - a $0 start with contributions builds a balance, and `firstShortfallYear`
    stays `null` while spending is covered
  - `firstShortfallYear` is the first year with `shortfall > 0`, even if the
    balance later recovers
- Output: `flows` contains every flow's id with the right amount each year.
- Validation: the rules table above.
