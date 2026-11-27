# Reckon

A TypeScript library for retirement planning. `projectPortfolio(input)`
projects a portfolio year by year from a starting balance, return, inflation,
spending, cash flows (income and contributions) and an optional household
(people with birth years, so flows can be dated by age). It is a calculation
engine, not an app: plain data in, plain data out.

- **Pure and deterministic:** no I/O, no clock, no randomness. The same input
  always gives the same result.
- **Pre-1.0:** stages 0–3 are built; later stages are in the roadmap in
  `design/README.md`. The API may change between stages.

## Dependencies

- **Runtime:** none. The library uses only the language and standard
  built-ins.
- **Dev:** `@types/bun`. Peer: `typescript` ^7.
- **Tooling:** Bun runs, tests, type checks and formats the project. Use Bun
  rather than Node.js, npm, jest or tsc:
  - `bun test` to run the tests (root is `tests/`, set in `bunfig.toml`)
  - `bun check` to type check (`bun check src/index.ts` for one file and its
    imports)
  - `bun fmt` to format
  - `bun install`, `bun run <script>`, `bunx <package>`

## Code layout and rules

The design is in `design/architecture.md`. The rules most easily broken:

- **Dependency rule:** `core` ← `topics` ← `engine` ← `src/index.ts`.
  - `core` imports nothing from the project.
  - A topic imports only `core`, plus `topics/timeline/types`.
  - Topics never import from each other or from `engine`. When one topic needs
    another's data, the engine passes it as a plain value, e.g.
    `birthYears: Record<string, number>` or `inflationRate: number`.
- **Imports inside `src/` are relative.** The `@/` alias isn't rewritten when
  the library is built. Tests use `@/`.
- **Each topic folder** (`src/topics/<topic>/`) holds `types.ts`,
  `validate.ts`, `schedule.ts` and `steps.ts`, creating only the ones it needs.
- **The schedule holds what's known in advance; `simulate` holds what depends
  on the balance.** Year steps run in a fixed order in
  `engine/simulate.ts`.
- **The public API** is exactly what `src/index.ts` exports.

## Conventions

- Rates are decimals: `0.05` means 5%.
- Money is a `number` in dollars, never rounded inside the calculation.
- Input amounts are in today's (year-1) dollars. Output amounts are nominal,
  except fields ending in `Real`.
- Validation throws a `RangeError` on the first failure. The message starts
  with the field's full path, gives the rule, and ends with `got <value>`, e.g.
  `flows[1].amount must be >= 0, got -5`. The rules and messages are in
  `design/validation.md`.
- Every projection in the tests is checked against the two yearly equations
  (`tests/helpers/equations.ts`).

## Design docs

`design/` has reference docs, which always match the code, drafts of future
stages in `design/drafts/`, and `decisions.md`, which records why each stage
was built the way it was. When a stage is implemented:

1. Merge its design into the reference docs.
2. Condense the draft into `decisions.md`.
3. Delete the draft and update the roadmap.

`design/README.md` has the details.
