# Retro Redesign — Design

Date: 2026-10-17
Status: approved
Branch: `feat/retro-redesign` (based on `main`)

## 1. Purpose

Pedro doesn't need new features right now. He needs the tool to look better.
Today three things bother him: the colours, how square everything is, and
parts of the interface that leave their margins. The worst case is couple
names spilling out of the day boxes in the agenda calendar.

This sub-project replaces the visual design of every screen. It changes no
behaviour. The frontend was built for exactly this: every visual value lives in
`frontend/src/ui/` and `ui/tokens.css`, and features compose `ui/` components
(see `2026-10-14-contract-frontend-design.md` §2).

Pedro asked that the result be functional and secure as well as pretty. Every
change must follow recognised UI guidelines and best practices (section 5).

### Success criteria

- Every screen uses the new look, in a light theme and a dark theme.
- On first open the theme follows the Mac's light/dark setting. A switch in the
  interface overrides it, and the choice is remembered.
- No text, chip or control leaves its container at window widths from 800px to
  1440px. That includes long couple names in the agenda calendar.
- The interface meets WCAG 2.2 level AA (section 5.1), checked automatically.
- Behaviour is unchanged: every existing unit, component and end-to-end test
  still passes, with test changes limited to what section 8 lists.
- The security model is unchanged: the CSP stays `default-src 'self'`, nothing
  loads from another origin, and no inline script or style is added.

### Non-goals

- New features, screens or fields.
- Changes to the contract PDF. It keeps its own print stylesheet.
- A third theme. The sage-and-tangerine palette (mockup option 2) is saved for
  future work. The theme mechanism must make adding it a tokens-only change.
- Phone and tablet layouts below 768px. The server is loopback only, as in the
  frontend spec.

### Anti-goals (a failure even if it "works")

- Retro styling that makes text harder to read, forms slower to fill, or focus
  harder to see.
- Any weakening of the CSP, or any external font, script or image.
- Any behaviour change slipping in with the restyle.

## 2. The look (Pedro's choices)

Pedro chose from mockups (option B, "retro computer", with touches of option C):

- **Typography:** typewriter-style (monospace) text everywhere, as in mockup
  B1, including names, fields, table cells and labels. Page titles use a pixel
  font in the "> CONTRATOS_" style.
- **Shapes:** rounded boxes, not square ones. Bold outlines (about 2px) and
  hard, offset drop shadows (no blur), e.g. `4px 4px 0`.
- **Dates:** plain text (`14/03/2027`). No pill or tag around dates.
- **Navigation:** a side menu on the left, replacing today's top bar. It lists
  Agenda, Contratos, Clientes and Serviços, in that order. The current page is
  highlighted with the accent colour. The menu has room for future screens.
  *My call:* when the viewport is narrower than about 900 CSS px, the side menu
  becomes a compact bar across the top. That happens on a small window, or at
  200% zoom on a laptop. The bar holds the same links and the theme switch, and
  wraps if needed. It needs no drawer or toggle, and the links keep the same
  names and order. This keeps 200% zoom and reflow working (1.4.4, 1.4.10)
  without a menu eating the screen.
- **Light theme:** mockup palette 1, "cream and amber": warm paper background,
  dark brown ink, amber highlights.
- **Dark theme:** mockup palette 3, "amber screen": near-black warm background,
  cream text, amber highlights, like an old monitor.

The approved mockups are committed next to this spec in
`docs/superpowers/specs/assets/2026-10-17-retro-redesign/`:

- `mockup-retro-blend.html`: Pedro chose B1's writing with B3's side menu.
- `mockup-palette.html`: Pedro chose options 1 (light) and 3 (dark).

The mockups load fonts from Google for preview only. The app must not (5.4).

They show:

- The page title as `> CONTRATOS_` in the pixel font, about 26px in the mockup.
- Cards with a 2px ink outline, a radius of about 14px and a hard `4px 4px 0`
  shadow.
- Buttons and inputs with a radius of about 8–10px and a `2px 2px 0` shadow on
  the primary button.
- A table header band, and dashed row separators.
- A dark side menu with the accent-filled active item and an offset shadow.

### 2.1 Palette starting points

These come from the mockups. The builder may adjust them within the contrast
rules in 5.1. The ratios below were measured.

| Role | Light (1) | Dark (3) | Measured contrast |
|---|---|---|---|
| Page background | `#f3ead7` | `#1d1a16` | |
| Surface (cards, inputs) | `#fffaf0` | `#2a251e` | |
| Text / ink, outlines | `#2b2118` | `#f3e6c4` | 15.1 light, 12.3 dark |
| Muted text | `#6b5e4a` | `#a8987a` | 6.1 light, 5.4 dark |
| Accent fill (primary button, active menu item) | `#ffb000` with ink text | `#ffb000` with `#1d1a16` text | 8.6 light, 9.5 dark |
| Accent as text | not allowed (1.8:1) | `#ffb000` on surface | 8.3 dark |
| Danger | `#a33a2c` | builder picks; must pass 4.5:1 | 6.3 light |
| Table header band | `#e8dcc0` | `#3a3329` | |

**Rule:** in the light theme amber is only ever a fill behind dark text, never
text or a thin line on cream.

## 3. Theme switching (Pedro's choices plus my calls)

- **Pedro:** the first look follows the Mac setting (`prefers-color-scheme`),
  and the interface has a switch.
- **My call:** the switch sits at the bottom of the side menu. It cycles through
  three states: *Automático (segue o Mac)*, *Claro*, *Escuro*. "Automático" is
  the default and keeps following the Mac live. Its accessible name says what
  pressing it will do. Three states (not two) mean Pedro can always return to
  following the Mac.
- **My call:** the choice is remembered in `localStorage` under one key,
  `gf-theme`, with value `light`, `dark`, or absent (= automatic). That is the
  only thing stored. It is a display preference, not personal data, so the
  "no personal data in storage" rule holds. Reads and writes are wrapped so that
  blocked storage falls back to automatic without an error.
- **No flash of the wrong theme:** the usual fix is an inline script, which the
  CSP forbids. Instead a tiny same-origin script (`/theme-init.js`, plain JS,
  no imports) is loaded synchronously in `<head>` before the stylesheet. It sets
  `data-theme` on `<html>` from storage. With no stored choice it sets nothing
  and the CSS falls back to `prefers-color-scheme`. Vite must copy this file
  as-is (`public/`), not bundle or inline it.
- **Tokens:** `tokens.css` defines light values on `:root`, dark values under
  `@media (prefers-color-scheme: dark)` scoped to `:root:not([data-theme="light"])`,
  and again under `:root[data-theme="dark"]`. Adding the sage theme later means
  one more `data-theme` block.

## 4. Layout fixes

Recon on 2026-10-17 measured every screen at 800, 1024, 1280 and 1440px. No
element left the page box. The problems Pedro sees are alignment and the
calendar:

1. **Agenda calendar:** a couple's name that doesn't fit its day box is cut
   with "…" and stays inside the box. Day boxes keep a uniform size.
   *My call (Pedro deferred):* the full label appears on pointer hover (as
   today, via `title`). It is also each chip's accessible name, so keyboard and
   screen-reader users get it too. The name is exactly today's full entry label,
   the same text as the `title`, with nothing added. The day comes from the
   calendar cell it sits in, so existing queries by text or name keep working.
2. **Money inputs:** "R$" sits inside the input's border, not floating beside
   it, so money inputs line up with every other field.
3. **Payment rows:** the service, value and remove controls share one baseline.
   "Remover" is a proper button aligned with the inputs.
4. **Section titles** ("Casal", "Evento", …) sit inside their frame, not on its
   border line.
5. **Form grid:** fields align to one grid. Single short fields (photographer
   count, PIX discount, signing date) don't leave ragged half-rows. The builder
   picks the grid.
6. **Agenda switches** ("Lista/Calendário", "30/90 dias") read as one
   segmented control with clear spacing and a visible selected state.
7. **Page width:** content sits beside the side menu with consistent gutters.
   No screen looks flush-left with a wide empty right side.

## 5. Guidelines every change must follow

### 5.1 Accessibility: WCAG 2.2, level AA

- **Contrast:** at least 4.5:1 for text, 3:1 for large text (≥ 24px, or ≥ 18.66px
  bold), and 3:1 for meaningful non-text parts. Meaningful non-text parts are
  input borders, outlines that define a control, focus rings and checkboxes.
  Purely decorative dividers are exempt. This holds in both themes.
- **Focus:** every interactive element has a visible focus indicator with at
  least 3:1 contrast against its surroundings (2.4.7, aiming at 2.4.13). Focus
  is never hidden behind the side menu, toasts or other fixed content (2.4.11).
- **Target size:** clickable targets are at least 24×24 CSS px (2.5.8). That
  includes table action buttons, item remove buttons, menu items, the theme
  switch and calendar chips.
- **Resize and reflow:** text sizes in `rem`, so the browser's font setting is
  respected. Every screen works at 200% zoom without losing content or
  functions (1.4.4). Text-spacing overrides don't clip text (1.4.12).
- **Colour is never the only signal:** the active menu item, selected segmented
  option, deleted rows and errors also differ by text, weight, shape or icon.
- **Motion:** any transition respects `prefers-reduced-motion: reduce` (turned
  off or reduced). There is no blinking cursor animation on titles.
- **Timing (2.2.1):** toasts that carry an action (Desfazer) pause while
  hovered or focused.
- **Language:** `lang="pt-BR"` stays on `<html>`.

### 5.2 Readability of the retro type

- Body monospace at least 16px (1rem), line height about 1.5. The font must
  clearly tell apart `1 l I` and `0 O`.
- The pixel font is for page titles only, at 1.75rem or larger. It never
  carries body text, labels, numbers in tables, or error messages.
- Long text (hints, errors, dialog explanations) keeps a comfortable line
  length (about 70 characters maximum).

### 5.3 Usability (Nielsen's heuristics)

- **Visibility of system status:** loading, saving (busy buttons), empty states
  and errors are all styled. No state looks unstyled.
- **Consistency:** one button hierarchy everywhere. Primary is the amber fill;
  secondary is outlined; danger is red; ghost is text-only. The same component
  always looks the same.
- **Error prevention and recovery:** destructive actions keep their
  confirmations. Error text sits next to the field it concerns and is
  announced, as today.
- **Aesthetic and minimalist design:** retro is the flavour, not noise. No
  decorative ASCII art inside data. One accent colour.

### 5.4 Security

- The CSP stays `default-src 'self'` unchanged. No `unsafe-inline`, no external
  hosts.
- Fonts are self-hosted WOFF2 files in the build. Each font's licence (OFL)
  ships alongside it. Font files come from the official `google/fonts`
  repository or the foundry's release, not from third-party mirrors.
- No new runtime dependency other than font files. The theme script is
  hand-written, a few lines long, and has no imports.
- `localStorage` holds only the theme preference (section 3).
- Vite settings that keep the CSP intact stay as they are:
  `assetsInlineLimit: 0` and no module-preload polyfill.

## 6. Scope

Every screen and shared element:

- **Side menu:** replaces the top bar, and holds the theme switch.
- **Agenda:** list and calendar.
- **Contratos:** list, new contract form, edit contract, pre-wedding dialog,
  deleted-contract state, conflict and unsaved-changes dialogs.
- **Clientes:** list, anonymise dialog.
- **Serviços:** list, service dialog.
- **Shared elements:** toasts, banners, the not-found page, and the loading,
  empty and error states.

The following items were deferred to "the designer pass" in the frontend
review. They are now in scope because they are visual:

- The "Salve as alterações antes de baixar o PDF" hint becomes a `ui/` hint,
  linked to its button with `aria-describedby`.
- Raw `Link`, `<p>` and `<strong>` elements rendered by features ("Carregando…",
  the not-found link, the edit page) go through small `ui/` components, so the
  look lives only in `ui/`.
- The "R$" adornment is announced to screen readers through the field's
  accessible **description**, not its label, so labels such as "Valor do item 1"
  and every test that queries them stay unchanged. The "R$" stays visible.
- Escape no longer dismisses a `ConfirmDialog` while it is busy.

## 7. Constraints for the build

- **Layering:** features stay layout-only. Every visual value is a token in
  `tokens.css` (`frontend-design` §2 rules). The one existing exception, a token
  font size in the contract list's `.tag`, may stay or move into `ui/`.
- **Component props:** `ui/` component names and props stay stable unless a
  change lands in the same commit as all its callers.
- **Tests:** tests keep querying by role, label and text. Never by class or
  test id.

## 8. Testing

- **Existing suites stay green unchanged.** This covers backend pytest, frontend
  Vitest and Playwright. The one allowed change: tests that click the top-bar
  nav links (e.g. "Clientes") keep working against the side menu. Link names
  don't change, so ideally no edit is needed.
- **New tests for the §6 behaviour changes are allowed and expected:**
  - Escape while a `ConfirmDialog` is busy leaves it open.
  - The PDF hint is the "Baixar PDF" button's description.
  - Money inputs are described with "R$".
  Existing tests are not edited for these.
- **Narrow layout:** at about 400 CSS px wide (an 800px window at 200% zoom),
  the overflow and axe checks also run, with the compact top bar.
- **New component tests** for the theme switch:
  - With nothing stored, it follows the system setting.
  - Each press moves Automático → Claro → Escuro → Automático, sets
    `data-theme` and stores the choice.
  - Blocked storage doesn't break it.
  - The accessible name describes the next state.
- **New unit test for contrast:** parse `tokens.css` for both themes and assert
  the ratio of every text/background and meaningful non-text pair listed by the
  builder (at least the pairs in 2.1, plus input border, focus ring and danger
  on both surfaces). A palette change that breaks AA then fails CI.
- **New end-to-end checks (Playwright):**
  - An automated accessibility scan (axe-core, WCAG 2.2 AA rules) of every
    screen in both themes, with zero violations. `@axe-core/playwright` is the
    only new dev dependency this spec allows.
  - The overflow check from the 2026-10-17 recon, kept as a test. At 800, 1024,
    1280 and 1440px, no element inside `<main>` extends past its container.
    The calendar must be shown with an event whose couple names are very long
    (40+ characters).
  - The theme follows an emulated `prefers-color-scheme` on first load, and the
    switch's choice survives a reload, with no console errors (the existing
    console/CSP guard stays on).
- The built app is checked under the real CSP. The existing end-to-end setup
  already does this.

## 9. Left to the builder

- The exact monospace and pixel fonts. They must be OFL-licensed and must meet
  5.2. The mockups used Space Mono and VT323. The builder should check Space
  Mono's legibility at 16px against alternatives such as IBM Plex Mono or
  JetBrains Mono, and pick the one that best keeps the typewriter feel while
  meeting 5.2.
- The spacing scale, radii, shadow offsets and outline weights, within the
  shapes described in section 2.
- Exact hex values, within the roles in 2.1 and the contrast rules in 5.1.
- The form grid, the segmented-control styling, and the theme switch's icon or
  label.
- How each existing `ui/` component is restyled internally.
