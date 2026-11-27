# Architecture

**Status:** Implemented. Introduced by stage 2; the reasons are in
[decisions.md](decisions.md#stage-2-cash-flows).

How the projection engine is structured so that each stage adds a separate
piece (an input group, a schedule builder, a year step) instead of growing one
input type, one function and one loop. Applies to every stage from stage 2 on.

## Overview

```
ProjectionInput ──► validate ──► buildSchedule ──► simulate ──► ProjectionResult
 (grouped by          (per         (per-topic        (year steps
  topic)              group)        builders)         in fixed order)
```

`projectPortfolio()` is the public function and calls the three in order.

## Code layout

```
src/
├── index.ts                    public API: re-exports only
├── core/                       shared building blocks; imports nothing from the project
│   ├── check.ts                checkRange
│   ├── limits.ts               LIMITS
│   ├── growth.ts               inflationFactor, amountInYear
│   ├── indexing.ts             Indexing, rateFor
│   └── state.ts                SimState, totalBalance, deposit, withdrawUpTo (stage 2)
├── topics/                     one folder per topic
│   ├── timeline/               Timeline, YearRef, projectionYears
│   ├── assumptions/            Assumptions
│   ├── portfolio/              Portfolio; steps: initialState, grow
│   ├── spending/               SpendingInput, SpendingSlice, spendingFor; steps: withdrawForSpending
│   └── flows/                  CashFlow, Contribution, Income, FlowsSlice, flowForYear;
│                               validateFlows; steps: depositContributions, reinvest
└── engine/                     connects topics; contains no topic logic
    ├── input.ts                ProjectionInput, composed from topic types
    ├── result.ts               ProjectionYear, ProjectionSummary, ProjectionResult
    ├── validate.ts             validateProjectionInput: calls each topic's checks
    ├── schedule.ts             ScheduleYear, buildSchedule
    ├── simulate.ts             simulate, simulateYear: the fixed step order
    ├── summarize.ts            summarize: the summary from the finished rows
    └── project.ts              projectPortfolio

tests/                          mirrors src/
├── helpers/                    the yearly-equation check
├── core/<file>.test.ts
├── topics/<topic>/<file>.test.ts
└── engine/                     projectPortfolio, simulate, summarize, schedulebuilder
```

### Topic modules

Each topic folder owns everything about its topic:

| Part | File | Example for cash flows |
|---|---|---|
| Its input types | `types.ts` | `CashFlow`, `Contribution`, `Income` |
| Its validation | `validate.ts` | flow `id`, `amount`, `fromYear`/`toYear` checks |
| Its schedule builder, and its slice of the schedule row | `schedule.ts` | per-year amounts and totals for each flow; `FlowsSlice` |
| Its year steps, if it moves money | `steps.ts` | depositing contributions |

Every topic uses these file names and creates only the ones it needs (the
timeline has no steps), so flow validation is always in
`topics/flows/validate.ts`.

| Topic | Folder | Stage |
|---|---|---|
| Timeline | `topics/timeline/` | 0 |
| Assumptions | `topics/assumptions/` | 0 |
| Portfolio | `topics/portfolio/` | 0 (stage 6 adds accounts) |
| Spending | `topics/spending/` | 0 (stage 5 extends it) |
| Cash flows | `topics/flows/` | 2 |
| Household (ages) | `topics/household/` | 3 |
| Accounts | `topics/accounts/` | 6 |
| Taxes and RMDs | `topics/tax/` | 6 |

### Dependency rule

Imports go one way only: `core` ← `topics` ← `engine` ← `index.ts`.

- `core` imports nothing from the project.
- A topic imports only `core`, plus `topics/timeline/types` for `YearRef`,
  which every topic needs. Topics never import from `engine` or from other
  topics.
- `engine` imports topics, and only `index.ts` imports `engine`.

This rules out circular imports, and each topic can be tested without the
rest of the library. Imports inside `src/` are relative, because the `@/`
alias isn't rewritten when the library is built; tests use `@/`.

### Where types live

There is no single `types.ts` for the whole library:

- **`core`** holds only types shared across topics (`Indexing`).
- **Each topic** holds its input types and its slice of the schedule row
  (e.g. `FlowsSlice = { income; contributions; flows }`).
- **`engine`** composes them:

  ```ts
  // engine/input.ts
  interface ProjectionInput {
    timeline: Timeline; assumptions: Assumptions; portfolio: Portfolio;
    spending: SpendingInput; flows?: CashFlow[];
  }

  // engine/schedule.ts
  type ScheduleYear = YearRef & SpendingSlice & FlowsSlice;
  ```

  A new topic adds one field to `ProjectionInput` and one slice to
  `ScheduleYear`.

### Public API

The public API is exactly what `src/index.ts` exports: `projectPortfolio`,
the input and result types, and `LIMITS`. Everything else is internal, so
files can move without breaking callers. Tests of internal functions import
from their files directly (`@/topics/flows/schedule`).

## 1. Input grouped by topic

Each stage adds a group, or fields inside its own group, rather than fields at
the top level:

```ts
interface ProjectionInput {
  timeline:    { startYear: number; years: number };
  assumptions: { returnRate: number; inflationRate: number };
  portfolio:   { startBalance: number };  // stage 6: { accounts: Account[] }
  spending:    { annual: number };        // stage 5: essential, discretionary, guardrails
  flows?:      CashFlow[];
  // stage 3:  household: { birthYear: number; ... }
  // stage 6:  tax: { ... }
}
```

- A topic's fields stay together, so its module can validate and read its own
  group without knowing about the rest.
- Validation messages name the full path, e.g.
  `timeline.years must be a whole number in the range 1-150, got 0`.
- A group starts small even if it holds one field (`spending: { annual }`), so
  that later fields are added inside it without a breaking change.

## 2. The schedule: everything known in advance

**Rule:** anything that can be known before the simulation runs goes in the
schedule; anything that depends on the portfolio goes in `simulate`. The
schedule holds the planned amounts, and `simulate` can adjust them as the
portfolio changes.

The split lets builders be tested without any balance calculation, and lets
Monte Carlo (stage 7) build the schedule once and simulate it many times.

### The years to project

The timeline module lists the years to project. Each entry carries both the
projection year and its calendar year:

```ts
// topics/timeline/types.ts and schedule.ts
export interface YearRef {
  year: number;          // 1-based projection year
  calendarYear: number;  // startYear + year - 1
}

export const projectionYears = ({ startYear, years }: Timeline): YearRef[] =>
  Array.from({ length: years }, (_, i) => ({ year: i + 1, calendarYear: startYear + i }));
// startYear 2026, years 4 → [{ year: 1, calendarYear: 2026 }, …, { year: 4, calendarYear: 2029 }]
```

- The calendar year is worked out **once**, here. Every builder receives it
  ready-made instead of computing `startYear + year - 1` itself, which avoids
  off-by-one mistakes.
- `projectionYears` takes only the `timeline` group, following the
  topic-module rule.
- Builders use `y.year` for growth (`(1 + g) ** (y.year - 1)`) and
  `y.calendarYear` for date checks (a flow's `fromYear` and `toYear`).

### Building the schedule

`buildSchedule` produces one row per year: the `YearRef` itself, plus a slice
from each topic's builder:

```ts
const buildSchedule = (input: ProjectionInput): ScheduleYear[] =>
  projectionYears(input.timeline).map((y) => ({
    ...y,                                                    // year, calendarYear
    ...spendingFor(input.spending, input.assumptions.inflationRate, y),    // spending
    ...flowForYear(input.flows ?? [], y, input.timeline, input.assumptions.inflationRate, birthYears),
                                                             // income, contributions, flows
    // stage 6: ...rmdPercentFor(input.household, y), ...returnRatesFor(input.portfolio, y)
  }));
```

**Each builder takes only the groups it uses, plus the `YearRef`**, and
returns only its own slice, e.g.
`flowForYear(flows, y, timeline, inflationRate): FlowsSlice`. Builders never take
the whole `ProjectionInput`: that type lives in `engine`, and importing it
would break the [dependency rule](#dependency-rule). Taking only their own
groups also makes each builder's needs obvious, and its tests build only what
it uses. The same applies to validators, and checks that span groups (a
flow's `fromYear` ≥ `timeline.startYear`) receive the other group as an
argument.

The combined `ScheduleYear` type is checked by TypeScript, and each builder
can be tested on its own.

### What goes where

Some planned features look like schedule items but belong in `simulate`:

| Feature | Where | Why |
|---|---|---|
| Spending, income, contributions (stage 2) | schedule | Fixed by the input |
| Social Security claiming age, pension start (stages 3–4) | schedule | Fixed by dates and ages |
| Return rate per year and per account (stages 6–7) | schedule | Fixed by the input or a generated sequence |
| RMD percentage (stage 6) | schedule | Fixed by age and the IRS table |
| Account balances (stage 6) | `simulate` | Each year's withdrawal is capped by the balance, which depends on earlier withdrawals |
| RMD amount (stage 6) | `simulate` | The percentage × last year-end balance |
| Taxes (stage 6) | `simulate` | Depend on how much is withdrawn, and from which account |
| Spending guardrails (stage 5) | `simulate` | Cut spending after a bad year |

## 3. Simulation: year steps in a fixed order

`simulate` keeps balances in a state object keyed by account (a single
`default` account until stage 6). It lives in `core/state.ts`, not in
`engine`, so that every topic's steps can use it without breaking the
[dependency rule](#dependency-rule):

```ts
// core/state.ts
interface SimState {
  accounts: Record<string, number>;  // balance per account id
}
// plus totalBalance(state), deposit(state, amount), withdrawUpTo(state, amount)
```

Steps change balances only through `deposit` and `withdrawUpTo`.
`withdrawUpTo` takes at most the balance, which is what keeps every balance
≥ 0. The starting state comes from the portfolio topic (`initialState`).

Each year runs a fixed sequence of small, named steps, called by
`simulateYear` in `engine/simulate.ts`. Each step:

- lives in the topic that owns it (`topics/<topic>/steps.ts`)
- takes the state plus only the values it needs from the schedule row or input
- returns only the values recorded in the row.

Steps change the state in place, but only inside `simulate`, which creates
the state and shares it with nothing, so `simulate` is still pure from the
outside. `simulateYear` builds the row as the schedule row plus the step
results (`ProjectionYear extends ScheduleYear`), so a new schedule slice
reaches the output automatically. The summary is calculated afterwards from
the finished rows (`summarize`), with no running totals.

| Order | Step | Topic | Stage | Does |
|---|---|---|---|---|
| 1 | `depositContributions` | flows | 2 | Adds the year's contributions to the portfolio |
| 2 | `takeRmds` | tax | 6 | Forced withdrawals from traditional accounts. Before step 3 because RMDs count toward spending |
| 3 | `withdrawForSpending` | spending | 2 | `need = spending - income` (stage 6: minus RMDs, plus taxes); withdraws up to the balance; returns withdrawal, shortfall and surplus. Stage 6 adds withdrawal order and the tax gross-up here |
| 4 | `reinvest` | flows | 2 | Puts income above spending (surplus) back in. Stage 6: also excess RMDs |
| 5 | `grow` | portfolio | 2 | Applies the return and returns the growth. Stage 6: per account |

Stage 2's per-year algorithm is in
[projection.md](projection.md#algorithm).

**The order is part of the design.** Each stage doc says where its steps go
and why. Steps are called directly in this order: no plugin or middleware
system, which would hide the order.

All money moves at the start of the year, before growth (steps 1–4 before
step 5).

## 4. Two equations every year

Every year must satisfy two equations. They are the core rule every stage
follows, and the tests check them on **every row of every projection**, which
catches mistakes in how features interact (for example an RMD counted twice).

**Household cash: money in equals money out.**

```
income + withdrawals + shortfall = spending + taxes + reinvested
```

**Portfolio: the balance moves only by the year's flows and growth.**

```
endBalance = startBalance + contributions + reinvested - withdrawals + growth
```

| Term | Stage 2 | Stage 6 adds |
|---|---|---|
| `withdrawals` | the withdrawal for spending | RMDs; the tax gross-up |
| `taxes` | 0 | tax on income and withdrawals |
| `reinvested` | surplus | excess RMDs |

- **`spending` always means what is spent on living.** Taxes and RMDs change
  how much comes out of the portfolio, not what is spent.
- **`shortfall` always means spending that wasn't funded**, never unpaid tax.
- Contributions are not household cash in this model: they come from outside
  (e.g. wages) and go straight into the portfolio, so they appear only in the
  portfolio equation.

## 5. Output

- Totals stay as they are (`startBalance`, `endBalance`, `endBalanceReal`,
  `withdrawal`), summed across accounts.
- Rows will widen as stages add fields. Group them (`row.balances`,
  `row.cash`) when stage 6 adds per-account fields, not before.

## Adding a stage: checklist

A stage doc is a draft in `design/drafts/` (see
[README.md](README.md#how-these-docs-work)). Each must say:

1. **Code:** which topic folder it adds or extends, and which files.
2. **Input:** which group it adds, or which fields it adds inside a group.
3. **Validation:** the rules for its group.
4. **Schedule:** which builder or fields it adds, and why they are known in
   advance.
5. **Simulation:** which year steps it adds or changes, and where they go in
   the order.
6. **Equations:** how it changes the two yearly equations.
7. **Output:** new fields on rows and the summary.
8. **Breaking changes**, if any.
9. **Decisions:** each open question, the options, and the choice once made.

When the stage is implemented:

- Merge its design into the reference docs, so they match the code.
- Condense the draft into an entry in [decisions.md](decisions.md): the
  problem, the decisions with the options rejected, and breaking changes.
  Note the commit holding the full draft.
- Delete the draft and update the roadmap in [README.md](README.md).

## Not doing

- **A plugin or middleware system for steps.** The steps are known and their
  order matters; plain function calls keep the order visible.
- **Generic schedule merging** (e.g. a `mergeByYear` over arbitrary builders).
  Spreading each builder's slice into the row is enough and keeps the types
  simple.
