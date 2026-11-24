# Input Validation

**Status:** Implemented.

## Principle

The library guards the math; the client owns the user experience.

- **The client** validates values as the user enters them, shows friendly
  messages and highlights fields. It reuses the library's exported `LIMITS`, so
  the two never disagree.
- **The library** rejects only inputs that would make the projection
  meaningless: `NaN` spreading through every year, `years: 1e9` building a huge
  array, or a rate of `5` meant as 5%. It does this with a few guard checks that
  throw. It doesn't return warnings, collect every error, or provide error codes.

TypeScript types are the main contract.

## Code

| Where | What | Exported |
|---|---|---|
| `src/core/limits.ts` | `LIMITS`: the numeric limits shared with clients | yes, from the public API |
| `src/core/check.ts` | `checkRange(cond, message)`: throws a `RangeError` with `message` if `cond` is falsy. A TypeScript assertion function, used by every topic. Also `isRate` and `RATE_RULE`, shared by every rate check | no (internal) |
| `src/topics/<topic>/validate.ts` | One validator per topic: `validatePortfolio`, `validateAssumptions`, `validateSpending`, `validateTimeline`, `validateFlows`. Each takes only its own fields, except `validateFlows`, which also takes the timeline to check flow years | no |
| `src/engine/validate.ts` | `validateProjectionInput(input)`: calls each topic validator, in that order | no |

```ts
export const LIMITS = {
  rate: { min: -1, max: 1 },   // min is exclusive
  years: { min: 1, max: 150 },
} as const;

export function checkRange(cond: unknown, message: string): asserts cond;
```

`projectPortfolio()` calls `validateProjectionInput()` on its first line, so
every projection is checked. Validation stops at the first failed rule.

Clients import `LIMITS` from the public API (`src/index.ts`), alongside
`projectPortfolio`. The order of checks (portfolio, assumptions, spending,
timeline, flows) matters only when several fields are invalid at once: the
first failure is reported. Flows come after the timeline, because their years
are checked against `timeline.startYear`.

## Rules

Each check combines "is a finite number" with the rule, so `NaN` and
`Infinity` fail the same check as an out-of-range value.

| Field | Rule | Why |
|---|---|---|
| `portfolio.startBalance` | finite, ≥ 0 | A negative balance is meaningless. $0 is allowed because contributions or income can build a balance from nothing (relaxed from > 0 in stage 2; loosening a rule doesn't break existing callers). |
| `assumptions.returnRate` | finite, > -1 and ≤ 1 | -100% or worse is impossible. Above 100% almost always means `5` was entered for 5%. |
| `assumptions.inflationRate` | finite, > -1 and ≤ 1 | Same reasoning. |
| `spending.annual` | finite, ≥ 0 | Negative spending would add money. |
| `timeline.years` | whole number, 1 to 150 | The upper limit stops a typo from building a huge array. |
| `timeline.startYear` | whole number | Labels each row with its calendar year. Later stages (age, Social Security, RMDs) depend on the calendar year, so it is required. |
| `flows[i].id` | non-empty string, unique across flows | Output is keyed by `id`; duplicates would overwrite each other. |
| `flows[i].amount` | finite, ≥ 0 | A negative flow would reverse its meaning. |
| `flows[i].fromYear`, `.toYear` | whole numbers ≥ `timeline.startYear`; `fromYear` ≤ `toYear` when both are given | A reversed range, or one starting before the projection, is always a mistake. A `toYear` past the last projection year is allowed: the flow stops with the projection. |
| `flows[i].indexing` `{ rate }` | finite, > -1 and ≤ 1 | Same as `returnRate`, including the units hint. |

## Errors

The first failed check throws a `RangeError` whose message starts with the
field's full path (`group.field`), then gives the rule and the value. Messages
for the two rates include the units hint:

| Input | Message |
|---|---|
| `assumptions: { returnRate: 5 }` | `assumptions.returnRate must be > -1 and <= 1 (rates are decimals: 0.05 means 5%), got 5` |
| `assumptions: { inflationRate: NaN }` | `assumptions.inflationRate must be > -1 and <= 1 (rates are decimals: 0.05 means 5%), got NaN` |
| `portfolio: { startBalance: -1 }` | `portfolio.startBalance must be >= 0, got -1` |
| `spending: { annual: -1 }` | `spending.annual must be >= 0, got -1` |
| `timeline: { years: 2.5 }` | `timeline.years must be a whole number in the range 1-150, got 2.5` |
| `timeline: { startYear: 2026.5 }` | `timeline.startYear must be a whole number, got 2026.5` |
| `flows: [{ amount: -5, … }]` | `flows[0].amount must be >= 0, got -5` |
| two flows with `id: "pension"` | `flows[1].id must be unique, got "pension" (also flows[0].id)` |
| `flows: [{ fromYear: 2025, … }]`, `startYear: 2026` | `flows[0].fromYear must be a whole number >= timeline.startYear (2026), got 2025` |
| `flows: [{ fromYear: 2030, toYear: 2029, … }]` | `flows[0].toYear must be >= fromYear (2030), got 2029` |
| `flows: [{ indexing: { rate: 3 }, … }]` | `flows[0].indexing.rate must be > -1 and <= 1 (rates are decimals: 0.05 means 5%), got 3` |

## Out of scope

- **Plausibility warnings** (e.g. a 25% return): the client can flag unusual
  values using `LIMITS` and its own thresholds.
- **Untyped JSON input:** if the library is later exposed through an HTTP API,
  validate the request with a schema library (`zod`, `valibot`) in the server
  code, not in the library.

## Testing

Tests are in the `input validation` block of
`tests/engine/projectPortfolio.test.ts`, run through `projectPortfolio()`:
- Valid input does not throw.
- Each field is rejected for out-of-range values, `NaN` and (where relevant)
  `Infinity`. Every rejection must be a `RangeError` whose message starts with
  the field's full path (`timeline.years must …`) and includes `got <value>`.
- Values just inside each limit are accepted: `portfolio.startBalance: 0`,
  rates of `-0.9999` and `1`, `spending.annual: 0`, `timeline.years: 1` and
  `150`.
- Both rates entered as `5` give the "0.05 means 5%" hint.
- Flows are validated through `projectPortfolio()` with their index in the
  path, and an invalid `timeline.startYear` is reported before flow years.

Each flow rule, with its exact message and boundaries, is tested on its own in
`tests/topics/flows/validate.test.ts`.
