# Agent Guidelines & Context

## 1. Global Directives & Triggers

### `[shutdown]` Trigger Directive
- **Context**: Autonomous unattended execution directive.
- **Workflow**:
  - Run all steps of the approved plan to completion without pausing for interactive confirmation.
  - Verification must be scoped, deterministic, and non-destructive (static code inspection, lint/type checks, syntax validation).
  - Upon completion or upon reaching an unresolvable blocker, deliver status and summary to Telegram (`@zeetec20_bot`) via `~/.omp/scripts/telegram_shutdown.py` and initiate system shutdown.

### `[git]` Trigger Directive
- **Context**: Structured git workflow management.
- **Workflow**:
  - Check repository git state and configuration (`.omp/gitflow.yml` or repo conventions).
  - When on base branches (`master`, `main`, `ai`, `develop`), MUST ask the user for the ticket code first before creating a branch (`STOP-{ticket}/{topic}`). Never guess or increment ticket numbers.
  - Create granular, clean commits with emoji-tagged change summaries.
  - Never push commits to remote repositories automatically; present the manual push command upon completion.

## 2. Verification Discipline
- Prefer static analysis, type checking, diff inspection, and targeted unit test scripts.
- Never run production builds, background dev servers, or live database commands unless specifically requested.
- Maintain minimal diff footprint and clean working trees.

## 3. Code Quality & Naming Conventions
- **Domain-Explicit Naming**: Functions, utilities, and exported symbols must explicitly include their domain or entity context (e.g., `readHouseholdSnapshotFile`, not generic mechanical names like `readSnapshotFile`). Never name functions purely by generic mechanical usage without specifying what domain or entity they operate on.
- **Const Arrow Functions**: Every function and React component MUST be defined using `const` arrow function syntax (`const myFunc = (...) => ...`). NEVER use `function` declarations (`function myFunc(...)`), except where language constructs mandate otherwise (such as generator functions `function*`, class methods, or object literal method shorthand).
- **Single-Mutation & Value Derivation Over Branch Spam**: Never repeat setter, mutation, or dispatch calls across multiple branches to assign the same target (such as repeated `headers.set(...)`, `res.setHeader(...)`, or `map.set(...)`). Derive or normalize the resolved value into a local variable first, and invoke the setter/mutation exactly once at the end. Collapse nested branch cascades into linear, step-by-step value transformations.
- **Built-in & Upstream Features First**: Always check and use platform primitives, framework capabilities, or upstream library built-in features first before rebuilding custom abstractions, custom utilities/loggers, or installing third-party dependencies (e.g., Payload's built-in Pino logger over custom logging engines, native Web API `Request`/`Response` over framework wrappers, stdlib over micro-packages).
- **Top-Level Re-Exports After Imports**: Type re-exports and module re-exports (`export type { ... } from '...'`, `export * from '...'`) MUST be grouped at the top of the file immediately following the regular import declarations. NEVER place type re-exports in the middle of executable code, handler logic, or at the bottom of the file.
- **Readability Spacing & Visual Chunking**: Maintain clear vertical spacing (blank lines) between logical sections, module initialization, top-level constants, helper functions, exported handlers, and application bootstrap blocks. Avoid cramped consecutive lines between distinct concerns to ensure effortless visual scanning and readability.
