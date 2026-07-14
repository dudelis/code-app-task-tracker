---
description: Coding guidelines and practices for building and maintaining the React app.
applyTo: "app/src/**/*.{ts,tsx}"
---

# React Coding Guidelines

These guidelines govern how we write and maintain the React front end in `app/src`.
The current stack is **React 19 + TypeScript + Vite + MUI (Emotion) + Vitest**, backed by
generated Dataverse services. Prefer these conventions over personal habits; when a rule
genuinely does not fit a situation, note why in the code review rather than silently ignoring it.

> Context: `App.tsx` currently holds the entire UI (~2,000+ lines). Treat that as debt to pay
> down incrementally, not a pattern to copy. New work should follow the structure below.

## 1. Component structure & file organization

- **One component per file.** A file exports one primary component; small private
  sub-components used only by it may live in the same file.
- **Keep components small.** Aim for under ~200 lines. If a component grows past that,
  extract sub-components or hooks. `App.tsx` should become a thin composition root, not the app.
- **Co-locate by feature**, not by type. Group a component with its hooks, styles, and tests:
  ```
  src/
    features/
      board/
        Board.tsx
        Board.test.tsx
        BucketColumn.tsx
        useBoard.ts
    components/        # shared, reusable, presentational components
    data/             # data-access layer (already exists)
    generated/        # generated Dataverse models/services — never hand-edit
  ```
- **Name files after their default export** using `PascalCase.tsx` for components and
  `camelCase.ts` for hooks/utilities (`useBoard.ts`, `formatDate.ts`).
- Never hand-edit anything under `src/generated/`; regenerate it instead.

## 2. Components: presentational vs. container

- Separate **presentational** components (render props, no data fetching) from
  **container** logic (data loading, mutations, orchestration).
- Push data access into the `data/` layer and custom hooks; components should receive
  data via props or a hook, not call Dataverse services inline.
- Keep components **pure**: given the same props they render the same output. Side effects
  belong in event handlers or `useEffect`.

## 3. Function components & hooks

- Use **function components** with hooks only. No class components.
- **Follow the Rules of Hooks**: call hooks at the top level, never inside conditions,
  loops, or nested functions. `eslint-plugin-react-hooks` is enabled — keep it green.
- **Custom hooks** encapsulate reusable stateful logic; name them `useX` and return a
  stable, minimal API (values + memoized callbacks).
- `useEffect` is for synchronizing with external systems (data fetch, subscriptions),
  **not** for deriving state. Derive values during render or with `useMemo`.
- Always specify complete, honest dependency arrays. Do not disable the exhaustive-deps
  lint rule to hide a bug — fix the dependency instead.
- Provide cleanup functions for subscriptions, timers, and in-flight requests to avoid
  state updates after unmount.

## 4. State management

- **Keep state as local as possible.** Lift it only to the nearest common ancestor that
  needs it. Avoid a giant `useState` cluster in `App.tsx`.
- Prefer **derived state over stored state** — compute from existing state/props with
  `useMemo` rather than duplicating it in another `useState`.
- Use `useReducer` when state transitions are complex or several values change together
  (e.g. board drag-and-drop). Model transitions as explicit actions.
- Introduce **Context** only for genuinely global concerns (theme, current user, data client).
  Don't use Context as a substitute for prop passing in a small subtree, and split contexts
  to limit re-renders.
- Treat state as **immutable**: never mutate arrays/objects in place; produce new values.

## 5. Props & TypeScript

- **Type everything explicitly.** Define a `Props` interface/type for every component; avoid
  `any`. Prefer `unknown` + narrowing at boundaries.
- Follow the existing pattern of a **stable UI-facing type** (e.g. `Task`) that projects the
  generated `csa_*` Dataverse model, so components never depend on raw field names.
- Use discriminated unions for variant props and for async state
  (`{ status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: E }`).
- Destructure props in the signature; give sensible defaults there.
- Prefer `readonly` props and `ReadonlyArray<T>` where mutation isn't intended.
- Keep prop lists short. If a component takes many props, it's probably doing too much.

## 6. Rendering & performance

- **Always give list items a stable, unique `key`** (a domain id, never the array index when
  the list can reorder — the board reorders, so use ids).
- Don't optimize prematurely. Reach for `React.memo`, `useMemo`, and `useCallback` when there
  is a measured re-render problem or to keep referential stability for deps — not by reflex.
- Avoid creating new object/array/function literals in JSX hot paths when they feed memoized
  children.
- Keep expensive computation out of render; memoize it.

## 7. MUI & styling

- Build UI from **MUI components**; don't hand-roll what MUI provides (buttons, dialogs, lists).
- Centralize design decisions in the **theme** (`src/theme.ts`); read spacing, colors, and
  breakpoints from the theme rather than hardcoding pixel values.
- Style with the `sx` prop or `styled()` from Emotion. Avoid inline `style={{}}` except for
  truly dynamic, one-off values.
- Keep styling co-located with the component; extract shared styled components when reused.

## 8. Accessibility

- Use semantic elements and MUI's built-in a11y; provide `aria-label` for icon-only buttons
  (e.g. `IconButton`), which several already need.
- Ensure interactive elements are keyboard reachable and have visible focus.
- Associate form inputs with labels; surface validation errors accessibly.
- Drag-and-drop must have a keyboard/alternative path for changing a task's status.

## 9. Data access & side effects

- All Dataverse reads/writes go through the **`data/` layer** over the generated services;
  components call thin functions/hooks, not `getClient()` directly.
- Keep the **dependency-injection seam** used in `data/` (e.g. `TasksFetcher`) so logic stays
  unit-testable without the Power Apps runtime.
- Handle the three async states explicitly everywhere: **loading, empty, error** — not just the
  happy path.
- Make mutations **optimistic only when safe**, and always reconcile/rollback on failure.

## 10. Error handling

- Wrap major UI regions in **error boundaries** so one failure doesn't blank the app.
- Never swallow errors silently; surface them to the user (MUI `Alert`/`Snackbar`) and log.
- Validate/narrow external data at the boundary before it flows into typed component state.

## 11. Testing (Vitest)

- Co-locate tests as `*.test.ts(x)` next to the code (matches the existing `data/` tests).
- **Test behavior, not implementation**: assert on rendered output and user-visible effects.
- Keep the **data/logic layer covered by fast unit tests** using injected fetchers; reserve
  component tests for interaction and rendering concerns.
- Every bug fix gets a regression test. Keep `npm test` green before pushing.

## 12. Code quality & conventions

- **Keep the linter green.** `npm run lint` (ESLint + `typescript-eslint` +
  react-hooks/react-refresh) must pass; don't merge with disabled rules unless justified.
- Use functional, immutable patterns (`map`/`filter`/`reduce`, spread) over mutation.
- Prefer small, pure helper functions; give them clear names and unit tests.
- Comments explain **why**, not what. Follow the existing doc-comment style on exported types.
- No dead code, no `console.log` in committed code, no commented-out blocks.

## 13. Refactoring `App.tsx` (near-term direction)

When touching `App.tsx`, extract rather than extend:

1. Pull each screen/region (board, task drawer, dialogs, app bar) into its own component.
2. Move data loading and mutation orchestration into custom hooks (`useTasks`, `useBoard`, …).
3. Reduce `App.tsx` to layout + composition + top-level providers.
4. Add a co-located test as you extract each piece.

Do this incrementally alongside feature work; don't block features on a full rewrite.
