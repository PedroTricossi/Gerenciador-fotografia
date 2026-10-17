# Retro Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every screen of the frontend into the approved retro look, in a light and a dark theme, with a theme switch, fixed alignment and calendar overflow, and automated accessibility, contrast and overflow checks. Behaviour does not change.

**Architecture:** All visual values live in `frontend/src/ui/tokens.css`. Light values sit on `:root`; dark values sit under `prefers-color-scheme: dark` (unless `data-theme="light"`) and under `[data-theme="dark"]`. A same-origin `public/theme-init.js` applies the stored choice before first paint, and a `ThemeSwitch` in the side menu changes it. `ui/` components are restyled in place and keep their props. Features only swap raw text elements for a few new `ui/` primitives and adjust layout CSS.

**Tech Stack:** React 19, TypeScript, Vite 7, CSS Modules, Vitest + Testing Library, Playwright, and `@axe-core/playwright` (new dev dependency). Fonts: IBM Plex Mono and VT323, self-hosted WOFF2 under the OFL.

**Spec:** `docs/superpowers/specs/2026-10-17-retro-redesign-design.md` (mockups in `docs/superpowers/specs/assets/2026-10-17-retro-redesign/`)

## Global Constraints

- No behaviour change. Every existing Vitest, pytest and Playwright test passes unedited. The one allowed exception: a test that depended on the top-bar layout (none are known; link names don't change).
- CSP stays `default-src 'self'`. No external URL anywhere in the built app, no inline `<script>`, and no `style=` attributes in HTML. Vite keeps `assetsInlineLimit: 0` and `modulePreload: { polyfill: false }`.
- Fonts: **IBM Plex Mono** (400, 700) for all text and **VT323** for page titles only, at ≥ 1.75rem. Both are WOFF2 files in `frontend/src/ui/fonts/`, each with its `OFL.txt`, downloaded from the official `google/fonts` GitHub repository (or IBM's `plex` release).
- Body text ≥ 1rem with line height about 1.5. All sizes in `rem`.
- WCAG 2.2 AA in both themes:
  - Text contrast ≥ 4.5:1, large text ≥ 3:1, meaningful non-text ≥ 3:1.
  - Visible focus with ≥ 3:1 contrast, never hidden behind the menu or toasts.
  - Targets ≥ 24×24 CSS px.
  - Works at 200% zoom.
  - Colour is never the only signal.
  - Transitions respect `prefers-reduced-motion`.
- Light theme: amber `#ffb000` is only a fill behind dark text, never text or a thin line on cream.
- Palette starting points and roles: spec §2.1. Shapes: 2px ink outlines, box radius about 14px, control radius about 8px, hard shadows `4px 4px 0` (boxes) and `2px 2px 0` (primary button), no blur.
- Dates are plain text. Typewriter text everywhere.
- Theme storage: `localStorage` key `gf-theme`, value `light` | `dark` | absent (= automatic). Reads and writes are wrapped in `try/catch`. The agenda's existing view-choice key stays. No personal data in storage.
- Layering: features stay layout-only and import `ui/`. `ui/` imports nothing from `api/`, `domain/`, `features/` or `app/`. Every visual value in `ui/` is a token.
- Existing token names stay. Features already use `--color-primary`, `--color-text-muted`, `--color-info-bg`, `--color-border` and the `--space-*` tokens. Values change, and new tokens are added beside them.
- Tests query by role, label and text only.
- Portuguese UI text. Commit trailers as in earlier plans.

## Review Focus

1. **Long text everywhere, not just the calendar:** a 60-character couple name or venue in the contract list, client list, service list and agenda list wraps inside its cell or row and never widens the page. Test in Task 7 (overflow check seeds long names).
2. **Blocked storage** (Safari private mode or disabled site data): `theme-init.js` and the switch must not throw; the app falls back to automatic. Tests in Task 1 (script) and Task 2 (switch).
3. **Mac switching light/dark while the app is open in Automático:** the colours change live without a reload. Test in Task 7.
4. **Focus ring on amber and on dark surfaces:** the focus colour must reach 3:1 against the page, the surface and the amber fill in both themes. Test in Task 1 (contrast pairs).
5. **Large browser default font** (user sets 20px base): no clipped labels or overlapping controls. Test in Task 7 (overflow check at 20px root font).

---

### Task 1: Theme foundation — tokens, fonts, theme-init and contrast test

**Files:**
- Modify: `frontend/src/ui/tokens.css`, `frontend/src/ui/global.css`, `frontend/index.html`
- Create:
  - `frontend/public/theme-init.js`
  - `frontend/src/ui/fonts/` (`IBMPlexMono-Regular.woff2`, `IBMPlexMono-Bold.woff2`, `VT323-Regular.woff2`, `OFL-IBMPlexMono.txt`, `OFL-VT323.txt`)
  - `frontend/src/ui/fonts.css`
  - `frontend/src/ui/contrast.ts`
- Test: `frontend/src/ui/tokens.test.ts`, `frontend/src/ui/themeInit.test.ts`

**Interfaces:**
- Produces:
  - **Existing tokens, new values.** Both themes define every one: `--color-bg`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-border` (the ink outline), `--color-primary` (amber), `--color-primary-text`, `--color-danger`, `--color-danger-text`, `--color-danger-bg`, `--color-info-bg`, `--color-focus`, `--color-backdrop`.
  - **New tokens:** `--font-mono`, `--font-pixel`, `--font-size-title`, `--color-band` (table header), `--color-menu-bg`, `--color-menu-text`, `--radius-box`, `--radius-control`, `--shadow-hard`, `--shadow-hard-sm`. `--border-width` becomes `2px`, and `--font-body` points at `--font-mono`.
  - `contrastRatio(a: string, b: string): number` in `src/ui/contrast.ts`, the WCAG relative-luminance formula, for `#rrggbb`.
  - `public/theme-init.js`: sets `document.documentElement.dataset.theme` to the stored `gf-theme` when it is `light` or `dark`. Otherwise it sets nothing. It never throws.

- [ ] **Step 1: Write the failing tests**

`tokens.test.ts`:
- **Parsing.** Read `tokens.css` with `node:fs` and parse three blocks into maps:
  - `:root` (light)
  - `:root[data-theme="dark"]`
  - the dark block inside `@media (prefers-color-scheme: dark)`
- `test("the media-query dark block and the data-theme dark block are identical")`.
- `test.each(PAIRS)("%s meets %f:1 in light and dark")`. Assert `contrastRatio(theme[fg], theme[bg]) >= min` in both themes. PAIRS:
  - ≥ 4.5: `text/bg`, `text/surface`, `text-muted/surface`, `text-muted/bg`, `primary-text/primary`, `danger/surface`, `danger-text/danger`, `danger/danger-bg`, `text/band`, `menu-text/menu-bg`, `text/info-bg`.
  - ≥ 3: `border/surface`, `border/bg`, `focus/bg`, `focus/surface`, `focus/primary`, `focus/menu-bg`.
- `test("light theme never uses amber as text")`. Assert no light token ending in `-text` equals the light `--color-primary` value.
- `test("contrastRatio matches known values")`. Assert `contrastRatio("#000000", "#ffffff")` ≈ 21 and `contrastRatio("#2b2118", "#fffaf0")` ≈ 15.1 (±0.1).

`themeInit.test.ts`. Run the file's source with `new Function` against the jsdom globals:
- `stored "dark" → data-theme="dark"`.
- `stored "light" → data-theme="light"`.
- `nothing stored → no data-theme attribute`.
- `stored "purple" → no data-theme attribute`.
- `localStorage.getItem throws → no throw and no attribute`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/ui/tokens.test.ts src/ui/themeInit.test.ts`
Expected: FAIL. `contrast.ts`, `theme-init.js` and the dark blocks don't exist yet.

- [ ] **Step 3: Implement**
- **`contrast.ts`:** `contrastRatio(a, b)` per WCAG 2.x. Linearise with the 0.03928 threshold, then `(L1 + 0.05) / (L2 + 0.05)`.
- **`tokens.css`:**
  - Light values on `:root`.
  - The same dark values in `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` and in `:root[data-theme="dark"] { … }`.
  - Starting values come from spec §2.1. The focus colour is the builder's choice, constrained by the test.
  - Add `color-scheme: light` and `color-scheme: dark` in the matching blocks, so native controls and scrollbars follow the theme.
- **`fonts.css`:**
  - `@font-face` rules with `font-display: swap`, pointing at the `./fonts/*.woff2` files. Vite emits them as same-origin assets because `assetsInlineLimit: 0`.
  - `global.css` imports `fonts.css`.
- **`global.css`:**
  - Body uses `--font-mono`.
  - Base styles for `p`, `a`, `strong`, `ul` inside `main` use tokens. Links are underlined (colour is not the only signal) and have a visible `:focus-visible` ring.
  - `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }`.
- **`theme-init.js`:** plain ES5-safe JS, no imports. It is a `try { … } catch {}` around `localStorage.getItem("gf-theme")`.
- **`index.html`:** add `<script src="/theme-init.js"></script>` in `<head>`, before any stylesheet link Vite injects. It is a classic, non-module script, so Vite copies it from `public/` untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/ui && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Check the build under the CSP rules**

Run:
```
cd frontend && npm run build \
  && grep -q '<script src="/theme-init.js"></script>' dist/index.html \
  && test -f dist/theme-init.js \
  && ! grep -rqE 'https?://' dist/index.html \
  && ls dist/assets/*.woff2
```
Expected: three `.woff2` files listed, nothing else printed. Then run `npm test`. Expected: the whole suite passes. Restyled tokens break no behaviour test.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/ui frontend/public/theme-init.js frontend/index.html
git commit -m "feat: add the retro light and dark themes, self-hosted fonts and a contrast test"
```

---

### Task 2: Side menu with the theme switch

**Files:**
- Modify: `frontend/src/ui/Nav.tsx`, `frontend/src/ui/Nav.module.css`, `frontend/src/ui/index.ts`, `frontend/src/app/routes.tsx` (AppShell layout)
- Create:
  - `frontend/src/ui/theme.ts`
  - `frontend/src/ui/ThemeSwitch.tsx`, `frontend/src/ui/ThemeSwitch.module.css`
  - `frontend/src/ui/AppFrame.tsx`, `frontend/src/ui/AppFrame.module.css`
- Test: `frontend/src/ui/ThemeSwitch.test.tsx`

**Interfaces:**
- Consumes: the tokens from Task 1.
- Produces:
  - `type ThemeChoice = "auto" | "light" | "dark"`.
  - `readThemeChoice(): ThemeChoice`, `writeThemeChoice(choice: ThemeChoice): void` and `applyThemeChoice(choice: ThemeChoice): void` in `ui/theme.ts`. `applyThemeChoice` sets or removes `data-theme`. Storage access is wrapped. `"auto"` removes the key.
  - `ThemeSwitch()`: one button that cycles `auto → light → dark → auto`.
    - Visible text: `Tema: Automático` / `Tema: Claro` / `Tema: Escuro`.
    - Accessible name: `Mudar tema para Claro` / `Escuro` / `Automático (segue o Mac)`. The name describes the next state.
  - `AppFrame({ nav, children })`: the shell layout.
    - Viewport ≥ 900 CSS px: the side menu (`nav`) on the left, content beside it.
    - Viewport < 900 CSS px: `nav` becomes a compact wrapping top bar. No drawer, no toggle.
  - `Nav` keeps `links` and `<nav aria-label="Principal">`. It renders the brand `▣ ESTÚDIO` in the pixel font, the links in order, and `ThemeSwitch` at the bottom.

- [ ] **Step 1: Write the failing tests** (`ThemeSwitch.test.tsx`)
- `starts on Automático with nothing stored and sets no data-theme`.
- `each press cycles Automático → Claro → Escuro → Automático`. Assert the visible text, `document.documentElement.dataset.theme` (`undefined` → `"light"` → `"dark"` → `undefined`) and `localStorage.getItem("gf-theme")` (`null` → `"light"` → `"dark"` → `null`).
- `the accessible name describes the next choice`. For example, starting from auto it is `getByRole("button", { name: "Mudar tema para Claro" })`.
- `a stored "dark" choice is shown as Tema: Escuro`.
- `blocked storage still switches the theme for the session`. With `vi.spyOn(Storage.prototype, "setItem")` and `getItem` throwing, the presses still update `data-theme` and nothing throws.
- **Unchanged:** the existing `src/app/App.test.tsx` nav tests (`navigation` named "Principal", link "Clientes") must pass unedited.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/ui/ThemeSwitch.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the theme helpers, `ThemeSwitch`, `AppFrame` and the new `Nav`; use `AppFrame` in `routes.tsx`'s `AppShell`**
- The 900px switch is a CSS media query in `AppFrame.module.css`, not JS.
- The menu is not `position: fixed` over content, so focus is never obscured (2.4.11).
- Links and the switch are ≥ 24px tall.
- The active link has the amber fill plus `aria-current="page"` (NavLink already sets it) and bold text, so colour is not the only signal.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/ui src/app && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/ui frontend/src/app/routes.tsx
git commit -m "feat: move navigation to a retro side menu with a light/dark/auto theme switch"
```

---

### Task 3: Restyle the form controls

**Files:**
- Modify: `frontend/src/ui/{Button,TextInput,Select,Field,Checkbox,FormSection}.tsx` and their `.module.css`
- Test: `frontend/src/ui/TextInput.test.tsx` (create), `frontend/src/ui/Field.test.tsx` (extend)

**Interfaces:**
- Consumes: the tokens from Task 1.
- Produces:
  - Unchanged component props.
  - `TextInput` with `adornment`: the adornment is rendered **inside** the input's outlined box, and it is announced through the input's description.
    - `TextInput` adds an id'd, visually hidden span with the adornment's spoken form.
    - For `"R$"` the spoken form is `em reais`.
    - That span's id is appended to the `aria-describedby` it receives from `Field`, keeping Field's hint and error ids.
    - The visible "R$" stays `aria-hidden`.
  - `FormSection`: the legend sits inside the frame as its first row (styled as a heading band), not on the border.

- [ ] **Step 1: Write the failing tests**
- `TextInput.test.tsx`:
  - `a money input keeps its label and is described as em reais`. In `<Field label="Valor do item 1">{(c) => <TextInput {...c} adornment="R$" />}</Field>`, `getByLabelText("Valor do item 1")` has an accessible description containing `em reais`.
  - `a field with an error is described by both the adornment and the error`. With `error="valor inválido"`, the description contains both.
  - `without an adornment nothing extra is described`.
- `Field.test.tsx`: the existing assertions stay unchanged.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/ui/TextInput.test.tsx`
Expected: FAIL (no `em reais` description).

- [ ] **Step 3: Restyle and implement**
- **Button variants:**
  - `primary`: amber fill, ink text, 2px outline, `--shadow-hard-sm`.
  - `secondary`: surface fill, outlined.
  - `danger`: danger fill.
  - `ghost`: text-only, but with a visible underline or outline on hover and focus.
  - Each variant has a disabled state.
- **Sizing:** min target 24×24, practical min height about 2.25rem. Radius `--radius-control`.
- **Inputs and selects:** 2px ink outline, surface fill, `--radius-control`, error state with a thicker danger outline plus the error text.
- **Checkbox:** ≥ 24px hit area.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test && npm run lint && npm run typecheck`
Expected: PASS, including every existing contract, client and service form test unedited. They query "Valor do item N" by label, which this task keeps.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/ui
git commit -m "feat: restyle buttons, inputs and form sections and put R$ inside money inputs"
```

---

### Task 4: Restyle containers and feedback, and add text primitives

**Files:**
- Modify: `frontend/src/ui/{Table,Banner,Dialog,ConfirmDialog,Toast,PageLayout}.tsx` and their `.module.css`, `frontend/src/ui/index.ts`
- Create:
  - `frontend/src/ui/Text.tsx`, `frontend/src/ui/Text.module.css` (`Loading`, `EmptyState`, `TextLink`, `Hint`)
  - `frontend/src/ui/SegmentedControl.tsx`, `frontend/src/ui/SegmentedControl.module.css`
- Test: `frontend/src/ui/ConfirmDialog.test.tsx`, `frontend/src/ui/Toast.test.tsx` (extend), `frontend/src/ui/Text.test.tsx` (create), `frontend/src/ui/PageLayout.test.tsx` (create)

**Interfaces:**
- Produces:
  - `PageLayout` (props unchanged): the `<h1>`'s accessible name stays exactly `title`. The decorative `> ` and `_` are `aria-hidden` spans, and the title uses `--font-pixel` at `--font-size-title`.
  - `Loading({ children = "Carregando…" })`: `<p role="status">`.
  - `EmptyState({ children, action? })`.
  - `TextLink(props: LinkProps)`: wraps React Router's `Link`.
  - `Hint({ id, children })`: muted helper text with an `id` so a control can reference it.
  - `SegmentedControl<T extends string>({ label, options, value, onChange })`: same props as the agenda's `Choice`. It renders `role="group"` with `aria-label`, and buttons with `aria-pressed`. The selected option is shown by fill, weight and an indicator, not colour alone.
  - `ConfirmDialog`: Escape (the dialog's `cancel` event) does nothing while `busy`.
  - `Toast`: auto-dismiss timers pause while the toast is hovered or has focus, and resume after.

- [ ] **Step 1: Write the failing tests**
- `ConfirmDialog.test.tsx`: `Escape while busy keeps the dialog open`. Fire a cancelable `cancel` event on the dialog with `busy` and assert `onCancel` was not called. Then `Escape when not busy cancels`.
- `Toast.test.tsx`: `a toast with an action does not close while hovered`. With fake timers, hover the toast, advance 11 s, and assert it is still shown. Unhover, advance 10 s, and assert it is gone. Same for focus on its action button.
- `PageLayout.test.tsx`: `the heading's name is the plain title`. `getByRole("heading", { level: 1, name: "Contratos" })` exists, and `>` and `_` are not in its accessible name.
- `Text.test.tsx`:
  - `Loading is a status with the default text`.
  - `Hint renders its id so a button can be described by it`. A `<Button aria-describedby="h">` next to `<Hint id="h">Salve…</Hint>` has that description.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/ui`
Expected: FAIL for the new tests.

- [ ] **Step 3: Implement and restyle**
- **Table:** 2px outline, `--radius-box`, `--color-band` header, dashed row separators. Cells wrap long text (`overflow-wrap: anywhere`); no cell forces the table wider than its container. On narrow widths the table scrolls inside its own box (`overflow-x: auto` wrapper) rather than the page.
- **Dialog:** outlined box with `--shadow-hard`, focus ring visible.
- **Banner, Toast:** outlined boxes in the matching tone.
- **Exports:** export the new primitives from `ui/index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test && npm run lint && npm run typecheck`
Expected: PASS, with every existing feature test unedited. Page headings keep their plain names.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/ui
git commit -m "feat: restyle tables, dialogs, banners, toasts and titles and add retro text primitives"
```

---

### Task 5: Features adopt the primitives and fix form alignment

**Files:**
- Modify:
  - `frontend/src/features/contracts/{ContractListPage,EditContract,ContractForm,PreweddingDialog}.tsx`
  - `frontend/src/features/contracts/sections/{PaymentSection,PreweddingSection}.tsx`
  - `frontend/src/features/contracts/ContractForm.module.css`
  - `frontend/src/features/clients/ClientListPage.tsx`
  - `frontend/src/features/services/ServiceListPage.tsx`
  - `frontend/src/app/NotFoundPage.tsx`
  - the matching `.module.css` files (layout only)
- Test: `frontend/src/features/contracts/ContractFormPage.edit.test.tsx` (extend)

**Interfaces:**
- Consumes: `Loading`, `EmptyState`, `TextLink`, `Hint` (Task 4); restyled controls (Task 3).
- Produces: no new interfaces. Every "Carregando…", empty-state text, in-app link and helper text in features goes through the primitives. Plain explanatory `<p>` inside dialogs and banners may stay; `global.css` styles them.

- [ ] **Step 1: Write the failing test**

In `ContractFormPage.edit.test.tsx`: `the Baixar PDF button is described by the save-first hint while there are changes`. After typing in "Local do evento", `getByRole("button", { name: "Baixar PDF" })` has the accessible description `Salve as alterações antes de baixar o PDF.`

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/features/contracts/ContractFormPage.edit.test.tsx`
Expected: FAIL (no description).

- [ ] **Step 3: Implement**
- **PDF hint:** `EditContract` renders `<Hint id={…}>` and passes `aria-describedby` to the Baixar PDF button only while the hint is shown.
- **Primitives:** replace the raw elements the 2026-10-17 grep listed (`<p>Carregando…</p>`, empty `<p>`, `<Link>` in PaymentSection, EditContract and NotFoundPage) with the primitives.
- **Layout CSS (spec §4.2–4.5):**
  - The payment row is a grid with service, value and remove aligned on one baseline (`align-items: end`). "Remover" uses the `secondary` button variant and is the same height as the inputs.
  - Fields sit on one grid, with single short fields placed so no ragged half-rows remain.
  - The "Total" line is a clear summary row.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test && npm run lint && npm run typecheck`
Expected: PASS, with all existing feature tests unedited.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/features frontend/src/app/NotFoundPage.tsx
git commit -m "feat: use the retro text primitives in every screen and align the contract form"
```

---

### Task 6: Agenda — segmented switches, entry list and calendar overflow

**Files:**
- Modify:
  - `frontend/src/features/agenda/Choice.tsx` (becomes a thin re-export of, or usage of, `SegmentedControl`)
  - `frontend/src/features/agenda/{EntryList,AgendaCalendar}.tsx`
  - `frontend/src/features/agenda/{Agenda,AgendaCalendar}.module.css`
- Test: `frontend/src/features/agenda/AgendaPage.test.tsx` (extend)

**Interfaces:**
- Consumes: `SegmentedControl` (Task 4).
- Produces: unchanged agenda behaviour. The calendar chip keeps `aria-label={entryLabel(entry)}` and `title={entryLabel(entry)}`.

- [ ] **Step 1: Write the failing test**

`AgendaPage.test.tsx`: `a long couple name keeps its full label as the chip's name`. Use an entry whose groom and bride names are 40+ characters each. The chip link's accessible name equals `entryLabel(entry)` and has a `title` with the same text. The visible truncation is checked in Task 7's browser test, because jsdom has no layout.

This may already pass, since the attributes exist today. If it does, keep it as a guard and note it in the report.

- [ ] **Step 2: Run it**

Run: `cd frontend && npx vitest run src/features/agenda`
Expected: PASS or FAIL, as noted above.

- [ ] **Step 3: Implement**
- **Chip:** `display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. The `li`/`ul` and the cell have `min-width: 0`, and the cell clips (`overflow: hidden`) so nothing escapes the day box. Day cells keep a uniform height.
- **Entry list:** rows become outlined boxes. Long names and venues wrap.
- **Segmented control:** Lista/Calendário and 30/90 dias use it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/features/agenda
git commit -m "fix: keep long names inside calendar days and restyle the agenda"
```

---

### Task 7: Browser checks — accessibility, overflow and theme

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json` (add `@axe-core/playwright` as a dev dependency), `README.md` (one paragraph on the theme switch)
- Create:
  - `frontend/e2e/a11y.spec.ts`
  - `frontend/e2e/layout.spec.ts`
  - `frontend/e2e/theme.spec.ts`
  - an e2e helper in `frontend/e2e/helpers.ts`: `createLongNamedContract(page): Promise<{ id: string; label: string }>`, using names of 40+ characters and a 60-character venue

**Interfaces:**
- Consumes: everything above. `createContract`, `freshCouple` and the console-error guard in `e2e/helpers.ts`.

- [ ] **Step 1: Write the browser tests**
- `a11y.spec.ts`: for each path (`/agenda` list and calendar, `/contratos`, `/contratos/novo`, `/contratos/<id>`, `/clientes`, `/servicos`, the anonymise dialog, the pre-wedding dialog), in both `colorScheme: "light"` and `"dark"`, and at viewport 1280×900 and 400×800, run `new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze()`. Expect `violations` to equal `[]`.
- `layout.spec.ts`:
  - Seed the data:
    - one long-named contract dated in the current month, so it shows on the calendar;
    - a long-named client (created by that contract);
    - a long-named service.
  - At widths 400, 800, 1024, 1280 and 1440, on every screen:
    - Assert no element inside `main` has a bounding box extending past `main`'s box (tolerance 1px).
    - Assert `document.documentElement.scrollWidth <= innerWidth`.
  - On `/agenda` calendar, assert the chip's box stays inside its day cell's box.
  - Repeat at 1280 with a 20px root font, set through `page.evaluate(() => { document.documentElement.style.fontSize = "20px"; })`. That is CSSOM, which the CSP allows. Don't use `addStyleTag`: it injects an inline `<style>` the CSP blocks, and the console guard would fail the test.
- `theme.spec.ts`:
  - `first load follows the Mac`: `page.emulateMedia({ colorScheme: "dark" })`. The `body` background equals the dark `--color-bg`, and `data-theme` is absent.
  - `Automático follows a live change`: after load, emulate `light`. The background switches without a reload.
  - `the switch survives a reload`: press the switch to Escuro, then reload. The `data-theme` attribute is `"dark"` at `domcontentloaded` (read immediately after `page.reload({ waitUntil: "domcontentloaded" })`). The background is dark under emulated light.
  - Every test keeps the existing console/CSP error guard.

- [ ] **Step 2: Run them**

Run (repository root): `make e2e`
Expected: all specs PASS, old and new. A failure is fixed in the owning `ui/` component or feature CSS, never by disabling an axe rule or loosening a tolerance. Record any fix in the report.

- [ ] **Step 3: README**

Add to "Run": the interface follows the Mac's light/dark setting, and the "Tema" button in the menu cycles Automático, Claro and Escuro, with the choice remembered in this browser.

- [ ] **Step 4: Full checks**

Run: `make check && make e2e`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/package.json frontend/package-lock.json frontend/e2e README.md
git commit -m "test: check accessibility, overflow and theme switching in the browser"
```
