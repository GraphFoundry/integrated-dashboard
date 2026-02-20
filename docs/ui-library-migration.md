# UI Library Migration Decision

## Chosen Approach

We selected **React Aria headless components** (`react-aria-components`) with an internal adapter layer in `src/components/ui/*`.

## Why This Was Chosen

- Incremental, page-by-page migration with low risk.
- Strong accessibility defaults (keyboard, focus, semantics, screen-reader support).
- Works with existing tokenized styling (`uiClassTokens` + CSS custom properties) without forcing global theme rewrites.
- Supports required form controls for this migration (input, textarea, select, combobox, slider, checkbox, radio group, switch).

## Why Other Options Were Rejected

- **Radix-only**: excellent primitives, but combobox would require additional custom work or extra libraries.
- **shadcn/ui**: larger copied-component maintenance surface and higher token-style drift risk.
- **Full suites (MUI/Mantine/Ant/Chakra)**: higher likelihood of conflicts with current glass/neon token system and larger global theme changes.

## Migration Rules

- Preserve existing business logic, state structure, API contracts, routing, and user workflows.
- Keep controls controlled with existing `value` / `onChange` semantics.
- Hide library-specific payload differences inside adapters.
- Keep diffs small and page-scoped.
- Run `npm run verify` after each chunk.
- Maintain focus-visible behavior, keyboard operability, and reduced-motion compatibility.
