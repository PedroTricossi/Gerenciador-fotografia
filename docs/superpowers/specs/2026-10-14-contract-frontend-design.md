# Contract Frontend — Design

Date: 2026-10-14
Status: awaiting review
Replaces: section 7 of `2026-10-13-contract-generation-design.md`

## 1. Purpose

The contract generation backend is complete. Pedro still has no screen to use
it: contracts can only be created with `curl`, and since the `/docs` pages
were removed, so can client export and anonymisation. This sub-project adds
the web interface he uses every day on his Mac.

The platform will grow (client board, events calendar, instalment tracking),
and a later sub-project will hand the visual design to a designer agent. The
frontend is therefore built so that its look can be replaced without touching
its behaviour.

### Success criteria

- Pedro creates a contract from the form and receives the PDF, with no `curl`.
- He lists, edits, deletes and restores contracts from the browser.
- He exports a client's data and anonymises a client from the browser.
- Every validation error from the API appears on the input it concerns.
- The built app runs under the backend's existing Content Security Policy
  with no violations.
- A redesign can change every colour, font, spacing and component look by
  editing only `frontend/src/ui/`, without changing feature code or tests.

### Out of scope

- Phone and tablet use. The server listens on loopback only; the layout
  targets a desktop browser window and does not need to work below about
  768px.
- A screen for the audit trail. It stays API-only.
- A client edit screen. Corrections go through the contract form;
  `PATCH /clients/{id}` stays API-only.
- Search and filtering in lists.
- The final visual design. This version uses a plain, tidy look built on
  design tokens.
- Login, offline use, internationalisation. Interface text is Portuguese only.

## 2. Architecture

```
frontend/
  package.json, package-lock.json, .nvmrc (Node 22)
  vite.config.ts            dev proxy for /api, keeps the browser's Host
  playwright.config.ts
  e2e/                      Playwright tests against the built app
  src/
    main.tsx
    app/                    router, query client, app shell and nav
    api/
      schema.d.ts           generated from openapi.json, committed
      client.ts             openapi-fetch client, problem+json handling
      contracts.ts          query and mutation hooks for contracts
      clients.ts            query and mutation hooks for clients
      download.ts           blob download with the server's file name
    domain/                 pure functions, no React
      cpf.ts                check digits, formatting
      money.ts              BRL parse and format, cents
      contract.ts           totalCents, discount rule
      patch.ts              build a PATCH body from changed sections
      problems.ts           map a 422 errors list to form field paths
    ui/
      tokens.css            every colour, font, size, spacing and radius
      Button, Field, TextInput, MoneyInput, DateInput, TimeInput,
      NumberInput, Table, Dialog, ConfirmDialog, Toast, PageLayout, Nav
    features/
      contracts/
        ContractListPage.tsx
        ContractFormPage.tsx
        useContractForm.ts  form state, validation, submit, conflict handling
        sections/           Casal, Evento, Fotografos, Pagamento, Assinatura
      clients/
        ClientListPage.tsx
```

Stack: React, TypeScript strict, Vite, React Router, TanStack Query, React
Hook Form, CSS Modules, `openapi-typescript`, `openapi-fetch`. Tests: Vitest,
Testing Library, MSW, Playwright.

### Rules

- Dependencies point inward: `features` -> `api`, `ui`, `domain`. `domain`
  imports nothing from React or the network. `ui` imports nothing from
  `api`, `features` or `domain`.
- **Only `ui/` renders styled elements.** Feature code composes `ui/`
  components and may use CSS Modules only for page layout (grid and gaps),
  written with tokens.
- **Every visual value is a token.** `ui/` components use CSS custom
  properties from `tokens.css` and no literal colours, sizes or fonts.
- **Behaviour lives outside components.** Data access sits in `api/` hooks,
  rules in `domain/`, form logic in `useContractForm`. Pages wire these to
  `ui/` components.
- A redesign may change the internals and styles of `ui/` components and
  `tokens.css` freely. It keeps component names and props stable, or changes
  them in the same commit as their callers.
- Each future sub-project adds `features/<name>/`, hooks in `api/`, and a
  nav entry, and reuses `ui/` and `domain/`.

### Fit with the backend's security checks

- **CSP** `default-src 'self'`: no runtime-injected `<style>` or `<script>`
  elements and no inline event handlers in the built app. CSS Modules compile
  to static files. No CSS-in-JS library is used. Fonts are system fonts or
  files bundled in `dist`.
- **Origin check:** in development the Vite proxy forwards `/api` without
  rewriting `Host` (`changeOrigin: false`), so the browser's `Origin`
  (`http://localhost:5173`) matches `http://{Host}`. In daily use the app and
  API share one origin.
- **Requests** go to relative `/api/v1/...` URLs, send JSON with
  `Content-Type: application/json`, and use `credentials: 'same-origin'`.

### Backend change: SPA fallback

`StaticFiles(html=True)` returns 404 for client-side routes such as
`/contratos/<id>`. The backend replaces the mount with a small handler:

- A path under `/api/` is never served by it, so API 404s stay problem
  responses.
- A path that names a file in `frontend/dist` serves that file.
- Any other `GET` serves `frontend/dist/index.html` with the app CSP.
- Paths are resolved inside `dist` and anything that escapes it (`..`) is
  refused.

## 3. Screens

Routes: `/` redirects to `/contratos`. `/contratos`, `/contratos/novo`,
`/contratos/:id`, `/clientes`. An unknown route shows "Página não
encontrada" with a link to `/contratos`. The nav bar has **Contratos** and
**Clientes**.

### 3.1 Contract list — `/contratos`

- Columns: couple ("Ana & Bruno", from first names), event date, venue,
  total in BRL.
- Row actions: **Editar** (opens the form), **Baixar PDF**, **Excluir**.
- **Excluir** asks for confirmation, soft-deletes, removes the row and shows
  a toast with **Desfazer**, which calls restore.
- **Mostrar excluídos** adds deleted contracts (`include_deleted=true`),
  shown muted and labelled "Excluído", with **Restaurar** in place of the
  other actions. A `409` on restore (a client was anonymised) shows the API's
  `detail`.
- A **Novo contrato** button opens `/contratos/novo`.
- Pagination: **Carregar mais** fetches the next page while `next_cursor` is
  set. Page size 20.
- Empty state: "Nenhum contrato ainda" with the **Novo contrato** button.

### 3.2 Contract form — `/contratos/novo` and `/contratos/:id`

Sections and fields, matching the API request body:

| Section | Fields |
|---|---|
| Casal | groom name and CPF, bride name and CPF, couple address |
| Evento | date (required), venue name (required), venue address, coverage start, coverage end, hours contracted |
| Fotógrafos | photographer count, default 2 |
| Pagamento | items (description, amount), 1 to 20; PIX discount, optional |
| Assinatura | city, default "Curitiba"; date, default today |

Behaviour:

- **Items:** **Adicionar item** appends an empty row; each row has a remove
  button, disabled when only one row is left; adding is disabled at 20.
- **Total:** shown below the items and updated on every change as
  `totalCents(items, discount)`, the same rule as the server.
- **Client-side validation** runs before submit and mirrors the API rules:
  required fields, the API's length limits, CPF check digits, groom CPF and
  bride CPF differ, hours 1–24, photographers 1–10, each amount above zero,
  discount above zero and below the items' sum. Errors show under the input.
- **Server validation:** a `422` response's `errors` list is mapped by field
  path (`groom.cpf`, `payment.items.2.amount_cents`) onto the matching input.
  An error whose path matches no input shows in a banner at the top of the
  form. The server's answer is authoritative.
- **Money input:** accepts BRL as typed (`1.200,00`, `1200`, `1200,5`),
  shows it formatted on blur, and holds integer cents.
- **CPF input:** accepts digits with or without punctuation and formats on
  blur.

Create (`/contratos/novo`):

- **Salvar** POSTs the contract. On `201` the app downloads the PDF, then
  navigates to `/contratos/<id>` with a toast "Contrato salvo".
- If the PDF download fails after a successful save, the contract stays
  saved; the toast says so and the edit page offers **Baixar PDF**.

Edit (`/contratos/:id`):

- Loads the contract and keeps its `ETag`.
- **Salvar** is disabled until something changes. It sends a `PATCH` with
  only the changed top-level sections (`groom`, `bride`, `couple_address`,
  `event`, `photographer_count`, `payment`, `signing`). A changed `event` or
  `signing` section is sent whole. A changed items list is sent whole, as the
  API replaces it. A cleared optional field is sent as `null`.
- The request carries `If-Match` with the stored `ETag`. On `200` the form
  resets to the response and stores the new `ETag`.
- On `412` a dialog says "Este contrato foi alterado em outro lugar. Recarregue
  para ver a versão atual." with **Recarregar**, which discards local edits
  and loads the current version.
- A **Baixar PDF** button renders the PDF of the saved version. It is
  disabled while there are unsaved changes, with a hint to save first.
- A soft-deleted contract opens read-only with a banner "Este contrato foi
  excluído" and **Restaurar**.
- A missing contract (`404`) shows "Contrato não encontrado".

Both modes:

- Leaving the page with unsaved changes asks for confirmation.
- While a request runs, **Salvar** shows a busy state and does not submit
  twice.

### 3.3 Clients — `/clientes`

- Columns: name, masked CPF, created date, status ("Ativo" or
  "Anonimizado").
- **Exportar dados** calls `GET /clients/{id}/export` and saves the JSON as
  `cliente-<id>.json`.
- **Anonimizar** opens a dialog explaining that the name, CPF and address are
  erased permanently and the action cannot be undone. The confirm button is
  enabled only after typing `ANONIMIZAR`. A `409` (the client is on a
  contract that is not deleted) shows the API's `detail` in the dialog.
- Anonymised rows show "Cliente anonimizado" in place of the name and offer
  no actions.
- Pagination as in the contract list.

## 4. Data flow and errors

- **Server state** lives only in TanStack Query. A successful create, edit,
  delete, restore or anonymise invalidates the affected lists and the
  affected contract.
- **Personal data** is not written to `localStorage`, `sessionStorage` or
  IndexedDB, and query caches are kept in memory only.
- **Downloads:** PDF and export responses are read as a blob and saved
  through a temporary object URL, which is revoked straight away. The file
  name comes from `Content-Disposition`, with a fallback of
  `contrato-<id>.pdf`.
- **Problem responses** (`application/problem+json`) are parsed into a typed
  error carrying `status`, `title`, `detail`, `errors` and `request_id`.
  - `422`: field errors on the form, as in 3.2.
  - `409`, `404`, `412`: handled where they occur, as in section 3.
  - `403`, `400`, `5xx`, network failure: a toast with the title and
    "Código: <request_id>" so the matching log line can be found.
- The browser console receives no personal values from the app.

## 5. API types

- `make api-types` runs `make openapi`, then `openapi-typescript`, and writes
  `frontend/src/api/schema.d.ts`.
- `schema.d.ts` is committed so the frontend builds without Python;
  `openapi.json` stays git-ignored.
- CI regenerates the file and fails if it differs from the committed one.

## 6. Testing

Development is test-driven, as for the backend.

- **Unit (Vitest)**, for `domain/` and `api/`: CPF check digits and
  formatting, BRL parsing and formatting, `totalCents` and the discount
  rule, 422-to-field mapping, PATCH body building, `Content-Disposition`
  parsing, problem response parsing.
- **Component (Vitest, Testing Library, MSW):** items add and remove with the
  running total; client-side errors block submit; server 422 errors land on
  the right inputs, including an item's amount; 412 opens the reload dialog
  and reloading discards edits; create then downloads the PDF; delete then
  **Desfazer** restores; deleted contract opens read-only; anonymise requires
  the typed word and shows a 409 explanation.
- Component tests query by role, label and text, never by CSS class or test
  ID tied to markup, so restyling `ui/` does not break them.
- **End to end (Playwright, Chromium):** runs against `frontend/dist` served
  by the real backend on a temporary database with generated keys. Scenarios:
  create a contract and receive a PDF whose SHA-256 equals the response's
  `X-Content-SHA256`; edit it, reload the page, see the change; delete and
  restore it; export and anonymise a client who is on no active contract;
  open `/contratos/<id>` directly by URL. Every test fails on any console
  error, including CSP violations.
- **Backend (pytest)** for the SPA fallback: a client route serves
  `index.html` with the app CSP; an unknown `/api/...` path returns a problem
  `404`; a file in `dist` is served as that file; a `..` path is refused.

## 7. Tooling

| Concern | Frontend |
|---|---|
| Runtime | Node 22 pinned in `.nvmrc`, npm, `package-lock.json` |
| Lint and format | ESLint, Prettier |
| Types | TypeScript strict, `tsc --noEmit` |
| Coverage gate | 80% lines, unit and component tests |

Makefile:

- `make install` also runs `npm ci` in `frontend/`.
- `make dev` runs the backend and Vite together.
- `make build` builds `frontend/dist`.
- `make run` builds `frontend/dist` when it is missing or older than the
  sources, then starts the backend.
- `make check` adds Prettier check, ESLint, `tsc`, Vitest with coverage,
  `npm audit --audit-level=high` and the API-types check.
- `make e2e` builds and runs Playwright.

CI adds a `frontend` job (everything `make check` adds) and an `e2e` job
(WeasyPrint libraries, Playwright's Chromium, `make e2e`). Dependabot adds
the npm ecosystem for `frontend/`. Pre-commit adds Prettier and ESLint for
files under `frontend/`.

The README gains the frontend's setup, `make dev`, and the note that
`make run` serves the built interface at <http://127.0.0.1:8000>.
