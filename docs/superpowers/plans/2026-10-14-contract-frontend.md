# Contract Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React interface Pedro uses on his Mac to create, edit, delete and restore wedding contracts, download their PDFs, and export or anonymise clients, served by the existing FastAPI backend.

**Architecture:** A Vite + React + TypeScript app in `frontend/`, built in layers so the look can be replaced later: `domain/` holds pure rules, `api/` holds the typed client and TanStack Query hooks, `ui/` is the only layer that renders styled HTML and draws every visual value from `tokens.css`, and `features/` wires them into pages. The backend gains one change: an SPA fallback that serves `index.html` for page paths outside `/api`.

**Tech Stack:** Node 22, npm, React 19, TypeScript 5 (strict), Vite 7, React Router 7 (data router), TanStack Query 5, React Hook Form 7, CSS Modules, openapi-typescript 7, openapi-fetch, Vitest 3, Testing Library, MSW 2, Playwright, ESLint 9, Prettier 3. Backend: Python 3.13, FastAPI, pytest.

**Spec:** `docs/superpowers/specs/2026-10-14-contract-frontend-design.md` (read it before starting; it is the source of every behaviour below). Backend API rules are in `docs/superpowers/specs/2026-10-13-contract-generation-design.md`, section 4.

## Global Constraints

- Node 22 is the target (`.nvmrc` holds `22`; `package.json` `engines.node` is `>=22`). Run frontend commands from `frontend/` and backend commands from `backend/` unless a step says otherwise.
- Install these major versions: `react@19 react-dom@19 react-router@7 @tanstack/react-query@5 react-hook-form@7 openapi-fetch@0.14`; dev: `typescript@5 vite@7 @vitejs/plugin-react@5 vitest@3 @vitest/coverage-v8@3 jsdom@26 @testing-library/react@16 @testing-library/user-event@14 @testing-library/jest-dom@6 msw@2 openapi-typescript@7 eslint@9 @eslint/js@9 typescript-eslint@8 eslint-plugin-react-hooks@5 globals@16 prettier@3 @playwright/test@1 @types/react@19 @types/react-dom@19 @types/node@22`. If one of these majors does not exist on npm or conflicts with a peer, use the newest major that installs cleanly and say so in the task report.
- TypeScript `strict: true`, plus `noUncheckedIndexedAccess: true`.
- Interface text is Portuguese. Code identifiers, comments and commit messages are English.
- Routes: `/` redirects to `/contratos`; `/contratos`, `/contratos/novo`, `/contratos/:id`, `/clientes`.
- API calls go to `/api/v1/...` on the page's own origin. Write bodies are JSON. No other origin is ever contacted.
- Money is integer centavos everywhere. No floats in money arithmetic.
- **CSP `default-src 'self'`:** the built app may not use runtime-injected `<style>`/`<script>` elements, inline event handler attributes, `data:` URLs, or any external URL. Vite builds with `assetsInlineLimit: 0` and `modulePreload: { polyfill: false }`. No CSS-in-JS library.
- **Layering:** `domain/` imports nothing from React, `api/`, `ui/` or `features/`. `ui/` imports nothing from `api/`, `domain/` or `features/`. `features/` may import from all three. Only `ui/` contains `.module.css` files with visual styling; a feature `.module.css` may contain only layout (`display`, `grid-*`, `gap`, `flex-*`, `margin`, `width`) using tokens.
- **Every visual value in `ui/` is a token** from `ui/tokens.css` (`var(--...)`). No literal colours, font sizes, spacing or radii in component CSS.
- Component tests query by role, label and visible text. Never by CSS class, and never by `data-testid`.
- Personal data is never written to `localStorage`, `sessionStorage`, IndexedDB or `console`.
- Unit and component test CPFs: only `123.456.789-09`, `987.654.321-00`, `111.444.777-35`. End-to-end tests build CPFs with `completeCpf` from base `000000` plus a three-digit counter (Task 12).
- Coverage gate: 80% lines over `src/` (excluding `src/api/schema.d.ts`, `src/main.tsx`, `src/test/`).
- **409 conflict messages are shown in Portuguese, chosen by the action that failed**, not the API's English `detail` (the backend's conflict texts are English). This refines the spec's "shows the API's detail"; the `request_id` is not shown for these.
- After each task: `npm run lint && npm run typecheck && npm test` pass in `frontend/` (once Task 2 exists), and `make check` passes for any task that touches the backend.

## Review Focus

1. **A deep link or page reload on `/contratos/<id>` in the built app** must load the page, not a 404, and a mistyped `/api/...` path must still be a JSON problem, not `index.html`. Tests in Task 1 (backend) and Task 12 (end to end).
2. **Money typed the Brazilian way with stray formatting** (`R$ 1.200,00`, `1200`, `1.200`, `1200,5`, `12,345`, `1.20`, `abc`, an empty field): parsed to the right cents or rejected as "valor inválido", never silently wrong. Tests in Task 3.
3. **A server 422 whose field path matches no input** (for example the API's whole-list `payment.items` rule, or an unknown field reported as `*`): shown in the form's banner, not lost. Test in Task 9.
4. **Clicking Salvar twice, or saving while a save is in flight**: exactly one POST or PATCH is sent. Test in Task 9.
5. **Leaving the edit page with unsaved changes through the nav bar**: a confirmation appears; confirming leaves, cancelling stays with the edits intact. Test in Task 10.

## File Structure

```
.nvmrc                                   22
Makefile                                 install, dev, build, run, api-types, check, e2e
.github/workflows/ci.yml                 + frontend and e2e jobs
.github/dependabot.yml                   + npm for /frontend
.pre-commit-config.yaml                  + prettier and eslint for frontend/
README.md                                + frontend setup and daily use
backend/src/gerenciador/api/frontend.py  SPA fallback
backend/src/gerenciador/main.py          uses mount_frontend
backend/tests/api/test_frontend.py
frontend/
  package.json, package-lock.json
  index.html
  vite.config.ts                         dev proxy (Host kept), build options, vitest config
  tsconfig.json
  eslint.config.js
  .prettierrc.json, .prettierignore
  playwright.config.ts
  scripts/check-api-types.sh             regenerates schema.d.ts and fails on a diff
  e2e/
    backend.sh                           starts the real backend on a temporary database
    helpers.ts                           CPF factory, console-error guard, form filling
    contracts.spec.ts
    clients.spec.ts
  src/
    main.tsx
    vite-env.d.ts
    test/
      setup.ts                           jest-dom, MSW server, dialog and URL stubs
      server.ts                          MSW server instance
      fixtures.ts                        contract and client response builders
      render.tsx                         renderApp(path) with every provider
    domain/
      cpf.ts, cpf.test.ts
      money.ts, money.test.ts
      contract.ts, contract.test.ts
      dates.ts, dates.test.ts
      patch.ts, patch.test.ts
      problems.ts, problems.test.ts
      filename.ts, filename.test.ts
    api/
      schema.d.ts                        generated, committed
      client.ts, client.test.ts          openapi-fetch client, ApiError, unwrap
      download.ts, download.test.ts      saveBlob
      contracts.ts                       contract hooks
      clients.ts                         client hooks
    ui/
      tokens.css
      global.css
      Button.tsx, Button.module.css
      Field.tsx, Field.module.css        label + control + error text
      TextInput.tsx, TextInput.module.css text, date, time, number and money (adornment) inputs
      Checkbox.tsx, Checkbox.module.css
      FormSection.tsx, FormSection.module.css  fieldset + legend
      Table.tsx, Table.module.css
      Dialog.tsx, Dialog.module.css
      ConfirmDialog.tsx, ConfirmDialog.test.tsx
      Toast.tsx, Toast.module.css, Toast.test.tsx
      Field.test.tsx
      Banner.tsx, Banner.module.css
      PageLayout.tsx, PageLayout.module.css
      Nav.tsx, Nav.module.css
      index.ts                           re-exports every component
    app/
      App.tsx                            providers + router
      routes.tsx                         route table (used by App and tests)
      queryClient.ts                     QueryClient with the unexpected-error toast
      NotFoundPage.tsx
      App.test.tsx
    features/
      contracts/
        names.ts, names.test.ts          couple label from first names
        messages.ts                      Portuguese texts for handled conflicts
        ContractListPage.tsx, ContractListPage.module.css, ContractListPage.test.tsx
        formModel.ts, formModel.test.ts  values type, defaults, toRequest, fromContract, validate
        useContractForm.ts               React Hook Form wiring, submit, server errors
        useUnsavedChangesGuard.ts        blocks leaving with unsaved changes
        ContractForm.tsx                 the form shared by create and edit
        ContractFormPage.tsx             picks CreateContract or EditContract
        CreateContract.tsx
        EditContract.tsx
        ContractFormPage.create.test.tsx
        ContractFormPage.edit.test.tsx
        sections/
          TextField.tsx                  Field + TextInput bound to React Hook Form
          CoupleSection.tsx
          EventSection.tsx
          PhotographersSection.tsx
          PaymentSection.tsx
          SigningSection.tsx
        ContractForm.module.css          layout only
      clients/
        ClientListPage.tsx, ClientListPage.module.css, ClientListPage.test.tsx
```

---

### Task 1: Backend SPA fallback

The backend currently mounts `StaticFiles(html=True)`, which returns 404 for `/contratos/<id>`. Replace it with a catch-all `GET` route that serves real files from `dist`, serves `index.html` for any other page path, never answers under `/api`, and refuses paths that escape `dist`.

**Files:**
- Create: `backend/src/gerenciador/api/frontend.py`
- Modify: `backend/src/gerenciador/main.py` (the `StaticFiles` import and the two lines that mount it)
- Test: `backend/tests/api/test_frontend.py`

**Interfaces:**
- Produces: `mount_frontend(app: FastAPI, dist: Path) -> None`. `create_app` calls it after `include_router` when `settings.frontend_dist / "index.html"` is a file.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/api/test_frontend.py`:

```python
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from gerenciador.config import Settings
from gerenciador.main import create_app

BASE_URL = "http://127.0.0.1:8000"
APP_CSP = (
    "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
)
INDEX = "<!doctype html><title>app</title>"


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    folder = tmp_path / "dist"
    (folder / "assets").mkdir(parents=True)
    (folder / "index.html").write_text(INDEX, encoding="utf-8")
    (folder / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("outside dist", encoding="utf-8")
    return folder


@pytest.fixture
def site(settings: Settings, dist: Path) -> Iterator[TestClient]:
    app = create_app(settings.model_copy(update={"frontend_dist": dist}))
    with TestClient(app, base_url=BASE_URL) as client:
        yield client


@pytest.mark.parametrize(
    "path", ["/", "/contratos", "/contratos/abc", "/clientes", "/docs"]
)
def test_page_paths_serve_the_app_with_its_csp(site: TestClient, path: str) -> None:
    response = site.get(path)
    assert response.status_code == 200
    assert response.text == INDEX
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["Content-Security-Policy"] == APP_CSP


def test_a_real_file_is_served_as_that_file(site: TestClient) -> None:
    response = site.get("/assets/app.js")
    assert response.status_code == 200
    assert response.text == "console.log(1)"
    assert "javascript" in response.headers["content-type"]


@pytest.mark.parametrize(
    "path", ["/api/v1/nope", "/api/v1/contracts/x/y/z", "/api", "/api/"]
)
def test_unknown_api_paths_stay_problem_responses(site: TestClient, path: str) -> None:
    response = site.get(path)
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"


@pytest.mark.parametrize(
    "path", ["/%2e%2e/secret.txt", "/assets/%2e%2e/%2e%2e/secret.txt"]
)
def test_paths_that_escape_dist_are_refused(site: TestClient, path: str) -> None:
    response = site.get(path)
    assert response.status_code == 404
    assert "outside dist" not in response.text


def test_api_routes_still_answer(site: TestClient) -> None:
    assert site.get("/api/v1/health").json() == {"status": "ok"}


def test_a_dist_folder_without_index_serves_no_pages(
    settings: Settings, tmp_path: Path
) -> None:
    empty = tmp_path / "empty-dist"
    empty.mkdir()
    app = create_app(settings.model_copy(update={"frontend_dist": empty}))
    with TestClient(app, base_url=BASE_URL) as client:
        assert client.get("/contratos").status_code == 404
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `DYLD_FALLBACK_LIBRARY_PATH="$(brew --prefix)/lib" uv run python -m pytest tests/api/test_frontend.py -v`
Expected: FAIL. `/contratos` and `/contratos/abc` return 404 under `StaticFiles`.

- [ ] **Step 3: Write the fallback**

Create `backend/src/gerenciador/api/frontend.py`:

```python
"""Serve the built frontend: real files as files, every other page path as index.html.

The app routes pages in the browser, so a reload on `/contratos/<id>` must get
index.html. Paths under `/api` never fall through to the page, so a mistyped API
path stays a problem response.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from starlette.responses import FileResponse


def mount_frontend(app: FastAPI, dist: Path) -> None:
    root = dist.resolve()
    index = root / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = (root / path).resolve()
        if not candidate.is_relative_to(root):
            raise HTTPException(status_code=404, detail="Not Found")
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)
```

In `backend/src/gerenciador/main.py`, remove `from fastapi.staticfiles import StaticFiles`, add `from gerenciador.api.frontend import mount_frontend` with the other `gerenciador.api` imports, and replace:

```python
if settings.frontend_dist.is_dir():
    app.mount(
        "/", StaticFiles(directory=settings.frontend_dist, html=True), name="frontend"
    )
```

with:

```python
    if (settings.frontend_dist / "index.html").is_file():
        mount_frontend(app, settings.frontend_dist)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `DYLD_FALLBACK_LIBRARY_PATH="$(brew --prefix)/lib" uv run python -m pytest tests/api/test_frontend.py tests/test_entrypoint.py tests/api/test_app.py -v`
Expected: PASS, including the existing `test_built_frontend_is_served_with_a_strict_csp` and `test_no_frontend_build_means_no_root_page`.

- [ ] **Step 5: Run the full backend checks**

Run (from the repository root): `make check`
Expected: PASS (format, lint, mypy, tests, coverage gates, pip-audit).

- [ ] **Step 6: Commit**

```bash
git add backend/src/gerenciador/api/frontend.py backend/src/gerenciador/main.py backend/tests/api/test_frontend.py
git commit -m "feat: serve the frontend's page paths through an SPA fallback"
```

---

### Task 2: Frontend scaffold, tooling and test harness

Create the Vite project by hand (no template generator, so nothing unwanted lands), with lint, format, type-check, Vitest and the test harness every later task uses.

**Files:**
- Create: `.nvmrc`, `frontend/package.json`, `frontend/index.html`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/eslint.config.js`, `frontend/.prettierrc.json`, `frontend/.prettierignore`, `frontend/src/main.tsx`, `frontend/src/vite-env.d.ts`, `frontend/src/test/setup.ts`, `frontend/src/test/server.ts`, `frontend/src/smoke.test.ts` (deleted again in Step 7)
- Modify: `Makefile`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:coverage`, `e2e`, `api-types`. `src/test/server.ts` exports `server` (an MSW `setupServer()` with no default handlers); tests add handlers with `server.use(...)`. `src/test/setup.ts` stubs `HTMLDialogElement.prototype.showModal/close`, `URL.createObjectURL` (returns `"blob:test"`), `URL.revokeObjectURL`, and fails any request with no MSW handler.

- [ ] **Step 1: Create the project files**

`.nvmrc` (repository root):

```
22
```

`frontend/package.json`:

```json
{
  "name": "gerenciador-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "e2e": "playwright test",
    "api-types": "openapi-typescript ../openapi.json -o src/api/schema.d.ts"
  }
}
```

Then install (from `frontend/`):

```bash
npm install react@19 react-dom@19 react-router@7 @tanstack/react-query@5 react-hook-form@7 openapi-fetch@0.14
npm install -D typescript@5 vite@7 @vitejs/plugin-react@5 vitest@3 @vitest/coverage-v8@3 jsdom@26 \
  @testing-library/react@16 @testing-library/user-event@14 @testing-library/jest-dom@6 msw@2 \
  openapi-typescript@7 eslint@9 @eslint/js@9 typescript-eslint@8 eslint-plugin-react-hooks@5 globals@16 \
  prettier@3 @playwright/test@1 @types/react@19 @types/react-dom@19 @types/node@22
```

`frontend/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Gerenciador Fotografia</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`frontend/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // The backend checks Origin against Host on writes. Keeping the browser's Host
    // (changeOrigin: false) makes `http://localhost:5173` match on both sides.
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: false },
    },
  },
  build: {
    // The backend's CSP is default-src 'self': no data: URLs, no inline scripts.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: { modules: { classNameStrategy: "non-scoped" } },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/api/schema.d.ts", "src/main.tsx", "src/test/**", "src/**/*.test.{ts,tsx}", "src/vite-env.d.ts"],
      thresholds: { lines: 80 },
    },
  },
});
```

`frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom", "node"]
  },
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts", "eslint.config.js"]
}
```

`frontend/eslint.config.js`:

```js
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "playwright-report", "test-results", "src/api/schema.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-console": "error",
      // With noUncheckedIndexedAccess, `list[0]!` after a length check is the honest form.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Layering: domain and ui stay independent of the app around them.
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["react", "react-*", "**/api/*", "**/ui/*", "**/features/*", "**/app/*"] }],
    },
  },
  {
    files: ["src/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["**/api/*", "**/domain/*", "**/features/*", "**/app/*"] }],
    },
  },
);
```

`frontend/.prettierrc.json`:

```json
{ "printWidth": 100 }
```

`frontend/.prettierignore`:

```
dist
coverage
playwright-report
test-results
src/api/schema.d.ts
package-lock.json
```

`frontend/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

`frontend/src/main.tsx` (replaced in Task 7):

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <p>Gerenciador Fotografia</p>
  </StrictMode>,
);
```

`frontend/src/test/server.ts`:

```ts
import { setupServer } from "msw/node";

export const server = setupServer();
```

`frontend/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./server";

// jsdom has no modal dialogs. These stubs keep the `open` attribute in step with
// showModal/close and fire `close`, which is what the components rely on.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
};

// jsdom has no object URLs. Downloads create and revoke one each.
URL.createObjectURL = vi.fn(() => "blob:test");
URL.revokeObjectURL = vi.fn();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());
```

- [ ] **Step 2: Write a smoke test that proves the harness works**

`frontend/src/smoke.test.ts`:

```ts
import { http, HttpResponse } from "msw";
import { server } from "./test/server";

test("MSW answers a relative API call made with the page origin", async () => {
  server.use(http.get("/api/v1/health", () => HttpResponse.json({ status: "ok" })));
  const response = await fetch(new URL("/api/v1/health", window.location.origin));
  expect(await response.json()).toEqual({ status: "ok" });
});

test("dialog stubs toggle the open attribute", () => {
  const dialog = document.createElement("dialog");
  dialog.showModal();
  expect(dialog).toHaveAttribute("open");
  dialog.close();
  expect(dialog).not.toHaveAttribute("open");
});
```

- [ ] **Step 3: Run the tests and the tools**

Run (from `frontend/`): `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: 2 tests PASS; typecheck, lint and format report no problems. If `format:check` fails, run `npm run format` once and re-run.

- [ ] **Step 4: Build and confirm the CSP-relevant output**

Run: `npm run build && grep -c "<script type=\"module\"" dist/index.html && ! grep -q "data:" dist/index.html && echo OK`
Expected: `1` then `OK`. The built `index.html` loads one external module script and contains no `data:` URL and no inline script body.

- [ ] **Step 5: Add Makefile targets**

In the root `Makefile`, add `NPM := cd frontend && npm` below the `UV :=` line, extend `.PHONY` to `install run check openapi dev build api-types e2e`, and change or add these targets (keep the existing `check` lines; the frontend lines are added to it in Task 13):

```make
install: install-backend install-frontend

install-backend:
	$(UV) sync

install-frontend:
	$(NPM) ci

# Backend and Vite together. Vite proxies /api to the backend and keeps the browser's Host.
dev:
	$(MAKE) -j2 dev-backend dev-frontend

dev-backend:
	$(UV) run python -m gerenciador

dev-frontend:
	$(NPM) run dev

build:
	$(NPM) run build

# Builds the interface when it is missing or older than its sources, then serves it.
run: frontend/dist/index.html
	$(UV) run python -m gerenciador

frontend/dist/index.html: $(shell find frontend/src frontend/index.html frontend/vite.config.ts frontend/package-lock.json -type f 2>/dev/null)
	$(NPM) run build
```

Add `install-backend install-frontend dev-backend dev-frontend` to `.PHONY` as well.

CI's backend job has no Node, so in `.github/workflows/ci.yml` change its `- run: make install` step to `- run: make install-backend`. Task 13 adds the frontend jobs.

- [ ] **Step 6: Verify the Makefile targets**

Run (repository root): `make build && test -f frontend/dist/index.html && echo built`
Expected: `built`.

- [ ] **Step 7: Delete the smoke test and commit**

`smoke.test.ts` only proved the harness; later tasks cover the same ground. Delete it, then:

```bash
rm frontend/src/smoke.test.ts
git add .nvmrc Makefile .github/workflows/ci.yml frontend
git commit -m "chore: scaffold the frontend with Vite, TypeScript, lint and tests"
```

Confirm `frontend/node_modules` and `frontend/dist` are not staged (both are already in `.gitignore`).

---

### Task 3: Domain rules — CPF, money and contract totals

Pure functions mirroring the backend's rules, so the form can catch mistakes before sending.

**Files:**
- Create: `frontend/src/domain/cpf.ts`, `frontend/src/domain/cpf.test.ts`, `frontend/src/domain/money.ts`, `frontend/src/domain/money.test.ts`, `frontend/src/domain/contract.ts`, `frontend/src/domain/contract.test.ts`

**Interfaces:**
- Produces:
  - `cpfDigits(value: string): string | null` — the 11 digits of a valid CPF, or `null`. Accepts only digits, `.`, `-` and spaces (as the backend does).
  - `isValidCpf(value: string): boolean`
  - `formatCpf(value: string): string` — `"123.456.789-09"` for a valid CPF; the input unchanged otherwise.
  - `completeCpf(nineDigits: string): string` — the 11-digit CPF whose check digits complete the 9 given.
  - `MAX_CENTS = 100_000_000`
  - `parseBrl(text: string): number | null` — cents; `null` for blank input; `NaN` for text that is not a valid amount.
  - `formatBrlAmount(cents: number): string` — `"1.200,00"`.
  - `formatBrl(cents: number): string` — `"R$ 1.200,00"` (plain space).
  - `subtotalCents(amounts: readonly (number | null)[]): number | null` — `null` if any amount is `null`, `NaN` or not positive.
  - `totalCents(amounts: readonly (number | null)[], discount: number | null): number | null` — `subtotal - discount`; `null` when the subtotal is `null` or the discount is invalid.
  - `discountError(amounts: readonly (number | null)[], discount: number | null): string | null` — `"o desconto deve ser maior que zero e menor que a soma dos itens"` or `null`.

- [ ] **Step 1: Write the failing CPF tests**

`frontend/src/domain/cpf.test.ts`:

```ts
import { completeCpf, cpfDigits, formatCpf, isValidCpf } from "./cpf";

describe("cpfDigits", () => {
  test.each([
    ["123.456.789-09", "12345678909"],
    ["12345678909", "12345678909"],
    [" 987 654 321 00 ", "98765432100"],
    ["111.444.777-35", "11144477735"],
  ])("accepts %j", (input, digits) => {
    expect(cpfDigits(input)).toBe(digits);
  });

  test.each([
    "",
    "123.456.789-00",
    "11111111111",
    "1234567890",
    "123456789091",
    "abc12345678909",
    "123.456.789-09x",
    "１２３４５６７８９０９",
    "123.456.789-09\u00a0",
  ])("rejects %j", (input) => {
    expect(cpfDigits(input)).toBeNull();
    expect(isValidCpf(input)).toBe(false);
  });
});

test("formatCpf punctuates a valid CPF and leaves anything else alone", () => {
  expect(formatCpf("12345678909")).toBe("123.456.789-09");
  expect(formatCpf("1234")).toBe("1234");
});

test("completeCpf adds the two check digits", () => {
  expect(completeCpf("123456789")).toBe("12345678909");
  expect(completeCpf("987654321")).toBe("98765432100");
  expect(isValidCpf(completeCpf("000000001"))).toBe(true);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/domain/cpf.test.ts`
Expected: FAIL, `Cannot find module './cpf'` or similar.

- [ ] **Step 3: Implement `cpf.ts`**

```ts
// ASCII whitespace only, as the backend reads the CPF with re.ASCII.
const ALLOWED = /^[0-9. \t\n\r\f\v-]*$/;

function checkDigit(digits: string): number {
  const weight = digits.length + 1;
  let total = 0;
  for (let index = 0; index < digits.length; index += 1) {
    total += Number(digits[index]) * (weight - index);
  }
  const remainder = (total * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

export function cpfDigits(value: string): string | null {
  if (!ALLOWED.test(value)) return null;
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length !== 11 || digits === digits[0]!.repeat(11)) return null;
  if (checkDigit(digits.slice(0, 9)) !== Number(digits[9])) return null;
  if (checkDigit(digits.slice(0, 10)) !== Number(digits[10])) return null;
  return digits;
}

export function isValidCpf(value: string): boolean {
  return cpfDigits(value) !== null;
}

export function formatCpf(value: string): string {
  const digits = cpfDigits(value);
  if (digits === null) return value;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function completeCpf(nineDigits: string): string {
  const first = checkDigit(nineDigits);
  const second = checkDigit(`${nineDigits}${first}`);
  return `${nineDigits}${first}${second}`;
}
```

Note: `cpfDigits("")` has length 0, so it returns `null` before indexing `digits[0]`.

- [ ] **Step 4: Run the CPF tests to verify they pass**

Run: `npx vitest run src/domain/cpf.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing money and contract tests**

`frontend/src/domain/money.test.ts`:

```ts
import { MAX_CENTS, formatBrl, formatBrlAmount, parseBrl } from "./money";

describe("parseBrl", () => {
  test.each([
    ["1.200,00", 120000],
    ["1200", 120000],
    ["1200,5", 120050],
    ["1.200", 120000],
    ["R$ 1.200,00", 120000],
    ["R$1.234.567,89", 123456789],
    ["  300,00 ", 30000],
    ["0,01", 1],
  ])("reads %j as %i cents", (text, cents) => {
    expect(parseBrl(text)).toBe(cents);
  });

  test.each(["", "   "])("treats %j as empty", (text) => {
    expect(parseBrl(text)).toBeNull();
  });

  test.each(["abc", "12,345", "1.20", "1,2,3", "-100", "1.2345", "12.00", "1 200"])(
    "rejects %j",
    (text) => {
      expect(parseBrl(text)).toBeNaN();
    },
  );
});

describe("formatting", () => {
  test.each([
    [1, "0,01"],
    [120000, "1.200,00"],
    [123456789, "1.234.567,89"],
    [MAX_CENTS, "1.000.000,00"],
  ])("%i cents is %j", (cents, text) => {
    expect(formatBrlAmount(cents)).toBe(text);
    expect(formatBrl(cents)).toBe(`R$ ${text}`);
  });

  test("a formatted amount parses back to the same cents", () => {
    for (const cents of [1, 99, 100, 101, 99999, 100000, 7654321, MAX_CENTS]) {
      expect(parseBrl(formatBrlAmount(cents))).toBe(cents);
    }
  });
});
```

`frontend/src/domain/contract.test.ts`:

```ts
import { discountError, subtotalCents, totalCents } from "./contract";

const DISCOUNT_MESSAGE = "o desconto deve ser maior que zero e menor que a soma dos itens";

test("subtotal adds every amount", () => {
  expect(subtotalCents([50000, 120000, 60000])).toBe(230000);
});

test.each([[[50000, null]], [[50000, Number.NaN]], [[0]], [[-1]], [[]]])(
  "subtotal is unknown for %j",
  (amounts) => {
    expect(subtotalCents(amounts)).toBeNull();
  },
);

test("total subtracts a valid discount", () => {
  expect(totalCents([50000, 120000, 60000], 30000)).toBe(200000);
  expect(totalCents([50000], null)).toBe(50000);
});

test.each([0, -1, 50000, 60000, Number.NaN])("discount %d on R$ 500,00 is refused", (discount) => {
  expect(discountError([50000], discount)).toBe(DISCOUNT_MESSAGE);
  expect(totalCents([50000], discount)).toBeNull();
});

test("no discount and a discount below the sum are fine", () => {
  expect(discountError([50000], null)).toBeNull();
  expect(discountError([50000], 49999)).toBeNull();
});

test("the discount is not judged while the items are incomplete", () => {
  expect(discountError([null], 30000)).toBeNull();
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run src/domain`
Expected: money and contract tests FAIL (modules missing); CPF tests PASS.

- [ ] **Step 7: Implement `money.ts` and `contract.ts`**

`frontend/src/domain/money.ts`:

```ts
/** The backend's largest accepted amount: R$ 1.000.000,00. */
export const MAX_CENTS = 100_000_000;

// Whole reais, either plain ("1200") or grouped by dots in threes ("1.200"),
// then an optional comma with one or two decimal digits.
const BRL = /^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

export function parseBrl(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const match = BRL.exec(trimmed);
  if (match === null) return Number.NaN;
  const reais = Number(match[1]!.replaceAll(".", ""));
  const centavos = Number((match[2] ?? "").padEnd(2, "0"));
  return reais * 100 + centavos;
}

export function formatBrlAmount(cents: number): string {
  const reais = Math.trunc(cents / 100).toString();
  const centavos = (cents % 100).toString().padStart(2, "0");
  const grouped = reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped},${centavos}`;
}

export function formatBrl(cents: number): string {
  return `R$ ${formatBrlAmount(cents)}`;
}
```

Check: `"12.00"` fails the regex because a dot group needs exactly three digits; `"1 200"` fails because spaces are not allowed inside the number.

`frontend/src/domain/contract.ts`:

```ts
const DISCOUNT_MESSAGE = "o desconto deve ser maior que zero e menor que a soma dos itens";

function isPositiveCents(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value > 0;
}

export function subtotalCents(amounts: readonly (number | null)[]): number | null {
  if (amounts.length === 0 || !amounts.every(isPositiveCents)) return null;
  return (amounts as number[]).reduce((sum, amount) => sum + amount, 0);
}

export function discountError(
  amounts: readonly (number | null)[],
  discount: number | null,
): string | null {
  if (discount === null) return null;
  const subtotal = subtotalCents(amounts);
  if (subtotal === null) return null;
  if (!isPositiveCents(discount) || discount >= subtotal) return DISCOUNT_MESSAGE;
  return null;
}

export function totalCents(
  amounts: readonly (number | null)[],
  discount: number | null,
): number | null {
  const subtotal = subtotalCents(amounts);
  if (subtotal === null) return null;
  if (discount === null) return subtotal;
  return discountError(amounts, discount) === null ? subtotal - discount : null;
}
```

Note: `discountError([50000], NaN)`: `isPositiveCents(NaN)` is false, so it returns the message, as the test expects.

- [ ] **Step 8: Run the domain tests to verify they pass**

Run: `npx vitest run src/domain && npm run lint && npm run typecheck`
Expected: PASS, no lint or type errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/domain
git commit -m "feat: add CPF, money and contract total rules to the frontend"
```

---

### Task 4: API types, typed client and problem handling

Generate the TypeScript types from the backend schema, wrap `openapi-fetch` so every failure becomes one typed `ApiError`, and add the pure helpers that read problem responses, PATCH diffs and download file names.

**Files:**
- Create: `frontend/src/api/schema.d.ts` (generated), `frontend/src/api/client.ts`, `frontend/src/api/client.test.ts`, `frontend/src/api/download.ts`, `frontend/src/api/download.test.ts`, `frontend/src/domain/problems.ts`, `frontend/src/domain/problems.test.ts`, `frontend/src/domain/patch.ts`, `frontend/src/domain/patch.test.ts`, `frontend/src/domain/filename.ts`, `frontend/src/domain/filename.test.ts`, `frontend/scripts/check-api-types.sh`
- Modify: `Makefile` (add `api-types`)

**Interfaces:**
- Consumes: nothing from earlier frontend tasks.
- Produces:
  - `src/api/schema.d.ts` exporting `paths` and `components`.
  - `src/api/client.ts`:
    - `type Schemas = components["schemas"]`
    - `type ContractOut = Schemas["ContractOut"]`, `type ContractCreate = Schemas["ContractCreate"]`, `type ContractPatch = Schemas["ContractPatch"]`, `type ClientOut = Schemas["ClientOut"]`, `type ClientExportOut = Schemas["ClientExportOut"]`
    - `api` — the `openapi-fetch` client, `baseUrl: window.location.origin`.
    - `class ApiError extends Error { status: number; title: string; detail: string; errors: FieldError[]; requestId: string | null }` — `status` is `0` for a network failure.
    - `send<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<{ data: T; response: Response }>` — throws `ApiError` on any failure; used when headers are needed (PDF file name).
    - `unwrap<T>(call)` — `send(call)` without the response: resolves with `data` (or `undefined as T` for 204).
  - `src/domain/problems.ts`:
    - `type FieldError = { field: string; message: string }`
    - `parseProblem(status: number, body: unknown): { title: string; detail: string; errors: FieldError[]; requestId: string | null }`
    - `splitFieldErrors(errors: readonly FieldError[], isField: (path: string) => boolean): { fields: Record<string, string>; other: string[] }` — the first message per known field; every other message (with its path when it has one) in `other`.
  - `src/domain/patch.ts`: `changedSections<T extends Record<string, unknown>>(before: T, after: T): Partial<T>` — the top-level keys whose values differ by deep equality.
  - `src/domain/filename.ts`: `filenameFromDisposition(header: string | null, fallback: string): string`.
  - `src/api/download.ts`: `saveBlob(blob: Blob, filename: string): void` — creates an object URL, clicks a temporary `<a download>`, revokes the URL.

- [ ] **Step 1: Add the `api-types` target and generate the types**

In the root `Makefile`, add `api-types` to `.PHONY` and:

```make
# Regenerates the frontend's API types from the backend's route definitions.
api-types: openapi
	$(NPM) run api-types
```

Run (repository root): `make api-types && head -5 frontend/src/api/schema.d.ts`
Expected: the file exists and begins with openapi-typescript's generated header.

- [ ] **Step 2: Write the failing tests for the pure helpers**

`frontend/src/domain/problems.test.ts`:

```ts
import { parseProblem, splitFieldErrors } from "./problems";

test("reads an RFC 9457 problem", () => {
  const problem = parseProblem(422, {
    type: "about:blank",
    title: "Unprocessable Content",
    status: 422,
    detail: "Request validation failed",
    request_id: "req-1",
    errors: [{ field: "groom.cpf", message: "CPF inválido" }],
  });
  expect(problem).toEqual({
    title: "Unprocessable Content",
    detail: "Request validation failed",
    errors: [{ field: "groom.cpf", message: "CPF inválido" }],
    requestId: "req-1",
  });
});

test.each([null, "oops", 42, { errors: "nope" }, { errors: [{ field: 1 }] }])(
  "tolerates a malformed body %j",
  (body) => {
    const problem = parseProblem(500, body);
    expect(problem.errors).toEqual([]);
    expect(problem.requestId).toBeNull();
    expect(problem.title).toBe("Erro 500");
  },
);

test("splits errors into known fields and the rest", () => {
  const known = new Set(["groom.cpf", "payment.items.0.amount_cents"]);
  const result = splitFieldErrors(
    [
      { field: "groom.cpf", message: "CPF inválido" },
      { field: "groom.cpf", message: "segunda mensagem" },
      { field: "payment.items.0.amount_cents", message: "deve ser maior que zero" },
      { field: "payment.items", message: "informe ao menos um item" },
      { field: "*", message: "Extra inputs are not permitted" },
      { field: "", message: "erro geral" },
    ],
    (path) => known.has(path),
  );
  expect(result.fields).toEqual({
    "groom.cpf": "CPF inválido",
    "payment.items.0.amount_cents": "deve ser maior que zero",
  });
  expect(result.other).toEqual([
    "payment.items: informe ao menos um item",
    "*: Extra inputs are not permitted",
    "erro geral",
  ]);
});
```

`frontend/src/domain/patch.test.ts`:

```ts
import { changedSections } from "./patch";

const base = {
  couple_address: "Rua A",
  event: { date: "2027-03-14", venue_address: null as string | null },
  payment: { items: [{ description: "Cerimônia", amount_cents: 1000 }] },
  photographer_count: 2,
};

test("nothing changed gives an empty patch", () => {
  expect(changedSections(base, structuredClone(base))).toEqual({});
});

test("a changed nested value sends its whole section", () => {
  const after = structuredClone(base);
  after.event.venue_address = "Rua B";
  expect(changedSections(base, after)).toEqual({
    event: { date: "2027-03-14", venue_address: "Rua B" },
  });
});

test("a changed list is sent whole", () => {
  const after = structuredClone(base);
  after.payment.items.push({ description: "Jantar", amount_cents: 500 });
  expect(changedSections(base, after)).toEqual({ payment: after.payment });
});

test("scalars and clearing to null count as changes", () => {
  const before = { ...base, event: { ...base.event, venue_address: "Rua B" } };
  const after = { ...base, photographer_count: 3 };
  expect(changedSections(before, after)).toEqual({
    event: { date: "2027-03-14", venue_address: null },
    photographer_count: 3,
  });
});
```

`frontend/src/domain/filename.test.ts`:

```ts
import { filenameFromDisposition } from "./filename";

test.each([
  ['attachment; filename="contrato-ana-bruno-2027-03-14.pdf"', "contrato-ana-bruno-2027-03-14.pdf"],
  ["attachment; filename=contrato.pdf", "contrato.pdf"],
  ["attachment; filename*=UTF-8''contrato%20final.pdf", "contrato final.pdf"],
])("reads %j", (header, name) => {
  expect(filenameFromDisposition(header, "fallback.pdf")).toBe(name);
});

test.each([null, "", "attachment", 'attachment; filename=""', 'attachment; filename="../x/../.."'])(
  "falls back for %j",
  (header) => {
    expect(filenameFromDisposition(header, "fallback.pdf")).toBe("fallback.pdf");
  },
);

test("strips any folder part a header might carry", () => {
  expect(filenameFromDisposition('attachment; filename="a/b\\\\c.pdf"', "f.pdf")).toBe("c.pdf");
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/domain/problems.test.ts src/domain/patch.test.ts src/domain/filename.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 4: Implement the pure helpers**

`frontend/src/domain/problems.ts`:

```ts
export type FieldError = { field: string; message: string };

export type Problem = {
  title: string;
  detail: string;
  errors: FieldError[];
  requestId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldError(value: unknown): value is FieldError {
  return isRecord(value) && typeof value.field === "string" && typeof value.message === "string";
}

export function parseProblem(status: number, body: unknown): Problem {
  const record = isRecord(body) ? body : {};
  const errors = Array.isArray(record.errors) ? record.errors.filter(isFieldError) : [];
  return {
    title: typeof record.title === "string" ? record.title : `Erro ${status}`,
    detail: typeof record.detail === "string" ? record.detail : "",
    errors: errors.map(({ field, message }) => ({ field, message })),
    requestId: typeof record.request_id === "string" ? record.request_id : null,
  };
}

export function splitFieldErrors(
  errors: readonly FieldError[],
  isField: (path: string) => boolean,
): { fields: Record<string, string>; other: string[] } {
  const fields: Record<string, string> = {};
  const other: string[] = [];
  for (const { field, message } of errors) {
    if (isField(field)) {
      fields[field] ??= message;
    } else {
      other.push(field === "" ? message : `${field}: ${message}`);
    }
  }
  return { fields, other };
}
```

The second `groom.cpf` message is dropped on purpose: one message per input is enough.

`frontend/src/domain/patch.ts`:

```ts
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/** The top-level keys of `after` whose values differ from `before`, each sent whole. */
export function changedSections<T extends Record<string, unknown>>(before: T, after: T): Partial<T> {
  const changed: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (!deepEqual(before[key], after[key])) changed[key] = after[key];
  }
  return changed;
}
```

`frontend/src/domain/filename.ts`:

```ts
function baseName(name: string): string {
  const parts = name.split(/[/\\]/);
  return parts[parts.length - 1]!.trim();
}

function usable(name: string | undefined): string | null {
  if (name === undefined) return null;
  const base = baseName(name);
  return base === "" || base === "." || base === ".." ? null : base;
}

export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (extended) {
    try {
      const decoded = usable(decodeURIComponent(extended[1]!));
      if (decoded) return decoded;
    } catch {
      // A malformed percent-encoding falls through to the plain parameter.
    }
  }
  const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
  const plain = /filename\s*=\s*([^;"\s]+)/i.exec(header);
  return usable(quoted?.[1] ?? plain?.[1]) ?? fallback;
}
```

Check against the tests: `'attachment; filename="../x/../.."'` gives base `..`, so it falls back. `'a/b\\c.pdf'` gives `c.pdf`.

- [ ] **Step 5: Run the helper tests to verify they pass**

Run: `npx vitest run src/domain`
Expected: PASS.

- [ ] **Step 6: Write the failing client and download tests**

`frontend/src/api/client.test.ts`:

```ts
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { ApiError, api, unwrap } from "./client";

test("returns data on success", async () => {
  server.use(http.get("/api/v1/health", () => HttpResponse.json({ status: "ok" })));
  await expect(unwrap(api.GET("/api/v1/health"))).resolves.toEqual({ status: "ok" });
});

test("turns a problem response into an ApiError", async () => {
  server.use(
    http.get("/api/v1/contracts/:id", () =>
      HttpResponse.json(
        { type: "about:blank", title: "Not Found", status: 404, detail: "contract not found", request_id: "r-9" },
        { status: 404, headers: { "Content-Type": "application/problem+json" } },
      ),
    ),
  );
  const call = unwrap(
    api.GET("/api/v1/contracts/{contract_id}", {
      params: { path: { contract_id: "6f1c0a52-0000-4000-8000-000000000000" } },
    }),
  );
  await expect(call).rejects.toMatchObject({ status: 404, detail: "contract not found", requestId: "r-9" });
  await expect(call).rejects.toBeInstanceOf(ApiError);
});

test("a network failure is status 0", async () => {
  server.use(http.get("/api/v1/health", () => HttpResponse.error()));
  await expect(unwrap(api.GET("/api/v1/health"))).rejects.toMatchObject({ status: 0 });
});

test("a 204 resolves with undefined", async () => {
  server.use(
    http.delete("/api/v1/contracts/:id", () => new HttpResponse(null, { status: 204 })),
  );
  const call = api.DELETE("/api/v1/contracts/{contract_id}", {
    params: { path: { contract_id: "6f1c0a52-0000-4000-8000-000000000000" } },
  });
  await expect(unwrap(call)).resolves.toBeUndefined();
});

test("writes send JSON to the page's own origin", async () => {
  let seen: Request | undefined;
  server.use(
    http.post("/api/v1/contracts/:id/restore", ({ request }) => {
      seen = request;
      return HttpResponse.json({});
    }),
  );
  await unwrap(
    api.POST("/api/v1/contracts/{contract_id}/restore", {
      params: { path: { contract_id: "6f1c0a52-0000-4000-8000-000000000000" } },
    }),
  );
  expect(new URL(seen!.url).origin).toBe(window.location.origin);
});
```

`frontend/src/api/download.test.ts`:

```ts
import { saveBlob } from "./download";

test("saveBlob clicks a temporary download link and revokes its URL", () => {
  const clicked: HTMLAnchorElement[] = [];
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });

  saveBlob(new Blob(["%PDF"], { type: "application/pdf" }), "contrato.pdf");

  expect(click).toHaveBeenCalledOnce();
  expect(clicked[0]!.download).toBe("contrato.pdf");
  expect(clicked[0]!.href).toBe("blob:test");
  expect(clicked[0]!.isConnected).toBe(false);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
});
```

- [ ] **Step 7: Run them to verify they fail**

Run: `npx vitest run src/api`
Expected: FAIL (modules missing).

- [ ] **Step 8: Implement the client and download**

`frontend/src/api/client.ts`:

```ts
import createClient from "openapi-fetch";
import { type FieldError, parseProblem } from "../domain/problems";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type ContractOut = Schemas["ContractOut"];
export type ContractCreate = Schemas["ContractCreate"];
export type ContractPatch = Schemas["ContractPatch"];
export type ClientOut = Schemas["ClientOut"];
export type ClientExportOut = Schemas["ClientExportOut"];

export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  readonly errors: FieldError[];
  readonly requestId: string | null;

  constructor(status: number, body: unknown) {
    const problem = parseProblem(status, body);
    super(problem.detail || problem.title);
    this.name = "ApiError";
    this.status = status;
    this.title = status === 0 ? "Sem conexão com o servidor" : problem.title;
    this.detail = problem.detail;
    this.errors = problem.errors;
    this.requestId = problem.requestId;
  }
}

export const api = createClient<paths>({
  baseUrl: window.location.origin,
  credentials: "same-origin",
  // Looked up on every call so test interceptors installed later still apply.
  fetch: (request) => globalThis.fetch(request),
});

type Result<T> = { data?: T; error?: unknown; response: Response };

export async function send<T>(call: Promise<Result<T>>): Promise<{ data: T; response: Response }> {
  let result: Result<T>;
  try {
    result = await call;
  } catch {
    throw new ApiError(0, null);
  }
  if (!result.response.ok) throw new ApiError(result.response.status, result.error);
  return { data: result.data as T, response: result.response };
}

export async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
  return (await send(call)).data;
}
```

The OpenAPI schema declares FastAPI's default `HTTPValidationError` for 422. The real body is a problem, which is why `error` is treated as `unknown` and read with `parseProblem`.

`frontend/src/api/download.ts`:

```ts
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/api src/domain && npm run typecheck && npm run lint`
Expected: PASS. If typecheck rejects the `DELETE` or `POST` call shapes, compare them with `paths` in `schema.d.ts` and match its parameter names exactly (`contract_id`, `client_id`).

- [ ] **Step 10: Add the API-types freshness check**

`frontend/scripts/check-api-types.sh`:

```bash
#!/usr/bin/env bash
# Fails when src/api/schema.d.ts is not what the backend's current routes generate.
set -euo pipefail
cd "$(dirname "$0")/../.."
make api-types >/dev/null
if ! git diff --quiet -- frontend/src/api/schema.d.ts; then
  echo "frontend/src/api/schema.d.ts is out of date. Run 'make api-types' and commit the result." >&2
  git --no-pager diff --stat -- frontend/src/api/schema.d.ts >&2
  exit 1
fi
echo "API types are current."
```

Run: `chmod +x frontend/scripts/check-api-types.sh && frontend/scripts/check-api-types.sh`
Expected: `API types are current.`

- [ ] **Step 11: Commit**

```bash
git add Makefile frontend/scripts frontend/src/api frontend/src/domain
git commit -m "feat: add the typed API client, problem parsing and download helpers"
```

---

### Task 5: The `ui/` layer — tokens and components

The only layer that renders styled HTML. Every visual value comes from `tokens.css`, so a later redesign starts there. Components take plain props and know nothing about contracts or the API.

Money and CPF inputs are a plain `TextInput` (money with the `R$` adornment). The form model in Task 8 holds their text and converts it with `domain/`, which keeps `ui/` free of business rules.

**Files:**
- Create: `frontend/src/ui/tokens.css`, `frontend/src/ui/global.css`, `frontend/src/ui/Button.tsx`, `frontend/src/ui/Button.module.css`, `frontend/src/ui/Field.tsx`, `frontend/src/ui/Field.module.css`, `frontend/src/ui/Field.test.tsx`, `frontend/src/ui/TextInput.tsx`, `frontend/src/ui/TextInput.module.css`, `frontend/src/ui/Table.tsx`, `frontend/src/ui/Table.module.css`, `frontend/src/ui/Dialog.tsx`, `frontend/src/ui/Dialog.module.css`, `frontend/src/ui/ConfirmDialog.tsx`, `frontend/src/ui/ConfirmDialog.test.tsx`, `frontend/src/ui/Toast.tsx`, `frontend/src/ui/Toast.module.css`, `frontend/src/ui/Toast.test.tsx`, `frontend/src/ui/Banner.tsx`, `frontend/src/ui/Banner.module.css`, `frontend/src/ui/PageLayout.tsx`, `frontend/src/ui/PageLayout.module.css`, `frontend/src/ui/Nav.tsx`, `frontend/src/ui/Nav.module.css`, `frontend/src/ui/index.ts`

**Interfaces:**
- Produces (all exported from `src/ui/index.ts`):
  - `Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; busy?: boolean })`. `type` defaults to `"button"`. `busy` disables the button and sets `aria-busy`.
  - `Field(props: { label: string; error?: string; hint?: string; children: (control: ControlProps) => ReactNode })` with `type ControlProps = { id: string; "aria-invalid": boolean; "aria-describedby"?: string }`.
  - `TextInput(props: InputHTMLAttributes<HTMLInputElement> & { adornment?: string; ref?: Ref<HTMLInputElement> })`.
  - `Table<T>(props: { label: string; columns: Column<T>[]; rows: readonly T[]; rowKey: (row: T) => string; rowMuted?: (row: T) => boolean; empty?: ReactNode })` with `type Column<T> = { header: string; cell: (row: T) => ReactNode; align?: "start" | "end" }`.
  - `Dialog(props: { open: boolean; title: string; onClose: () => void; children: ReactNode })` and `DialogActions(props: { children: ReactNode })`. Content renders only while open. Escape calls `onClose`.
  - `ConfirmDialog(props: { open: boolean; title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; tone?: "default" | "danger"; requireText?: string; busy?: boolean; error?: string | null })`. With `requireText`, the confirm button stays disabled until the typed text matches exactly. The typed text resets each time it opens.
  - `ToastProvider(props: { children: ReactNode })` and `useToast(): (message: string, options?: { tone?: "info" | "error"; action?: { label: string; onClick: () => void } }) => void`. Toasts close themselves after 6 s, or 10 s when they carry an action.
  - `Banner(props: { tone: "info" | "error"; children: ReactNode })`. Error banners have `role="alert"`.
  - `PageLayout(props: { title: string; actions?: ReactNode; children?: ReactNode })`. Renders `<main>` with an `<h1>`.
  - `Nav(props: { links: { to: string; label: string }[] })`. Renders `<nav aria-label="Principal">` with React Router `NavLink`s.

- [ ] **Step 1: Write the failing component tests**

`frontend/src/ui/Field.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { Field } from "./Field";
import { TextInput } from "./TextInput";

test("links the label, the hint and the error to the control", () => {
  render(
    <Field label="CPF do noivo" hint="Somente números ou com pontuação" error="CPF inválido">
      {(control) => <TextInput {...control} />}
    </Field>,
  );
  const input = screen.getByLabelText("CPF do noivo");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("Somente números ou com pontuação CPF inválido");
});

test("a field without an error is valid and shows the adornment", () => {
  render(
    <Field label="Valor">{(control) => <TextInput {...control} adornment="R$" />}</Field>,
  );
  expect(screen.getByLabelText("Valor")).toHaveAttribute("aria-invalid", "false");
  expect(screen.getByText("R$")).toBeInTheDocument();
});
```

`frontend/src/ui/ConfirmDialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>abrir</button>
      <ConfirmDialog
        open={open}
        title="Anonimizar cliente"
        confirmLabel="Anonimizar"
        tone="danger"
        requireText="ANONIMIZAR"
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      >
        <p>Esta ação não pode ser desfeita.</p>
      </ConfirmDialog>
    </>
  );
}

test("confirming requires the exact typed word", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  render(<Harness onConfirm={onConfirm} />);
  await user.click(screen.getByRole("button", { name: "abrir" }));

  const dialog = screen.getByRole("dialog", { name: "Anonimizar cliente" });
  expect(dialog).toHaveTextContent("Esta ação não pode ser desfeita.");
  const confirm = screen.getByRole("button", { name: "Anonimizar" });
  expect(confirm).toBeDisabled();

  await user.type(screen.getByLabelText("Digite ANONIMIZAR para confirmar"), "anonimizar");
  expect(confirm).toBeDisabled();
  await user.clear(screen.getByLabelText("Digite ANONIMIZAR para confirmar"));
  await user.type(screen.getByLabelText("Digite ANONIMIZAR para confirmar"), "ANONIMIZAR");
  await user.click(confirm);
  expect(onConfirm).toHaveBeenCalledOnce();
});

test("cancelling closes it and the typed word does not survive a reopen", async () => {
  const user = userEvent.setup();
  render(<Harness onConfirm={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "abrir" }));
  await user.type(screen.getByLabelText("Digite ANONIMIZAR para confirmar"), "ANONIMIZAR");
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "abrir" }));
  expect(screen.getByLabelText("Digite ANONIMIZAR para confirmar")).toHaveValue("");
});

test("shows an error and a busy confirm button", () => {
  render(
    <ConfirmDialog open title="Excluir" confirmLabel="Excluir" busy error="Falhou" onConfirm={vi.fn()} onCancel={vi.fn()}>
      <p>Excluir este contrato?</p>
    </ConfirmDialog>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Falhou");
  expect(screen.getByRole("button", { name: "Excluir" })).toBeDisabled();
});
```

`frontend/src/ui/Toast.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./Toast";

function Trigger({ onUndo }: { onUndo?: () => void }) {
  const notify = useToast();
  return (
    <button
      onClick={() =>
        notify("Contrato excluído", onUndo ? { action: { label: "Desfazer", onClick: onUndo } } : {})
      }
    >
      disparar
    </button>
  );
}

test("an action runs once and closes its toast", async () => {
  const user = userEvent.setup();
  const onUndo = vi.fn();
  render(
    <ToastProvider>
      <Trigger onUndo={onUndo} />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: "disparar" }));
  expect(screen.getByRole("status")).toHaveTextContent("Contrato excluído");
  await user.click(screen.getByRole("button", { name: "Desfazer" }));
  expect(onUndo).toHaveBeenCalledOnce();
  expect(screen.queryByText("Contrato excluído")).not.toBeInTheDocument();
});

test("a toast closes by itself, and the close button works", async () => {
  vi.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: "disparar" }));
  act(() => vi.advanceTimersByTime(5999));
  expect(screen.getByText("Contrato excluído")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByText("Contrato excluído")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "disparar" }));
  await user.click(screen.getByRole("button", { name: "Fechar aviso" }));
  expect(screen.queryByText("Contrato excluído")).not.toBeInTheDocument();
  vi.useRealTimers();
});

test("useToast outside the provider fails loudly", () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect(() => render(<Trigger />)).toThrow("useToast needs a ToastProvider");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/ui`
Expected: FAIL (modules missing).

- [ ] **Step 3: Write the tokens and global styles**

`frontend/src/ui/tokens.css`:

```css
/* Every visual value the interface uses. A redesign starts here. */
:root {
  --font-body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-size-sm: 0.875rem;
  --font-size-md: 1rem;
  --font-size-lg: 1.25rem;
  --font-size-xl: 1.75rem;
  --font-weight-regular: 400;
  --font-weight-strong: 600;
  --line-height: 1.5;

  --color-bg: #f7f6f3;
  --color-surface: #ffffff;
  --color-text: #1f1f1f;
  --color-text-muted: #6b6b6b;
  --color-border: #d9d6cf;
  --color-primary: #2f5d50;
  --color-primary-text: #ffffff;
  --color-danger: #a33a2c;
  --color-danger-text: #ffffff;
  --color-danger-bg: #fbecea;
  --color-info-bg: #eaf1ee;
  --color-focus: #3b82f6;
  --color-backdrop: rgb(0 0 0 / 40%);

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  --radius-sm: 4px;
  --radius-md: 8px;
  --shadow-raised: 0 4px 16px rgb(0 0 0 / 12%);
  --width-page: 72rem;
  --width-dialog: 32rem;
}
```

`frontend/src/ui/global.css`:

```css
@import "./tokens.css";

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--font-size-md);
  line-height: var(--line-height);
}

:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Write the components**

`frontend/src/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  busy?: boolean;
};

export function Button({ variant = "secondary", busy = false, type = "button", disabled, ...rest }: Props) {
  return (
    <button
      {...rest}
      type={type}
      className={`${styles.button} ${styles[variant] ?? ""}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    />
  );
}
```

`frontend/src/ui/Button.module.css`:

```css
.button {
  font: inherit;
  font-weight: var(--font-weight-strong);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}
.button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-primary-text);
}
.danger {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: var(--color-danger-text);
}
.ghost {
  background: transparent;
  border-color: transparent;
  padding: var(--space-1) var(--space-2);
}
```

`frontend/src/ui/Field.tsx`:

```tsx
import { type ReactNode, useId } from "react";
import styles from "./Field.module.css";

export type ControlProps = { id: string; "aria-invalid": boolean; "aria-describedby"?: string };

type Props = {
  label: string;
  error?: string;
  hint?: string;
  children: (control: ControlProps) => ReactNode;
};

export function Field({ label, error, hint, children }: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy || undefined })}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
```

`frontend/src/ui/Field.module.css`:

```css
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.label {
  font-weight: var(--font-weight-strong);
  font-size: var(--font-size-sm);
}
.hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
.error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}
```

`frontend/src/ui/TextInput.tsx`:

```tsx
import type { InputHTMLAttributes, Ref } from "react";
import styles from "./TextInput.module.css";

type Props = InputHTMLAttributes<HTMLInputElement> & { adornment?: string; ref?: Ref<HTMLInputElement> };

export function TextInput({ adornment, ref, ...rest }: Props) {
  const input = <input {...rest} ref={ref} className={styles.input} />;
  if (!adornment) return input;
  return (
    <span className={styles.group}>
      <span className={styles.adornment} aria-hidden="true">
        {adornment}
      </span>
      {input}
    </span>
  );
}
```

`frontend/src/ui/TextInput.module.css`:

```css
.input {
  font: inherit;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
}
.input[aria-invalid="true"] {
  border-color: var(--color-danger);
}
.input:disabled {
  background: var(--color-bg);
  color: var(--color-text-muted);
}
.group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.adornment {
  color: var(--color-text-muted);
}
```

`frontend/src/ui/Table.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./Table.module.css";

export type Column<T> = { header: string; cell: (row: T) => ReactNode; align?: "start" | "end" };

type Props<T> = {
  label: string;
  columns: Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  rowMuted?: (row: T) => boolean;
  empty?: ReactNode;
};

export function Table<T>({ label, columns, rows, rowKey, rowMuted, empty }: Props<T>) {
  if (rows.length === 0 && empty) return <div className={styles.empty}>{empty}</div>;
  return (
    <table className={styles.table} aria-label={label}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.header} scope="col" className={column.align === "end" ? styles.end : undefined}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} className={rowMuted?.(row) ? styles.muted : undefined}>
            {columns.map((column) => (
              <td key={column.header} className={column.align === "end" ? styles.end : undefined}>
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

`frontend/src/ui/Table.module.css`:

```css
.table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
  border-radius: var(--radius-md);
}
.table th,
.table td {
  text-align: start;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.table th {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.end {
  text-align: end;
}
.table th.end,
.table td.end {
  text-align: end;
}
.muted td {
  color: var(--color-text-muted);
}
.empty {
  padding: var(--space-8);
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-md);
}
```

`frontend/src/ui/Dialog.tsx`:

```tsx
import { type ReactNode, useEffect, useId, useRef } from "react";
import styles from "./Dialog.module.css";

type Props = { open: boolean; title: string; onClose: () => void; children: ReactNode };

export function Dialog({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape: let the owner decide, so React state stays the source of truth.
        event.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {children}
        </>
      )}
    </dialog>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}
```

`frontend/src/ui/Dialog.module.css`:

```css
.dialog {
  width: min(var(--width-dialog), 100%);
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-6);
  box-shadow: var(--shadow-raised);
  background: var(--color-surface);
  color: var(--color-text);
}
.dialog::backdrop {
  background: var(--color-backdrop);
}
.title {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-lg);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-6);
}
```

`frontend/src/ui/Banner.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./Banner.module.css";

export function Banner({ tone, children }: { tone: "info" | "error"; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`${styles.banner} ${styles[tone] ?? ""}`}>
      {children}
    </div>
  );
}
```

`frontend/src/ui/Banner.module.css`:

```css
.banner {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  margin: var(--space-4) 0;
}
.info {
  background: var(--color-info-bg);
}
.error {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}
```

`frontend/src/ui/ConfirmDialog.tsx`:

```tsx
import { type ReactNode, useState } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Dialog, DialogActions } from "./Dialog";
import { Field } from "./Field";
import { TextInput } from "./TextInput";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: "default" | "danger";
  requireText?: string;
  busy?: boolean;
  error?: string | null;
};

export function ConfirmDialog({ open, title, onCancel, ...body }: Props) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      {/* Mounted only while open, so the typed text starts empty every time. */}
      <ConfirmBody onCancel={onCancel} {...body} />
    </Dialog>
  );
}

function ConfirmBody({
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  tone = "default",
  requireText,
  busy = false,
  error = null,
}: Omit<Props, "open" | "title">) {
  const [typed, setTyped] = useState("");
  const ready = requireText === undefined || typed === requireText;
  return (
    <>
      {children}
      {requireText !== undefined && (
        <Field label={`Digite ${requireText} para confirmar`}>
          {(control) => (
            <TextInput {...control} value={typed} autoComplete="off" onChange={(event) => setTyped(event.target.value)} />
          )}
        </Field>
      )}
      {error && <Banner tone="error">{error}</Banner>}
      <DialogActions>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={!ready} busy={busy}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </>
  );
}
```

`frontend/src/ui/Toast.tsx`:

```tsx
import { type ReactNode, createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "./Button";
import styles from "./Toast.module.css";

type ToastOptions = { tone?: "info" | "error"; action?: { label: string; onClick: () => void } };
type Notify = (message: string, options?: ToastOptions) => void;
type ToastItem = ToastOptions & { id: number; message: string };

const ToastContext = createContext<Notify | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback<Notify>(
    (message, options = {}) => {
      nextId.current += 1;
      const id = nextId.current;
      setItems((current) => [...current, { id, message, ...options }]);
      setTimeout(() => dismiss(id), options.action ? 10_000 : 6_000);
    },
    [dismiss],
  );

  return (
    <ToastContext value={notify}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`${styles.toast} ${item.tone === "error" ? styles.error : ""}`}>
            <span>{item.message}</span>
            {item.action && (
              <Button
                variant="ghost"
                onClick={() => {
                  dismiss(item.id);
                  item.action?.onClick();
                }}
              >
                {item.action.label}
              </Button>
            )}
            <Button variant="ghost" aria-label="Fechar aviso" onClick={() => dismiss(item.id)}>
              ×
            </Button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (notify === null) throw new Error("useToast needs a ToastProvider");
  return notify;
}
```

`frontend/src/ui/Toast.module.css`:

```css
.region {
  position: fixed;
  right: var(--space-6);
  bottom: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  z-index: 10;
}
.toast {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-raised);
}
.error {
  border-color: var(--color-danger);
  color: var(--color-danger);
}
```

`frontend/src/ui/PageLayout.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./PageLayout.module.css";

type Props = { title: string; actions?: ReactNode; children?: ReactNode };

export function PageLayout({ title, actions, children }: Props) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      {children}
    </main>
  );
}
```

`frontend/src/ui/PageLayout.module.css`:

```css
.page {
  max-width: var(--width-page);
  margin: 0 auto;
  padding: var(--space-6) var(--space-6) var(--space-8);
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
.title {
  margin: 0;
  font-size: var(--font-size-xl);
}
.actions {
  display: flex;
  gap: var(--space-2);
}
```

`frontend/src/ui/Nav.tsx`:

```tsx
import { NavLink } from "react-router";
import styles from "./Nav.module.css";

type Props = { links: { to: string; label: string }[] };

export function Nav({ links }: Props) {
  return (
    <nav aria-label="Principal" className={styles.nav}>
      <span className={styles.brand}>Gerenciador Fotografia</span>
      <ul className={styles.links}>
        {links.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to} className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

`frontend/src/ui/Nav.module.css`:

```css
.nav {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-3) var(--space-6);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.brand {
  font-weight: var(--font-weight-strong);
}
.links {
  display: flex;
  gap: var(--space-4);
  list-style: none;
  margin: 0;
  padding: 0;
}
.link {
  color: var(--color-text-muted);
  text-decoration: none;
}
.active {
  color: var(--color-primary);
  font-weight: var(--font-weight-strong);
}
```

`frontend/src/ui/index.ts`:

```ts
export { Banner } from "./Banner";
export { Button } from "./Button";
export { ConfirmDialog } from "./ConfirmDialog";
export { Dialog, DialogActions } from "./Dialog";
export { Field, type ControlProps } from "./Field";
export { Nav } from "./Nav";
export { PageLayout } from "./PageLayout";
export { Table, type Column } from "./Table";
export { TextInput } from "./TextInput";
export { ToastProvider, useToast } from "./Toast";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/ui && npm run lint && npm run typecheck`
Expected: PASS. If `react-hooks` lint flags the `ToastContext` provider syntax, keep `<ToastContext value>` (React 19) and check that `@types/react` is 19.

- [ ] **Step 6: Verify no literal visual values outside `tokens.css`**

Run: `grep -nE '#[0-9a-fA-F]{3,6}\b|[0-9]+px|rgb\(' frontend/src/ui/*.module.css frontend/src/ui/global.css`
Expected: the only matches are `1px` border widths and the `2px` focus outline. Those widths are the one allowed exception. Any other match moves into `tokens.css` as a token.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/ui
git commit -m "feat: add the design-token UI layer"
```

---

### Task 6: App shell, routing and the unexpected-error toast

**Files:**
- Create: `frontend/src/app/queryClient.ts`, `frontend/src/app/queryClient.test.ts`, `frontend/src/app/App.tsx`, `frontend/src/app/routes.tsx`, `frontend/src/app/NotFoundPage.tsx`, `frontend/src/app/App.test.tsx`, `frontend/src/test/render.tsx`, `frontend/src/test/fixtures.ts`, `frontend/src/features/contracts/ContractListPage.tsx` (placeholder), `frontend/src/features/contracts/ContractFormPage.tsx` (placeholder), `frontend/src/features/clients/ClientListPage.tsx` (placeholder)
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: `ApiError` (Task 4); `ToastProvider`, `useToast`, `Nav`, `PageLayout` (Task 5).
- Produces:
  - `makeQueryClient(onUnexpected: (message: string) => void, retry?: boolean): QueryClient`.
  - `isUnexpected(error: unknown): boolean` — true for non-`ApiError`s and for status 0, 400, 403 and ≥ 500.
  - `describeUnexpected(error: unknown): string` — for example `"Erro no servidor. Código: req-1"`.
  - `AppProviders(props: { children: ReactNode; retry?: boolean })` — `ToastProvider` around a `QueryClientProvider`.
  - `routes: RouteObject[]`. The form route renders `<ContractFormPage key={id ?? "novo"} id={id} />`, so moving from one contract to another remounts the form.
  - Placeholder pages with final signatures: `ContractListPage()`, `ContractFormPage(props: { id?: string })`, `ClientListPage()`. Tasks 7, 9 and 11 replace their bodies.
  - `renderApp(path: string): RenderResult & { user: UserEvent; router: ReturnType<typeof createMemoryRouter> }`.
  - Fixtures: `IDS`, `makeClient(overrides?)`, `makeContract(overrides?)`, `page(items, nextCursor?)`, `problem(status, detail, extra?)`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/app/queryClient.test.ts`:

```ts
import { ApiError } from "../api/client";
import { describeUnexpected, isUnexpected, makeQueryClient } from "./queryClient";

const apiError = (status: number) =>
  new ApiError(status, { title: "x", detail: "y", request_id: `req-${status}` });

test.each([0, 400, 403, 500, 503])("status %i is unexpected", (status) => {
  expect(isUnexpected(apiError(status))).toBe(true);
});

test.each([404, 409, 412, 422, 428])("status %i is handled by the page", (status) => {
  expect(isUnexpected(apiError(status))).toBe(false);
});

test("messages are Portuguese and carry the request id", () => {
  expect(describeUnexpected(apiError(500))).toBe("Erro no servidor. Código: req-500");
  expect(describeUnexpected(apiError(403))).toBe("O servidor recusou o pedido. Código: req-403");
  expect(describeUnexpected(new ApiError(0, null))).toBe("Sem conexão com o servidor.");
  expect(describeUnexpected(new Error("bug"))).toBe("Erro inesperado. Recarregue a página.");
});

test("failed queries report only unexpected errors", async () => {
  const onUnexpected = vi.fn();
  const client = makeQueryClient(onUnexpected, false);
  await expect(
    client.fetchQuery({ queryKey: ["a"], queryFn: () => Promise.reject(apiError(500)) }),
  ).rejects.toBeInstanceOf(ApiError);
  await expect(
    client.fetchQuery({ queryKey: ["b"], queryFn: () => Promise.reject(apiError(404)) }),
  ).rejects.toBeInstanceOf(ApiError);
  expect(onUnexpected).toHaveBeenCalledOnce();
  expect(onUnexpected).toHaveBeenCalledWith("Erro no servidor. Código: req-500");
});
```

`frontend/src/app/App.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { page } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

beforeEach(() => {
  server.use(
    http.get("/api/v1/contracts", () => HttpResponse.json(page([]))),
    http.get("/api/v1/clients", () => HttpResponse.json(page([]))),
  );
});

test("the root redirects to the contract list", async () => {
  const { router } = renderApp("/");
  expect(await screen.findByRole("heading", { level: 1, name: "Contratos" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/contratos");
});

test("the nav moves between contracts and clients", async () => {
  const { user, router } = renderApp("/contratos");
  const nav = screen.getByRole("navigation", { name: "Principal" });
  await user.click(screen.getByRole("link", { name: "Clientes" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Clientes" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/clientes");
  expect(nav).toBeInTheDocument();
});

test("an unknown path shows a not-found page with a way back", async () => {
  const { user, router } = renderApp("/nada-aqui");
  expect(screen.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "Ir para contratos" }));
  expect(router.state.location.pathname).toBe("/contratos");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/app`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement the query client**

`frontend/src/app/queryClient.ts`:

```ts
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";

export function isUnexpected(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status === 0 || error.status === 400 || error.status === 403 || error.status >= 500;
}

function headline(status: number): string {
  if (status === 0) return "Sem conexão com o servidor";
  if (status >= 500) return "Erro no servidor";
  return "O servidor recusou o pedido";
}

export function describeUnexpected(error: unknown): string {
  if (!(error instanceof ApiError)) return "Erro inesperado. Recarregue a página.";
  const code = error.requestId ? ` Código: ${error.requestId}` : "";
  return `${headline(error.status)}.${code}`;
}

export function makeQueryClient(onUnexpected: (message: string) => void, retry = true): QueryClient {
  const report = (error: unknown) => {
    if (isUnexpected(error)) onUnexpected(describeUnexpected(error));
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: report }),
    mutationCache: new MutationCache({ onError: report }),
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // One retry, only for failures a retry can fix.
        retry: retry
          ? (count, error) =>
              count < 1 && error instanceof ApiError && (error.status === 0 || error.status >= 500)
          : false,
      },
      mutations: { retry: false },
    },
  });
}
```

- [ ] **Step 4: Implement the placeholders, routes, providers and entry point**

`frontend/src/features/contracts/ContractListPage.tsx` (replaced in Task 7):

```tsx
import { PageLayout } from "../../ui";

export function ContractListPage() {
  return <PageLayout title="Contratos" />;
}
```

`frontend/src/features/contracts/ContractFormPage.tsx` (replaced in Task 9):

```tsx
import { PageLayout } from "../../ui";

export function ContractFormPage({ id }: { id?: string }) {
  return <PageLayout title={id ? "Editar contrato" : "Novo contrato"} />;
}
```

`frontend/src/features/clients/ClientListPage.tsx` (replaced in Task 11):

```tsx
import { PageLayout } from "../../ui";

export function ClientListPage() {
  return <PageLayout title="Clientes" />;
}
```

`frontend/src/app/NotFoundPage.tsx`:

```tsx
import { Link } from "react-router";
import { PageLayout } from "../ui";

export function NotFoundPage() {
  return (
    <PageLayout title="Página não encontrada">
      <p>
        <Link to="/contratos">Ir para contratos</Link>
      </p>
    </PageLayout>
  );
}
```

`frontend/src/app/routes.tsx`:

```tsx
import { Navigate, Outlet, type RouteObject, useParams } from "react-router";
import { ClientListPage } from "../features/clients/ClientListPage";
import { ContractFormPage } from "../features/contracts/ContractFormPage";
import { ContractListPage } from "../features/contracts/ContractListPage";
import { Nav } from "../ui";
import { NotFoundPage } from "./NotFoundPage";

const LINKS = [
  { to: "/contratos", label: "Contratos" },
  { to: "/clientes", label: "Clientes" },
];

function AppShell() {
  return (
    <>
      <Nav links={LINKS} />
      <Outlet />
    </>
  );
}

function ContractFormRoute() {
  const { id } = useParams();
  return <ContractFormPage key={id ?? "novo"} id={id} />;
}

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/contratos" replace /> },
      { path: "contratos", element: <ContractListPage /> },
      { path: "contratos/novo", element: <ContractFormRoute /> },
      { path: "contratos/:id", element: <ContractFormRoute /> },
      { path: "clientes", element: <ClientListPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
```

React Router ranks the static `contratos/novo` above `contratos/:id`, so `/contratos/novo` never reaches the edit route.

`frontend/src/app/App.tsx`:

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { RouterProvider, createBrowserRouter } from "react-router";
import { ToastProvider, useToast } from "../ui";
import { makeQueryClient } from "./queryClient";
import { routes } from "./routes";

function QueryLayer({ children, retry }: { children: ReactNode; retry: boolean }) {
  const notify = useToast();
  const [client] = useState(() => makeQueryClient((message) => notify(message, { tone: "error" }), retry));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function AppProviders({ children, retry = true }: { children: ReactNode; retry?: boolean }) {
  return (
    <ToastProvider>
      <QueryLayer retry={retry}>{children}</QueryLayer>
    </ToastProvider>
  );
}

export function App() {
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
```

`frontend/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./ui/global.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`frontend/src/test/render.tsx`:

```tsx
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { AppProviders } from "../app/App";
import { routes } from "../app/routes";

export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const view = render(
    <AppProviders retry={false}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, user, router };
}
```

`frontend/src/test/fixtures.ts`:

```ts
import { HttpResponse } from "msw";
import type { ClientOut, ContractOut } from "../api/client";

export const IDS = {
  contract: "6f1c0a52-1111-4000-8000-000000000001",
  groom: "6f1c0a52-2222-4000-8000-000000000002",
  bride: "6f1c0a52-3333-4000-8000-000000000003",
};

const STAMP = "2026-10-13T12:00:00Z";

export function makeClient(overrides: Partial<ClientOut> = {}): ClientOut {
  return {
    id: IDS.groom,
    full_name: "Bruno Costa",
    cpf: "123.456.789-09",
    address: "Rua das Flores 100",
    created_at: STAMP,
    updated_at: STAMP,
    anonymised_at: null,
    ...overrides,
  };
}

export function makeContract(overrides: Partial<ContractOut> = {}): ContractOut {
  return {
    id: IDS.contract,
    groom: makeClient(),
    bride: makeClient({ id: IDS.bride, full_name: "Ana Lima", cpf: "987.654.321-00" }),
    couple_address: "Rua das Flores 100",
    event: {
      date: "2027-03-14",
      venue_name: "Igreja Matriz",
      venue_address: null,
      coverage_start: "16:00:00",
      coverage_end: null,
      hours_contracted: null,
    },
    photographer_count: 2,
    payment: {
      items: [
        { description: "Cobertura da cerimônia na igreja", amount_cents: 120000 },
        { description: "Diária segundo fotógrafo", amount_cents: 50000 },
      ],
      pix_discount_cents: 30000,
      total_cents: 140000,
    },
    signing: { city: "Curitiba", date: "2026-10-13" },
    version: 1,
    created_at: STAMP,
    updated_at: STAMP,
    deleted_at: null,
    ...overrides,
  };
}

export function page<T>(items: T[], nextCursor: string | null = null) {
  return { items, next_cursor: nextCursor };
}

export function problem(status: number, detail: string, extra: Record<string, unknown> = {}) {
  return HttpResponse.json(
    { type: "about:blank", title: "Problem", status, detail, request_id: `req-${status}`, ...extra },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}
```

If `typecheck` reports a mismatch between these fixtures and `ContractOut`/`ClientOut` in `schema.d.ts`, the schema wins: change the fixture field, never the generated file.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Check the built app in a browser under the real CSP**

Run (repository root): `make build && make run` (needs a filled `.env`), open <http://127.0.0.1:8000/contratos>, then reload the page.
Expected: the nav and the "Contratos" heading render after the reload, styled, and the browser console shows no CSP violation. Stop the server with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat: add the app shell, routes and unexpected-error toasts"
```

---

### Task 7: Contract hooks and the contract list

**Files:**
- Create: `frontend/src/api/contracts.ts`, `frontend/src/domain/dates.ts`, `frontend/src/domain/dates.test.ts`, `frontend/src/features/contracts/names.ts`, `frontend/src/features/contracts/names.test.ts`, `frontend/src/features/contracts/messages.ts`, `frontend/src/features/contracts/ContractListPage.test.tsx`, `frontend/src/ui/Checkbox.tsx`, `frontend/src/ui/Checkbox.module.css`
- Modify: `frontend/src/features/contracts/ContractListPage.tsx` (replace the placeholder), `frontend/src/ui/index.ts` (export `Checkbox`)

**Interfaces:**
- Consumes: `api`, `send`, `unwrap`, `ApiError`, `ContractOut`, `ContractCreate`, `ContractPatch` (Task 4); `saveBlob` (Task 4); `filenameFromDisposition` (Task 4); `formatBrl` (Task 3); `ui` components (Task 5); fixtures and `renderApp` (Task 6).
- Produces:
  - `src/api/contracts.ts`:
    - `contractKeys = { all: ["contracts"], list(includeDeleted: boolean), one(id: string) }`
    - `useContracts(includeDeleted: boolean)` — infinite query, page size 20, `getNextPageParam` from `next_cursor`.
    - `useContract(id: string)` — query for one contract.
    - `useCreateContract()` — mutation `(body: ContractCreate) => Promise<ContractOut>`. Stores the result under `one(id)` and invalidates lists.
    - `useUpdateContract(id: string)` — mutation `({ version, body }: { version: number; body: ContractPatch }) => Promise<ContractOut>`. Sends `If-Match: "<version>"`, stores the result and invalidates lists.
    - `useDeleteContract()` — mutation `(id: string) => Promise<void>`.
    - `useRestoreContract()` — mutation `(id: string) => Promise<ContractOut>`.
    - `downloadContractPdf(id: string): Promise<void>` — saves the PDF under the server's file name, falling back to `contrato-<id>.pdf`.
    - `useDownloadPdf()` — mutation wrapping `downloadContractPdf`.
  - `src/domain/dates.ts`: `formatIsoDate(iso: string): string` (`"2027-03-14"` → `"14/03/2027"`), `todayIso(now?: Date): string` (local date, `YYYY-MM-DD`).
  - `src/features/contracts/names.ts`: `coupleLabel(groom: { full_name: string | null }, bride: { full_name: string | null }): string` — `"Bruno & Ana"` from first names.
  - `src/features/contracts/messages.ts`: `RESTORE_CONFLICT`, `NOT_FOUND_IN_LIST`.
  - `Checkbox(props: { label: string; checked: boolean; onChange: (checked: boolean) => void })` in `ui/`.

- [ ] **Step 1: Write the failing pure tests**

`frontend/src/domain/dates.test.ts`:

```ts
import { formatIsoDate, todayIso } from "./dates";

test("formats an ISO date the Brazilian way", () => {
  expect(formatIsoDate("2027-03-14")).toBe("14/03/2027");
});

test("today is the local calendar date", () => {
  expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  expect(todayIso(new Date(2026, 11, 31, 0, 1))).toBe("2026-12-31");
});
```

`frontend/src/features/contracts/names.test.ts`:

```ts
import { coupleLabel } from "./names";

test("joins the first names", () => {
  expect(coupleLabel({ full_name: "Bruno Costa" }, { full_name: "  Ana  Lima " })).toBe("Bruno & Ana");
});

test("names an anonymised person without inventing a name", () => {
  expect(coupleLabel({ full_name: null }, { full_name: "Ana Lima" })).toBe("Cliente anonimizado & Ana");
  expect(coupleLabel({ full_name: null }, { full_name: null })).toBe("Clientes anonimizados");
});
```

- [ ] **Step 2: Run them to verify they fail, then implement**

Run: `npx vitest run src/domain/dates.test.ts src/features/contracts/names.test.ts`
Expected: FAIL (modules missing).

`frontend/src/domain/dates.ts`:

```ts
export function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
```

`frontend/src/features/contracts/names.ts`:

```ts
type Person = { full_name: string | null };

const ANONYMISED = "Cliente anonimizado";

function firstName(person: Person): string {
  if (!person.full_name) return ANONYMISED;
  return person.full_name.trim().split(/\s+/)[0] ?? ANONYMISED;
}

export function coupleLabel(groom: Person, bride: Person): string {
  if (!groom.full_name && !bride.full_name) return "Clientes anonimizados";
  return `${firstName(groom)} & ${firstName(bride)}`;
}
```

`frontend/src/features/contracts/messages.ts`:

```ts
export const RESTORE_CONFLICT =
  "Não é possível restaurar: um dos clientes deste contrato foi anonimizado.";
export const NOT_FOUND_IN_LIST = "Este contrato não existe mais. A lista foi atualizada.";
```

Run the two test files again. Expected: PASS.

- [ ] **Step 3: Write the failing list page tests**

`frontend/src/features/contracts/ContractListPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { IDS, makeClient, makeContract, page, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const SECOND_ID = "6f1c0a52-1111-4000-8000-000000000099";
const second = makeContract({
  id: SECOND_ID,
  groom: makeClient({ id: "g2", full_name: "Caio Reis" }),
  bride: makeClient({ id: "b2", full_name: "Duda Melo" }),
  event: { ...makeContract().event, date: "2027-05-01", venue_name: "Chácara Sol" },
  payment: { items: [{ description: "Cerimônia", amount_cents: 99000 }], pix_discount_cents: null, total_cents: 99000 },
});

function row(name: RegExp) {
  return screen.getByRole("row", { name });
}

test("lists couple, event date, venue and total", async () => {
  server.use(http.get("/api/v1/contracts", () => HttpResponse.json(page([makeContract()]))));
  renderApp("/contratos");
  const contract = await screen.findByRole("row", { name: /Bruno & Ana/ });
  expect(contract).toHaveTextContent("14/03/2027");
  expect(contract).toHaveTextContent("Igreja Matriz");
  expect(contract).toHaveTextContent("R$ 1.400,00");
});

test("an empty list offers a new contract", async () => {
  server.use(http.get("/api/v1/contracts", () => HttpResponse.json(page([]))));
  const { user, router } = renderApp("/contratos");
  expect(await screen.findByText("Nenhum contrato ainda")).toBeInTheDocument();
  const buttons = screen.getAllByRole("button", { name: "Novo contrato" });
  await user.click(buttons[buttons.length - 1]!);
  expect(router.state.location.pathname).toBe("/contratos/novo");
});

test("Carregar mais fetches the next page", async () => {
  server.use(
    http.get("/api/v1/contracts", ({ request }) => {
      const cursor = new URL(request.url).searchParams.get("cursor");
      return HttpResponse.json(cursor === "c2" ? page([second]) : page([makeContract()], "c2"));
    }),
  );
  const { user } = renderApp("/contratos");
  await screen.findByRole("row", { name: /Bruno & Ana/ });
  await user.click(screen.getByRole("button", { name: "Carregar mais" }));
  expect(await screen.findByRole("row", { name: /Caio & Duda/ })).toBeInTheDocument();
  expect(screen.getByRole("row", { name: /Bruno & Ana/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Carregar mais" })).not.toBeInTheDocument();
});

test("Excluir asks first, deletes, and Desfazer restores", async () => {
  let deleted = false;
  const restored = vi.fn();
  server.use(
    http.get("/api/v1/contracts", () => HttpResponse.json(page(deleted ? [] : [makeContract()]))),
    http.delete("/api/v1/contracts/:id", () => {
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("/api/v1/contracts/:id/restore", ({ params }) => {
      restored(params.id);
      deleted = false;
      return HttpResponse.json(makeContract());
    }),
  );
  const { user } = renderApp("/contratos");
  await screen.findByRole("row", { name: /Bruno & Ana/ });

  await user.click(within(row(/Bruno & Ana/)).getByRole("button", { name: "Excluir" }));
  const dialog = screen.getByRole("dialog", { name: "Excluir contrato" });
  await user.click(within(dialog).getByRole("button", { name: "Excluir" }));

  await waitFor(() => expect(screen.queryByRole("row", { name: /Bruno & Ana/ })).not.toBeInTheDocument());
  expect(screen.getByText("Contrato excluído")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Desfazer" }));
  expect(await screen.findByRole("row", { name: /Bruno & Ana/ })).toBeInTheDocument();
  expect(restored).toHaveBeenCalledWith(IDS.contract);
});

test("Mostrar excluídos lists deleted contracts with Restaurar, and explains a refused restore", async () => {
  const deletedContract = makeContract({ deleted_at: "2026-10-14T10:00:00Z" });
  server.use(
    http.get("/api/v1/contracts", ({ request }) => {
      const include = new URL(request.url).searchParams.get("include_deleted") === "true";
      return HttpResponse.json(page(include ? [deletedContract] : []));
    }),
    http.post("/api/v1/contracts/:id/restore", () =>
      problem(409, "a client of this contract has been anonymised"),
    ),
  );
  const { user } = renderApp("/contratos");
  await screen.findByText("Nenhum contrato ainda");
  await user.click(screen.getByLabelText("Mostrar excluídos"));

  const deletedRow = await screen.findByRole("row", { name: /Bruno & Ana/ });
  expect(deletedRow).toHaveTextContent("Excluído");
  expect(within(deletedRow).queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
  await user.click(within(deletedRow).getByRole("button", { name: "Restaurar" }));
  expect(
    await screen.findByText("Não é possível restaurar: um dos clientes deste contrato foi anonimizado."),
  ).toBeInTheDocument();
});

test("Baixar PDF saves the file under the server's name", async () => {
  const clicked: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
  server.use(
    http.get("/api/v1/contracts", () => HttpResponse.json(page([makeContract()]))),
    http.get("/api/v1/contracts/:id/pdf", () =>
      new HttpResponse(new Blob(["%PDF-1.7"]), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="contrato-bruno-ana-2027-03-14.pdf"',
        },
      }),
    ),
  );
  const { user } = renderApp("/contratos");
  await screen.findByRole("row", { name: /Bruno & Ana/ });
  await user.click(within(row(/Bruno & Ana/)).getByRole("button", { name: "Baixar PDF" }));
  await waitFor(() => expect(clicked).toHaveLength(1));
  expect(clicked[0]!.download).toBe("contrato-bruno-ana-2027-03-14.pdf");
});

test("Editar opens the contract", async () => {
  server.use(
    http.get("/api/v1/contracts", () => HttpResponse.json(page([makeContract()]))),
    http.get("/api/v1/contracts/:id", () => HttpResponse.json(makeContract())),
  );
  const { user, router } = renderApp("/contratos");
  await screen.findByRole("row", { name: /Bruno & Ana/ });
  await user.click(within(row(/Bruno & Ana/)).getByRole("button", { name: "Editar" }));
  expect(router.state.location.pathname).toBe(`/contratos/${IDS.contract}`);
});

test("a failed load says so and offers a retry", async () => {
  let fail = true;
  server.use(
    http.get("/api/v1/contracts", () => (fail ? problem(500, "boom") : HttpResponse.json(page([makeContract()])))),
  );
  const { user } = renderApp("/contratos");
  expect(await screen.findByText("Não foi possível carregar os contratos.")).toBeInTheDocument();
  expect(screen.getByText("Erro no servidor. Código: req-500")).toBeInTheDocument();
  fail = false;
  await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
  expect(await screen.findByRole("row", { name: /Bruno & Ana/ })).toBeInTheDocument();
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run src/features/contracts/ContractListPage.test.tsx`
Expected: FAIL. The placeholder renders no rows.

- [ ] **Step 5: Implement the hooks**

`frontend/src/api/contracts.ts`:

```ts
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { filenameFromDisposition } from "../domain/filename";
import { type ContractCreate, type ContractOut, type ContractPatch, api, send, unwrap } from "./client";
import { saveBlob } from "./download";

const PAGE_SIZE = 20;

export const contractKeys = {
  all: ["contracts"] as const,
  list: (includeDeleted: boolean) => ["contracts", { includeDeleted }] as const,
  one: (id: string) => ["contract", id] as const,
};

const path = (id: string) => ({ path: { contract_id: id } });

export function useContracts(includeDeleted: boolean) {
  return useInfiniteQuery({
    queryKey: contractKeys.list(includeDeleted),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/contracts", {
          params: {
            query: { limit: PAGE_SIZE, include_deleted: includeDeleted, ...(pageParam ? { cursor: pageParam } : {}) },
          },
        }),
      ),
    getNextPageParam: (last) => last.next_cursor,
  });
}

export function useContract(id: string) {
  return useQuery({
    queryKey: contractKeys.one(id),
    queryFn: () => unwrap(api.GET("/api/v1/contracts/{contract_id}", { params: path(id) })),
  });
}

function useStoreContract() {
  const client = useQueryClient();
  return (contract: ContractOut) => {
    client.setQueryData(contractKeys.one(contract.id), contract);
    return client.invalidateQueries({ queryKey: contractKeys.all });
  };
}

export function useCreateContract() {
  const store = useStoreContract();
  return useMutation({
    mutationFn: (body: ContractCreate) => unwrap(api.POST("/api/v1/contracts", { body })),
    onSuccess: store,
  });
}

export function useUpdateContract(id: string) {
  const store = useStoreContract();
  return useMutation({
    mutationFn: ({ version, body }: { version: number; body: ContractPatch }) =>
      unwrap(
        api.PATCH("/api/v1/contracts/{contract_id}", {
          params: { ...path(id), header: { "if-match": `"${version}"` } },
          body,
        }),
      ),
    onSuccess: store,
  });
}

export function useDeleteContract() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/api/v1/contracts/{contract_id}", { params: path(id) })),
    onSuccess: (_data, id) =>
      Promise.all([
        client.invalidateQueries({ queryKey: contractKeys.all }),
        client.invalidateQueries({ queryKey: contractKeys.one(id) }),
      ]),
  });
}

export function useRestoreContract() {
  const store = useStoreContract();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/api/v1/contracts/{contract_id}/restore", { params: path(id) })),
    onSuccess: store,
  });
}

export async function downloadContractPdf(id: string): Promise<void> {
  const { data, response } = await send(
    api.GET("/api/v1/contracts/{contract_id}/pdf", { params: path(id), parseAs: "blob" }),
  );
  const name = filenameFromDisposition(response.headers.get("Content-Disposition"), `contrato-${id}.pdf`);
  saveBlob(data as Blob, name);
}

export function useDownloadPdf() {
  return useMutation({ mutationFn: downloadContractPdf });
}
```

If `typecheck` rejects `header: { "if-match": ... }`, read the PATCH operation's `parameters.header` in `schema.d.ts` and match its key exactly. The backend names the header parameter `if-match`.

- [ ] **Step 6: Implement the checkbox and the page**

`frontend/src/ui/Checkbox.tsx`:

```tsx
import { useId } from "react";
import styles from "./Checkbox.module.css";

type Props = { label: string; checked: boolean; onChange: (checked: boolean) => void };

export function Checkbox({ label, checked, onChange }: Props) {
  const id = useId();
  return (
    <span className={styles.checkbox}>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </span>
  );
}
```

`frontend/src/ui/Checkbox.module.css`:

```css
.checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
}
```

Add `export { Checkbox } from "./Checkbox";` to `frontend/src/ui/index.ts`.

`frontend/src/features/contracts/ContractListPage.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { ApiError, type ContractOut } from "../../api/client";
import { useContracts, useDeleteContract, useDownloadPdf, useRestoreContract } from "../../api/contracts";
import { formatIsoDate } from "../../domain/dates";
import { formatBrl } from "../../domain/money";
import { Banner, Button, Checkbox, type Column, ConfirmDialog, PageLayout, Table, useToast } from "../../ui";
import styles from "./ContractListPage.module.css";
import { NOT_FOUND_IN_LIST, RESTORE_CONFLICT } from "./messages";
import { coupleLabel } from "./names";

export function ContractListPage() {
  const navigate = useNavigate();
  const notify = useToast();
  const [showDeleted, setShowDeleted] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ContractOut | null>(null);
  const contracts = useContracts(showDeleted);
  const remove = useDeleteContract();
  const restore = useRestoreContract();
  const pdf = useDownloadPdf();

  const rows = contracts.data?.pages.flatMap((result) => result.items) ?? [];

  const handleKnownError = (error: unknown) => {
    if (!(error instanceof ApiError)) return;
    if (error.status === 409) notify(RESTORE_CONFLICT, { tone: "error" });
    if (error.status === 404) notify(NOT_FOUND_IN_LIST, { tone: "error" });
  };

  const restoreContract = (id: string) =>
    restore.mutate(id, { onSuccess: () => notify("Contrato restaurado"), onError: handleKnownError });

  const confirmDelete = () => {
    const target = pendingDelete;
    if (!target) return;
    remove.mutate(target.id, {
      onSuccess: () =>
        notify("Contrato excluído", { action: { label: "Desfazer", onClick: () => restoreContract(target.id) } }),
      onError: handleKnownError,
      onSettled: () => setPendingDelete(null),
    });
  };

  const newContract = (
    <Button variant="primary" onClick={() => navigate("/contratos/novo")}>
      Novo contrato
    </Button>
  );

  const columns: Column<ContractOut>[] = [
    {
      header: "Casal",
      cell: (contract) => (
        <>
          {coupleLabel(contract.groom, contract.bride)}
          {contract.deleted_at && <span className={styles.tag}> · Excluído</span>}
        </>
      ),
    },
    { header: "Data do evento", cell: (contract) => formatIsoDate(contract.event.date) },
    { header: "Local", cell: (contract) => contract.event.venue_name },
    { header: "Total", align: "end", cell: (contract) => formatBrl(contract.payment.total_cents) },
    {
      header: "Ações",
      align: "end",
      cell: (contract) =>
        contract.deleted_at ? (
          <Button onClick={() => restoreContract(contract.id)} busy={restore.isPending && restore.variables === contract.id}>
            Restaurar
          </Button>
        ) : (
          <span className={styles.actions}>
            <Button onClick={() => navigate(`/contratos/${contract.id}`)}>Editar</Button>
            <Button onClick={() => pdf.mutate(contract.id)} busy={pdf.isPending && pdf.variables === contract.id}>
              Baixar PDF
            </Button>
            <Button variant="danger" onClick={() => setPendingDelete(contract)}>
              Excluir
            </Button>
          </span>
        ),
    },
  ];

  return (
    <PageLayout title="Contratos" actions={newContract}>
      <div className={styles.toolbar}>
        <Checkbox label="Mostrar excluídos" checked={showDeleted} onChange={setShowDeleted} />
      </div>
      {contracts.isPending && <p>Carregando…</p>}
      {contracts.isError && (
        <Banner tone="error">
          Não foi possível carregar os contratos.{" "}
          <Button onClick={() => void contracts.refetch()}>Tentar de novo</Button>
        </Banner>
      )}
      {contracts.isSuccess && (
        <Table
          label="Contratos"
          columns={columns}
          rows={rows}
          rowKey={(contract) => contract.id}
          rowMuted={(contract) => contract.deleted_at !== null}
          empty={
            <>
              <p>Nenhum contrato ainda</p>
              {newContract}
            </>
          }
        />
      )}
      {contracts.hasNextPage && (
        <div className={styles.more}>
          <Button onClick={() => void contracts.fetchNextPage()} busy={contracts.isFetchingNextPage}>
            Carregar mais
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Excluir contrato"
        confirmLabel="Excluir"
        tone="danger"
        busy={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        <p>
          O contrato de {pendingDelete ? coupleLabel(pendingDelete.groom, pendingDelete.bride) : ""} será excluído.
          Você pode restaurá-lo depois em "Mostrar excluídos".
        </p>
      </ConfirmDialog>
    </PageLayout>
  );
}
```

Create `frontend/src/features/contracts/ContractListPage.module.css` (layout only):

```css
.toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-3);
}
.actions {
  display: inline-flex;
  gap: var(--space-2);
}
.more {
  display: flex;
  justify-content: center;
  margin-top: var(--space-4);
}
.tag {
  font-size: var(--font-size-sm);
}
```

`.tag` sets a font size, not a colour, so it stays within the layout-plus-tokens rule. The muted colour comes from `Table`'s `rowMuted`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/features/contracts src/app && npm run lint && npm run typecheck`
Expected: PASS. If the "Nenhum contrato ainda" test finds a single "Novo contrato" button, the empty state must render its own `newContract`, as written above.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat: list, delete, restore and download contracts"
```

---

### Task 8: The contract form model

Everything the form does that is not React: the shape of its values, defaults, conversion to and from the API, validation mirroring the backend, and which error paths belong to an input.

The form holds text for every input, including money and CPF. Conversion to cents and digits happens only in `toRequest`, so the UI layer stays free of business rules.

**Files:**
- Create: `frontend/src/features/contracts/formModel.ts`, `frontend/src/features/contracts/formModel.test.ts`

**Interfaces:**
- Consumes: `cpfDigits`, `formatCpf` (Task 3); `parseBrl`, `formatBrlAmount`, `MAX_CENTS` (Task 3); `discountError`, `totalCents` (Task 3); `ContractCreate`, `ContractOut` (Task 4).
- Produces:
  - `type ItemValues = { description: string; amount_cents: string }`
  - `type ContractFormValues = { groom: { full_name: string; cpf: string }; bride: { full_name: string; cpf: string }; couple_address: string; event: { date: string; venue_name: string; venue_address: string; coverage_start: string; coverage_end: string; hours_contracted: string }; photographer_count: string; payment: { items: ItemValues[]; pix_discount_cents: string }; signing: { city: string; date: string } }`. Field names match the API's request paths, so a server error path names its input.
  - `MAX_ITEMS = 20`
  - `emptyItem(): ItemValues`
  - `defaultValues(today: string): ContractFormValues`
  - `fromContract(contract: ContractOut): ContractFormValues`
  - `toRequest(values: ContractFormValues): ContractCreate`
  - `validate(values: ContractFormValues): Record<string, string>` — flat map from field path to message; empty when valid.
  - `isFormField(path: string, itemCount: number): boolean`
  - `formTotal(values: ContractFormValues): number | null`
  - `moneyText(text: string): string` — a valid amount in the standard form (`"1200"` → `"1.200,00"`); anything else unchanged. Used when a money input loses focus.

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/contracts/formModel.test.ts`:

```ts
import { makeContract } from "../../test/fixtures";
import {
  type ContractFormValues,
  defaultValues,
  formTotal,
  fromContract,
  isFormField,
  moneyText,
  toRequest,
  validate,
} from "./formModel";

function valid(): ContractFormValues {
  return {
    groom: { full_name: "Bruno Costa", cpf: "123.456.789-09" },
    bride: { full_name: "Ana Lima", cpf: "98765432100" },
    couple_address: "Rua das Flores 100",
    event: {
      date: "2027-03-14",
      venue_name: "Igreja Matriz",
      venue_address: "",
      coverage_start: "16:00",
      coverage_end: "",
      hours_contracted: "",
    },
    photographer_count: "2",
    payment: {
      items: [
        { description: "Cobertura da cerimônia na igreja", amount_cents: "1.200,00" },
        { description: "Diária segundo fotógrafo", amount_cents: "500" },
      ],
      pix_discount_cents: "300",
    },
    signing: { city: "Curitiba", date: "2026-10-13" },
  };
}

test("defaults: one empty item, two photographers, Curitiba, signed today", () => {
  const values = defaultValues("2026-10-14");
  expect(values.payment.items).toEqual([{ description: "", amount_cents: "" }]);
  expect(values.photographer_count).toBe("2");
  expect(values.signing).toEqual({ city: "Curitiba", date: "2026-10-14" });
});

test("toRequest converts text to the API's types", () => {
  expect(toRequest(valid())).toEqual({
    groom: { full_name: "Bruno Costa", cpf: "12345678909" },
    bride: { full_name: "Ana Lima", cpf: "98765432100" },
    couple_address: "Rua das Flores 100",
    event: {
      date: "2027-03-14",
      venue_name: "Igreja Matriz",
      venue_address: null,
      coverage_start: "16:00",
      coverage_end: null,
      hours_contracted: null,
    },
    photographer_count: 2,
    payment: {
      items: [
        { description: "Cobertura da cerimônia na igreja", amount_cents: 120000 },
        { description: "Diária segundo fotógrafo", amount_cents: 50000 },
      ],
      pix_discount_cents: 30000,
    },
    signing: { city: "Curitiba", date: "2026-10-13" },
  });
});

test("toRequest trims text and reads optional numbers", () => {
  const values = valid();
  values.groom.full_name = "  Bruno Costa  ";
  values.event.hours_contracted = "6";
  values.payment.pix_discount_cents = "  ";
  const request = toRequest(values);
  expect(request.groom.full_name).toBe("Bruno Costa");
  expect(request.event.hours_contracted).toBe(6);
  expect(request.payment.pix_discount_cents).toBeNull();
});

test("fromContract fills the form, and converting back gives the same request", () => {
  const contract = makeContract();
  const values = fromContract(contract);
  expect(values.groom.cpf).toBe("123.456.789-09");
  expect(values.event.coverage_start).toBe("16:00");
  expect(values.payment.items[0]!.amount_cents).toBe("1.200,00");
  expect(values.payment.pix_discount_cents).toBe("300,00");
  expect(toRequest(values)).toEqual({
    groom: { full_name: "Bruno Costa", cpf: "12345678909" },
    bride: { full_name: "Ana Lima", cpf: "98765432100" },
    couple_address: "Rua das Flores 100",
    event: {
      date: "2027-03-14",
      venue_name: "Igreja Matriz",
      venue_address: null,
      coverage_start: "16:00",
      coverage_end: null,
      hours_contracted: null,
    },
    photographer_count: 2,
    payment: {
      items: [
        { description: "Cobertura da cerimônia na igreja", amount_cents: 120000 },
        { description: "Diária segundo fotógrafo", amount_cents: 50000 },
      ],
      pix_discount_cents: 30000,
    },
    signing: { city: "Curitiba", date: "2026-10-13" },
  });
});

test("fromContract tolerates anonymised people and a missing address", () => {
  const contract = makeContract({ couple_address: null });
  contract.groom = { ...contract.groom, full_name: null, cpf: null, address: null };
  const values = fromContract(contract);
  expect(values.groom).toEqual({ full_name: "", cpf: "" });
  expect(values.couple_address).toBe("");
});

test("a valid form has no errors", () => {
  expect(validate(valid())).toEqual({});
});

test("an empty form names every required input", () => {
  const errors = validate(defaultValues("2026-10-14"));
  for (const path of [
    "groom.full_name",
    "groom.cpf",
    "bride.full_name",
    "bride.cpf",
    "couple_address",
    "event.date",
    "event.venue_name",
    "payment.items.0.description",
    "payment.items.0.amount_cents",
  ]) {
    expect(errors[path]).toBe("campo obrigatório");
  }
  expect(errors["signing.city"]).toBeUndefined();
});

test.each<[string, (values: ContractFormValues) => void, string, string]>([
  ["invalid CPF", (v) => (v.groom.cpf = "123.456.789-00"), "groom.cpf", "CPF inválido"],
  ["same CPFs", (v) => (v.bride.cpf = "12345678909"), "bride.cpf", "os CPFs dos contratantes devem ser diferentes"],
  ["long name", (v) => (v.bride.full_name = "a".repeat(201)), "bride.full_name", "máximo de 200 caracteres"],
  ["long address", (v) => (v.couple_address = "a".repeat(301)), "couple_address", "máximo de 300 caracteres"],
  ["long city", (v) => (v.signing.city = "a".repeat(101)), "signing.city", "máximo de 100 caracteres"],
  ["blank city", (v) => (v.signing.city = " "), "signing.city", "campo obrigatório"],
  ["blank signing date", (v) => (v.signing.date = ""), "signing.date", "campo obrigatório"],
  ["control character", (v) => (v.event.venue_name = "Igreja\tMatriz"), "event.venue_name", "não pode conter caracteres de controle"],
  ["hours 0", (v) => (v.event.hours_contracted = "0"), "event.hours_contracted", "informe de 1 a 24 horas"],
  ["hours 25", (v) => (v.event.hours_contracted = "25"), "event.hours_contracted", "informe de 1 a 24 horas"],
  ["hours 2.5", (v) => (v.event.hours_contracted = "2.5"), "event.hours_contracted", "informe de 1 a 24 horas"],
  ["photographers 0", (v) => (v.photographer_count = "0"), "photographer_count", "informe de 1 a 10 fotógrafos"],
  ["photographers blank", (v) => (v.photographer_count = ""), "photographer_count", "informe de 1 a 10 fotógrafos"],
  ["amount text", (v) => (v.payment.items[1]!.amount_cents = "abc"), "payment.items.1.amount_cents", "valor inválido"],
  ["amount zero", (v) => (v.payment.items[1]!.amount_cents = "0,00"), "payment.items.1.amount_cents", "o valor deve ser maior que zero"],
  ["amount too big", (v) => (v.payment.items[1]!.amount_cents = "1.000.000,01"), "payment.items.1.amount_cents", "valor máximo R$ 1.000.000,00"],
  ["discount text", (v) => (v.payment.pix_discount_cents = "x"), "payment.pix_discount_cents", "valor inválido"],
  ["discount too big", (v) => (v.payment.pix_discount_cents = "1.700,00"), "payment.pix_discount_cents", "o desconto deve ser maior que zero e menor que a soma dos itens"],
])("%s", (_name, change, path, message) => {
  const values = valid();
  change(values);
  expect(validate(values)[path]).toBe(message);
});

test("the total follows the typed values", () => {
  expect(formTotal(valid())).toBe(140000);
  const values = valid();
  values.payment.items[1]!.amount_cents = "";
  expect(formTotal(values)).toBeNull();
});

test("moneyText tidies a valid amount and leaves anything else alone", () => {
  expect(moneyText("1200")).toBe("1.200,00");
  expect(moneyText(" 1200,5 ")).toBe("1.200,50");
  expect(moneyText("abc")).toBe("abc");
  expect(moneyText("")).toBe("");
  expect(moneyText("0")).toBe("0");
});

test.each([
  ["groom.cpf", 1, true],
  ["signing.date", 1, true],
  ["payment.items.0.amount_cents", 1, true],
  ["payment.items.1.description", 2, true],
  ["payment.items.2.description", 2, false],
  ["payment.items", 2, false],
  ["payment", 1, false],
  ["*", 1, false],
  ["", 1, false],
])("isFormField(%j, %i) is %s", (path, count, expected) => {
  expect(isFormField(path, count)).toBe(expected);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/contracts/formModel.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the model**

`frontend/src/features/contracts/formModel.ts`:

```ts
import type { ContractCreate, ContractOut } from "../../api/client";
import { discountError, totalCents } from "../../domain/contract";
import { cpfDigits, formatCpf } from "../../domain/cpf";
import { MAX_CENTS, formatBrlAmount, parseBrl } from "../../domain/money";

export type ItemValues = { description: string; amount_cents: string };

export type ContractFormValues = {
  groom: { full_name: string; cpf: string };
  bride: { full_name: string; cpf: string };
  couple_address: string;
  event: {
    date: string;
    venue_name: string;
    venue_address: string;
    coverage_start: string;
    coverage_end: string;
    hours_contracted: string;
  };
  photographer_count: string;
  payment: { items: ItemValues[]; pix_discount_cents: string };
  signing: { city: string; date: string };
};

export const MAX_ITEMS = 20;

const REQUIRED = "campo obrigatório";
// Unicode category Cc, as the backend refuses it.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export function emptyItem(): ItemValues {
  return { description: "", amount_cents: "" };
}

export function defaultValues(today: string): ContractFormValues {
  return {
    groom: { full_name: "", cpf: "" },
    bride: { full_name: "", cpf: "" },
    couple_address: "",
    event: { date: "", venue_name: "", venue_address: "", coverage_start: "", coverage_end: "", hours_contracted: "" },
    photographer_count: "2",
    payment: { items: [emptyItem()], pix_discount_cents: "" },
    signing: { city: "Curitiba", date: today },
  };
}

const time = (value: string | null) => (value ? value.slice(0, 5) : "");

export function fromContract(contract: ContractOut): ContractFormValues {
  return {
    groom: { full_name: contract.groom.full_name ?? "", cpf: formatCpf(contract.groom.cpf ?? "") },
    bride: { full_name: contract.bride.full_name ?? "", cpf: formatCpf(contract.bride.cpf ?? "") },
    couple_address: contract.couple_address ?? "",
    event: {
      date: contract.event.date,
      venue_name: contract.event.venue_name,
      venue_address: contract.event.venue_address ?? "",
      coverage_start: time(contract.event.coverage_start),
      coverage_end: time(contract.event.coverage_end),
      hours_contracted: contract.event.hours_contracted === null ? "" : String(contract.event.hours_contracted),
    },
    photographer_count: String(contract.photographer_count),
    payment: {
      items: contract.payment.items.map((item) => ({
        description: item.description,
        amount_cents: formatBrlAmount(item.amount_cents),
      })),
      pix_discount_cents:
        contract.payment.pix_discount_cents === null ? "" : formatBrlAmount(contract.payment.pix_discount_cents),
    },
    signing: { city: contract.signing.city, date: contract.signing.date },
  };
}

const optional = (value: string) => (value.trim() === "" ? null : value.trim());
const cpf = (value: string) => cpfDigits(value) ?? value.trim();

export function toRequest(values: ContractFormValues): ContractCreate {
  return {
    groom: { full_name: values.groom.full_name.trim(), cpf: cpf(values.groom.cpf) },
    bride: { full_name: values.bride.full_name.trim(), cpf: cpf(values.bride.cpf) },
    couple_address: values.couple_address.trim(),
    event: {
      date: values.event.date,
      venue_name: values.event.venue_name.trim(),
      venue_address: optional(values.event.venue_address),
      coverage_start: optional(values.event.coverage_start),
      coverage_end: optional(values.event.coverage_end),
      hours_contracted: optional(values.event.hours_contracted) === null ? null : Number(values.event.hours_contracted),
    },
    photographer_count: Number(values.photographer_count),
    payment: {
      items: values.payment.items.map((item) => ({
        description: item.description.trim(),
        amount_cents: parseBrl(item.amount_cents) ?? Number.NaN,
      })),
      pix_discount_cents: parseBrl(values.payment.pix_discount_cents),
    },
    signing: { city: values.signing.city.trim(), date: values.signing.date },
  };
}

function textError(value: string, max: number, required: boolean): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return required ? REQUIRED : null;
  if (CONTROL.test(value)) return "não pode conter caracteres de controle";
  if (trimmed.length > max) return `máximo de ${max} caracteres`;
  return null;
}

function integerInRange(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value.trim())) return false;
  const number = Number(value);
  return number >= min && number <= max;
}

function amountError(text: string, required: boolean): string | null {
  const cents = parseBrl(text);
  if (cents === null) return required ? REQUIRED : null;
  if (Number.isNaN(cents)) return "valor inválido";
  if (cents <= 0) return "o valor deve ser maior que zero";
  if (cents > MAX_CENTS) return "valor máximo R$ 1.000.000,00";
  return null;
}

const amounts = (values: ContractFormValues) =>
  values.payment.items.map((item) => parseBrl(item.amount_cents));

export function validate(values: ContractFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const check = (path: string, message: string | null) => {
    if (message) errors[path] = message;
  };

  for (const role of ["groom", "bride"] as const) {
    check(`${role}.full_name`, textError(values[role].full_name, 200, true));
    const typed = values[role].cpf.trim();
    check(`${role}.cpf`, typed === "" ? REQUIRED : cpfDigits(typed) === null ? "CPF inválido" : null);
  }
  const groomCpf = cpfDigits(values.groom.cpf);
  if (groomCpf !== null && groomCpf === cpfDigits(values.bride.cpf)) {
    errors["bride.cpf"] = "os CPFs dos contratantes devem ser diferentes";
  }

  check("couple_address", textError(values.couple_address, 300, true));
  check("event.date", values.event.date === "" ? REQUIRED : null);
  check("event.venue_name", textError(values.event.venue_name, 200, true));
  check("event.venue_address", textError(values.event.venue_address, 300, false));
  if (values.event.hours_contracted.trim() !== "" && !integerInRange(values.event.hours_contracted, 1, 24)) {
    errors["event.hours_contracted"] = "informe de 1 a 24 horas";
  }
  if (!integerInRange(values.photographer_count, 1, 10)) {
    errors.photographer_count = "informe de 1 a 10 fotógrafos";
  }

  values.payment.items.forEach((item, index) => {
    check(`payment.items.${index}.description`, textError(item.description, 200, true));
    check(`payment.items.${index}.amount_cents`, amountError(item.amount_cents, true));
  });
  const discountText = amountError(values.payment.pix_discount_cents, false);
  check(
    "payment.pix_discount_cents",
    discountText ?? discountError(amounts(values), parseBrl(values.payment.pix_discount_cents)),
  );

  check("signing.city", textError(values.signing.city, 100, true));
  check("signing.date", values.signing.date === "" ? REQUIRED : null);
  return errors;
}

export function formTotal(values: ContractFormValues): number | null {
  const discount = parseBrl(values.payment.pix_discount_cents);
  return totalCents(amounts(values), Number.isNaN(discount) ? null : discount);
}

export function moneyText(text: string): string {
  const cents = parseBrl(text);
  return cents !== null && Number.isInteger(cents) && cents > 0 ? formatBrlAmount(cents) : text;
}

const FIXED_FIELDS = new Set([
  "groom.full_name",
  "groom.cpf",
  "bride.full_name",
  "bride.cpf",
  "couple_address",
  "event.date",
  "event.venue_name",
  "event.venue_address",
  "event.coverage_start",
  "event.coverage_end",
  "event.hours_contracted",
  "photographer_count",
  "payment.pix_discount_cents",
  "signing.city",
  "signing.date",
]);
const ITEM_FIELD = /^payment\.items\.(\d+)\.(description|amount_cents)$/;

export function isFormField(path: string, itemCount: number): boolean {
  if (FIXED_FIELDS.has(path)) return true;
  const match = ITEM_FIELD.exec(path);
  return match !== null && Number(match[1]) < itemCount;
}
```

Check against the tests:
- `"1.700,00"` as a discount on R$ 1.700,00 of items (1.200 + 500): `amountError` passes it, then `discountError` refuses it because it is not below the sum.
- A discount of `"x"` gives `NaN` from `parseBrl`, and `amountError` reports "valor inválido" first.
- In `formTotal`, an invalid discount counts as none, so the total still shows while the discount input shows its own error. A refused discount (too big) makes `totalCents` return `null`, so the total shows "—".
- ESLint's `no-control-regex` flags the `CONTROL` regex. Add `// eslint-disable-next-line no-control-regex -- matching control characters is the point` above it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/contracts/formModel.test.ts && npm run lint && npm run typecheck`
Expected: PASS. If `typecheck` rejects `toRequest`'s return as `ContractCreate` (for example the `event.date` type), match the generated type exactly rather than casting.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/contracts/formModel.ts frontend/src/features/contracts/formModel.test.ts
git commit -m "feat: add the contract form model with validation mirroring the API"
```

---

### Task 9: The contract form — create

The form component and its sections, wired to the model from Task 8, plus the create flow: save, download the PDF, then open the saved contract.

**Files:**
- Create: `frontend/src/ui/FormSection.tsx`, `frontend/src/ui/FormSection.module.css`, `frontend/src/features/contracts/useContractForm.ts`, `frontend/src/features/contracts/ContractForm.tsx`, `frontend/src/features/contracts/ContractForm.module.css`, `frontend/src/features/contracts/CreateContract.tsx`, `frontend/src/features/contracts/EditContract.tsx` (placeholder until Task 10), `frontend/src/features/contracts/sections/TextField.tsx`, `frontend/src/features/contracts/sections/CoupleSection.tsx`, `frontend/src/features/contracts/sections/EventSection.tsx`, `frontend/src/features/contracts/sections/PhotographersSection.tsx`, `frontend/src/features/contracts/sections/PaymentSection.tsx`, `frontend/src/features/contracts/sections/SigningSection.tsx`, `frontend/src/features/contracts/ContractFormPage.create.test.tsx`
- Modify: `frontend/src/features/contracts/ContractFormPage.tsx` (replace the placeholder), `frontend/src/features/contracts/messages.ts`, `frontend/src/ui/index.ts`, `frontend/src/ui/tokens.css`

**Interfaces:**
- Consumes: the form model (Task 8); `useCreateContract`, `downloadContractPdf` (Task 7); `ApiError` (Task 4); `splitFieldErrors` (Task 4); `changedSections` (Task 4); `formatCpf` (Task 3); `formatBrl` (Task 3); `todayIso` (Task 7); `ui` (Task 5).
- Produces:
  - `FormSection(props: { title: string; disabled?: boolean; children: ReactNode })` in `ui/`. It renders a `<fieldset>` with a `<legend>`, so it has the role `group` named by its title.
  - `useContractForm(initialValues: ContractFormValues, submit: (values: ContractFormValues) => Promise<void>)` returning `{ form, items, values, total, hasChanges, serverMessages, onSubmit, canAddItem, addItem, removeItem }`, and `type ContractFormState = ReturnType<typeof useContractForm>`. `submit` handles every error itself except a 422 `ApiError`, which it rethrows for the hook to map onto inputs.
  - `ContractForm(props: { initialValues: ContractFormValues; onSubmit: (values: ContractFormValues) => Promise<void>; readOnly?: boolean; requireChanges?: boolean; actions?: (state: { hasChanges: boolean }) => ReactNode })`.
  - `ContractFormPage({ id }: { id?: string })` renders `CreateContract` without an id and `EditContract` with one.
  - `PDF_AFTER_SAVE_FAILED` in `messages.ts`.
  - Input labels used by every later test: "Nome do noivo", "CPF do noivo", "Nome da noiva", "CPF da noiva", "Endereço do casal", "Data do evento", "Local do evento", "Endereço do local", "Início da cobertura", "Fim da cobertura", "Horas contratadas", "Número de fotógrafos", "Descrição do item N", "Valor do item N", "Desconto PIX", "Cidade da assinatura", "Data da assinatura". Buttons: "Adicionar item", "Remover item N", "Salvar".

- [ ] **Step 1: Write the failing create tests**

`frontend/src/features/contracts/ContractFormPage.create.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { IDS, makeContract, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const PDF_HEADERS = {
  "Content-Type": "application/pdf",
  "Content-Disposition": 'attachment; filename="contrato-bruno-ana-2027-03-14.pdf"',
};

const EXPECTED_REQUEST = {
  groom: { full_name: "Bruno Costa", cpf: "12345678909" },
  bride: { full_name: "Ana Lima", cpf: "98765432100" },
  couple_address: "Rua das Flores 100",
  event: {
    date: "2027-03-14",
    venue_name: "Igreja Matriz",
    venue_address: null,
    coverage_start: "16:00",
    coverage_end: null,
    hours_contracted: null,
  },
  photographer_count: 2,
  payment: {
    items: [
      { description: "Cobertura da cerimônia na igreja", amount_cents: 120000 },
      { description: "Diária segundo fotógrafo", amount_cents: 50000 },
    ],
    pix_discount_cents: 30000,
  },
  signing: { city: "Curitiba", date: "2026-10-14" },
};

// Date and time inputs take a whole value at once.
function setInput(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
  fireEvent.blur(element);
}

async function fillValidContract(user: UserEvent) {
  await user.type(screen.getByLabelText("Nome do noivo"), "Bruno Costa");
  await user.type(screen.getByLabelText("CPF do noivo"), "12345678909");
  await user.type(screen.getByLabelText("Nome da noiva"), "Ana Lima");
  await user.type(screen.getByLabelText("CPF da noiva"), "987.654.321-00");
  await user.type(screen.getByLabelText("Endereço do casal"), "Rua das Flores 100");
  setInput(screen.getByLabelText("Data do evento"), "2027-03-14");
  await user.type(screen.getByLabelText("Local do evento"), "Igreja Matriz");
  setInput(screen.getByLabelText("Início da cobertura"), "16:00");
  await user.type(screen.getByLabelText("Descrição do item 1"), "Cobertura da cerimônia na igreja");
  await user.type(screen.getByLabelText("Valor do item 1"), "1200");
  await user.click(screen.getByRole("button", { name: "Adicionar item" }));
  await user.type(screen.getByLabelText("Descrição do item 2"), "Diária segundo fotógrafo");
  await user.type(screen.getByLabelText("Valor do item 2"), "500");
  await user.type(screen.getByLabelText("Desconto PIX"), "300");
  await user.tab();
}

let anchors: HTMLAnchorElement[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 14, 10, 0) });
  anchors = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    anchors.push(this);
  });
  server.use(
    http.get("/api/v1/contracts/:id", () => HttpResponse.json(makeContract())),
    http.get("/api/v1/contracts/:id/pdf", () => new HttpResponse(new Blob(["%PDF-1.7"]), { headers: PDF_HEADERS })),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

test("starts with the defaults", () => {
  renderApp("/contratos/novo");
  expect(screen.getByRole("heading", { level: 1, name: "Novo contrato" })).toBeInTheDocument();
  expect(screen.getByLabelText("Cidade da assinatura")).toHaveValue("Curitiba");
  expect(screen.getByLabelText("Data da assinatura")).toHaveValue("2026-10-14");
  expect(screen.getByLabelText("Número de fotógrafos")).toHaveValue(2);
  expect(within(screen.getByRole("group", { name: "Pagamento" })).getByText("—")).toBeInTheDocument();
});

test("an empty form is not sent and every required input says so", async () => {
  const posted = vi.fn();
  server.use(
    http.post("/api/v1/contracts", () => {
      posted();
      return HttpResponse.json({});
    }),
  );
  const { user } = renderApp("/contratos/novo");
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  for (const label of ["Nome do noivo", "CPF do noivo", "Endereço do casal", "Data do evento", "Valor do item 1"]) {
    expect(screen.getByLabelText(label)).toHaveAccessibleDescription("campo obrigatório");
  }
  expect(posted).not.toHaveBeenCalled();
});

test("CPFs are checked and formatted as you leave the input", async () => {
  const { user } = renderApp("/contratos/novo");
  await user.type(screen.getByLabelText("CPF do noivo"), "12345678909");
  await user.tab();
  expect(screen.getByLabelText("CPF do noivo")).toHaveValue("123.456.789-09");
  await user.type(screen.getByLabelText("CPF da noiva"), "12345678900");
  await user.tab();
  expect(screen.getByLabelText("CPF da noiva")).toHaveAccessibleDescription("CPF inválido");
  await user.clear(screen.getByLabelText("CPF da noiva"));
  await user.type(screen.getByLabelText("CPF da noiva"), "123.456.789-09");
  await user.tab();
  expect(screen.getByLabelText("CPF da noiva")).toHaveAccessibleDescription(
    "os CPFs dos contratantes devem ser diferentes",
  );
});

test("items can be added and removed and the total follows", async () => {
  const { user } = renderApp("/contratos/novo");
  const payment = () => within(screen.getByRole("group", { name: "Pagamento" }));
  expect(screen.getByRole("button", { name: "Remover item 1" })).toBeDisabled();

  await user.type(screen.getByLabelText("Valor do item 1"), "1200");
  await user.tab();
  expect(screen.getByLabelText("Valor do item 1")).toHaveValue("1.200,00");
  expect(payment().getByText("R$ 1.200,00")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Adicionar item" }));
  await user.type(screen.getByLabelText("Valor do item 2"), "500");
  expect(payment().getByText("R$ 1.700,00")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Desconto PIX"), "300");
  expect(payment().getByText("R$ 1.400,00")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Remover item 1" }));
  // "500" was tidied to "500,00" when the input lost focus.
  expect(screen.getByLabelText("Valor do item 1")).toHaveValue("500,00");
  expect(payment().getByText("R$ 200,00")).toBeInTheDocument();
});

test("no more than 20 items", async () => {
  const { user } = renderApp("/contratos/novo");
  const add = screen.getByRole("button", { name: "Adicionar item" });
  for (let count = 1; count < 20; count += 1) await user.click(add);
  expect(screen.getByLabelText("Valor do item 20")).toBeInTheDocument();
  expect(add).toBeDisabled();
});

test("saving sends the contract, downloads its PDF and opens it", async () => {
  let body: unknown;
  server.use(
    http.post("/api/v1/contracts", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(makeContract(), { status: 201 });
    }),
  );
  const { user, router } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  await waitFor(() => expect(router.state.location.pathname).toBe(`/contratos/${IDS.contract}`));
  expect(body).toEqual(EXPECTED_REQUEST);
  expect(anchors).toHaveLength(1);
  expect(anchors[0]!.download).toBe("contrato-bruno-ana-2027-03-14.pdf");
  expect(screen.getByText("Contrato salvo")).toBeInTheDocument();
});

test("server validation errors land on their inputs, the rest in a banner", async () => {
  server.use(
    http.post("/api/v1/contracts", () =>
      problem(422, "Request validation failed", {
        errors: [
          { field: "groom.cpf", message: "CPF recusado pelo servidor" },
          { field: "payment.items.1.amount_cents", message: "valor recusado" },
          { field: "payment.items", message: "informe ao menos um item" },
        ],
      }),
    ),
  );
  const { user, router } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("payment.items: informe ao menos um item");
  expect(screen.getByLabelText("CPF do noivo")).toHaveAccessibleDescription("CPF recusado pelo servidor");
  expect(screen.getByLabelText("Valor do item 2")).toHaveAccessibleDescription("valor recusado");
  expect(router.state.location.pathname).toBe("/contratos/novo");
});

test("a double click sends one request", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const posted = vi.fn();
  server.use(
    http.post("/api/v1/contracts", async () => {
      posted();
      await gate;
      return HttpResponse.json(makeContract(), { status: 201 });
    }),
  );
  const { user, router } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await user.dblClick(screen.getByRole("button", { name: "Salvar" }));
  await user.keyboard("{Enter}");
  release();
  await waitFor(() => expect(router.state.location.pathname).toBe(`/contratos/${IDS.contract}`));
  expect(posted).toHaveBeenCalledOnce();
});

test("a failed PDF after a successful save keeps the contract and says so", async () => {
  server.use(
    http.post("/api/v1/contracts", () => HttpResponse.json(makeContract(), { status: 201 })),
    http.get("/api/v1/contracts/:id/pdf", () => problem(500, "boom")),
  );
  const { user, router } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`/contratos/${IDS.contract}`));
  expect(
    screen.getByText("Contrato salvo, mas o PDF não foi baixado. Use Baixar PDF na página do contrato."),
  ).toBeInTheDocument();
});
```

MSW matches `/api/v1/contracts/:id/pdf` before `/api/v1/contracts/:id` only for the PDF path, because `:id` matches a single path segment.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/contracts/ContractFormPage.create.test.tsx`
Expected: FAIL. The placeholder page has no inputs.

- [ ] **Step 3: Add `FormSection` to `ui/`**

Append to `frontend/src/ui/tokens.css`, inside `:root`:

```css
  --width-field-min: 16rem;
```

`frontend/src/ui/FormSection.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./FormSection.module.css";

type Props = { title: string; disabled?: boolean; children: ReactNode };

export function FormSection({ title, disabled = false, children }: Props) {
  return (
    <fieldset className={styles.section} disabled={disabled}>
      <legend className={styles.legend}>{title}</legend>
      <div className={styles.body}>{children}</div>
    </fieldset>
  );
}
```

`frontend/src/ui/FormSection.module.css`:

```css
.section {
  margin: 0 0 var(--space-6);
  padding: var(--space-4) var(--space-6) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
.legend {
  padding: 0 var(--space-2);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-strong);
}
.body {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--width-field-min), 1fr));
  gap: var(--space-4);
}
```

Add `export { FormSection } from "./FormSection";` to `frontend/src/ui/index.ts`.

- [ ] **Step 4: Write the form hook**

`frontend/src/features/contracts/useContractForm.ts`:

```ts
import { useRef, useState } from "react";
import { type FieldErrors, type FieldPath, type Resolver, useFieldArray, useForm } from "react-hook-form";
import { ApiError } from "../../api/client";
import { changedSections } from "../../domain/patch";
import { splitFieldErrors } from "../../domain/problems";
import {
  type ContractFormValues,
  MAX_ITEMS,
  emptyItem,
  formTotal,
  isFormField,
  toRequest,
  validate,
} from "./formModel";

/** React Hook Form wants errors nested like the values; `validate` returns flat paths. */
function nest(flat: Record<string, string>): FieldErrors<ContractFormValues> {
  const root: Record<string, unknown> = {};
  for (const [path, message] of Object.entries(flat)) {
    const parts = path.split(".");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      node[part] ??= {};
      node = node[part] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]!] = { type: "validate", message };
  }
  return root as FieldErrors<ContractFormValues>;
}

const resolver: Resolver<ContractFormValues> = async (values) => {
  const flat = validate(values);
  return Object.keys(flat).length === 0 ? { values, errors: {} } : { values: {}, errors: nest(flat) };
};

export function useContractForm(
  initialValues: ContractFormValues,
  submit: (values: ContractFormValues) => Promise<void>,
) {
  const form = useForm<ContractFormValues>({ defaultValues: initialValues, resolver, mode: "onTouched" });
  const items = useFieldArray({ control: form.control, name: "payment.items" });
  const [baseline] = useState(() => toRequest(initialValues));
  const [serverMessages, setServerMessages] = useState<string[]>([]);
  const inFlight = useRef(false);

  const values = form.watch();
  // Compared as API requests, so "1200" and "1.200,00" are the same value.
  const hasChanges = Object.keys(changedSections(baseline, toRequest(values))).length > 0;

  const onSubmit = form.handleSubmit(async (submitted) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setServerMessages([]);
    try {
      await submit(submitted);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (error.status !== 422) return;
      const { fields, other } = splitFieldErrors(error.errors, (path) =>
        isFormField(path, submitted.payment.items.length),
      );
      for (const [path, message] of Object.entries(fields)) {
        form.setError(path as FieldPath<ContractFormValues>, { type: "server", message });
      }
      const nothingMapped = other.length === 0 && Object.keys(fields).length === 0;
      setServerMessages(nothingMapped ? [error.detail || "Revise os campos do formulário."] : other);
    } finally {
      inFlight.current = false;
    }
  });

  return {
    form,
    items,
    values,
    total: formTotal(values),
    hasChanges,
    serverMessages,
    onSubmit,
    canAddItem: items.fields.length < MAX_ITEMS,
    addItem: () => items.append(emptyItem()),
    removeItem: (index: number) => items.remove(index),
  };
}

export type ContractFormState = ReturnType<typeof useContractForm>;
```

- [ ] **Step 5: Write the sections and the form**

`frontend/src/features/contracts/sections/TextField.tsx`:

```tsx
import { type FieldPathByValue, type UseFormReturn, get } from "react-hook-form";
import { Field, TextInput } from "../../../ui";
import type { ContractFormValues } from "../formModel";

type Props = {
  form: UseFormReturn<ContractFormValues>;
  // Every input in the form holds text, which is what `format` needs.
  name: FieldPathByValue<ContractFormValues, string>;
  label: string;
  hint?: string;
  type?: "text" | "date" | "time" | "number";
  adornment?: string;
  inputMode?: "text" | "decimal" | "numeric";
  /** Tidies the typed text when the input loses focus. */
  format?: (text: string) => string;
};

export function TextField({ form, name, label, hint, type = "text", adornment, inputMode, format }: Props) {
  const error = (get(form.formState.errors, name) as { message?: string } | undefined)?.message;
  const registration = form.register(name, {
    onBlur: format
      ? (event: { target: { value: string } }) => {
          const tidy = format(event.target.value);
          if (tidy !== event.target.value) form.setValue(name, tidy, { shouldDirty: true });
        }
      : undefined,
  });
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <TextInput {...control} {...registration} type={type} adornment={adornment} inputMode={inputMode} autoComplete="off" />
      )}
    </Field>
  );
}
```

`frontend/src/features/contracts/sections/CoupleSection.tsx`:

```tsx
import type { UseFormReturn } from "react-hook-form";
import { formatCpf } from "../../../domain/cpf";
import { FormSection } from "../../../ui";
import type { ContractFormValues } from "../formModel";
import { TextField } from "./TextField";

type Props = { form: UseFormReturn<ContractFormValues>; disabled: boolean };

export function CoupleSection({ form, disabled }: Props) {
  return (
    <FormSection title="Casal" disabled={disabled}>
      <TextField form={form} name="groom.full_name" label="Nome do noivo" />
      <TextField form={form} name="groom.cpf" label="CPF do noivo" inputMode="numeric" format={formatCpf} />
      <TextField form={form} name="bride.full_name" label="Nome da noiva" />
      <TextField form={form} name="bride.cpf" label="CPF da noiva" inputMode="numeric" format={formatCpf} />
      <TextField form={form} name="couple_address" label="Endereço do casal" hint="Impresso no contrato para os dois." />
    </FormSection>
  );
}
```

`frontend/src/features/contracts/sections/EventSection.tsx`:

```tsx
import type { UseFormReturn } from "react-hook-form";
import { FormSection } from "../../../ui";
import type { ContractFormValues } from "../formModel";
import { TextField } from "./TextField";

type Props = { form: UseFormReturn<ContractFormValues>; disabled: boolean };

export function EventSection({ form, disabled }: Props) {
  return (
    <FormSection title="Evento" disabled={disabled}>
      <TextField form={form} name="event.date" label="Data do evento" type="date" />
      <TextField form={form} name="event.venue_name" label="Local do evento" />
      <TextField form={form} name="event.venue_address" label="Endereço do local" hint="Opcional" />
      <TextField form={form} name="event.coverage_start" label="Início da cobertura" type="time" hint="Opcional" />
      <TextField form={form} name="event.coverage_end" label="Fim da cobertura" type="time" hint="Opcional" />
      <TextField form={form} name="event.hours_contracted" label="Horas contratadas" type="number" inputMode="numeric" hint="Opcional, de 1 a 24" />
    </FormSection>
  );
}
```

`frontend/src/features/contracts/sections/PhotographersSection.tsx`:

```tsx
import type { UseFormReturn } from "react-hook-form";
import { FormSection } from "../../../ui";
import type { ContractFormValues } from "../formModel";
import { TextField } from "./TextField";

type Props = { form: UseFormReturn<ContractFormValues>; disabled: boolean };

export function PhotographersSection({ form, disabled }: Props) {
  return (
    <FormSection title="Fotógrafos" disabled={disabled}>
      <TextField form={form} name="photographer_count" label="Número de fotógrafos" type="number" inputMode="numeric" />
    </FormSection>
  );
}
```

`frontend/src/features/contracts/sections/SigningSection.tsx`:

```tsx
import type { UseFormReturn } from "react-hook-form";
import { FormSection } from "../../../ui";
import type { ContractFormValues } from "../formModel";
import { TextField } from "./TextField";

type Props = { form: UseFormReturn<ContractFormValues>; disabled: boolean };

export function SigningSection({ form, disabled }: Props) {
  return (
    <FormSection title="Assinatura" disabled={disabled}>
      <TextField form={form} name="signing.city" label="Cidade da assinatura" />
      <TextField form={form} name="signing.date" label="Data da assinatura" type="date" />
    </FormSection>
  );
}
```

`frontend/src/features/contracts/sections/PaymentSection.tsx`:

```tsx
import { formatBrl } from "../../../domain/money";
import { Button, FormSection } from "../../../ui";
import styles from "../ContractForm.module.css";
import { moneyText } from "../formModel";
import type { ContractFormState } from "../useContractForm";
import { TextField } from "./TextField";

type Props = { state: ContractFormState; disabled: boolean };

export function PaymentSection({ state, disabled }: Props) {
  const { form, items } = state;
  return (
    <FormSection title="Pagamento" disabled={disabled}>
      {items.fields.map((field, index) => (
        <div key={field.id} className={styles.item}>
          <TextField form={form} name={`payment.items.${index}.description`} label={`Descrição do item ${index + 1}`} />
          <TextField
            form={form}
            name={`payment.items.${index}.amount_cents`}
            label={`Valor do item ${index + 1}`}
            adornment="R$"
            inputMode="decimal"
            format={moneyText}
          />
          <Button
            variant="ghost"
            aria-label={`Remover item ${index + 1}`}
            disabled={items.fields.length === 1}
            onClick={() => state.removeItem(index)}
          >
            Remover
          </Button>
        </div>
      ))}
      <div className={styles.row}>
        <Button onClick={state.addItem} disabled={!state.canAddItem}>
          Adicionar item
        </Button>
      </div>
      <TextField
        form={form}
        name="payment.pix_discount_cents"
        label="Desconto PIX"
        hint="Opcional"
        adornment="R$"
        inputMode="decimal"
        format={moneyText}
      />
      <p className={styles.row}>
        Total: <strong>{state.total === null ? "—" : formatBrl(state.total)}</strong>
      </p>
    </FormSection>
  );
}
```

`frontend/src/features/contracts/ContractForm.module.css` (layout only):

```css
.item {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 2fr 1fr auto;
  gap: var(--space-3);
  align-items: end;
}
.row {
  grid-column: 1 / -1;
  margin: 0;
}
.actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
```

`frontend/src/features/contracts/ContractForm.tsx`:

```tsx
import type { ReactNode } from "react";
import { Banner, Button } from "../../ui";
import styles from "./ContractForm.module.css";
import type { ContractFormValues } from "./formModel";
import { CoupleSection } from "./sections/CoupleSection";
import { EventSection } from "./sections/EventSection";
import { PaymentSection } from "./sections/PaymentSection";
import { PhotographersSection } from "./sections/PhotographersSection";
import { SigningSection } from "./sections/SigningSection";
import { useContractForm } from "./useContractForm";

type Props = {
  initialValues: ContractFormValues;
  onSubmit: (values: ContractFormValues) => Promise<void>;
  readOnly?: boolean;
  requireChanges?: boolean;
  actions?: (state: { hasChanges: boolean }) => ReactNode;
};

export function ContractForm({ initialValues, onSubmit, readOnly = false, requireChanges = false, actions }: Props) {
  const state = useContractForm(initialValues, onSubmit);
  const { form } = state;
  const submitting = form.formState.isSubmitting;

  return (
    <form noValidate onSubmit={(event) => void state.onSubmit(event)}>
      {state.serverMessages.length > 0 && (
        <Banner tone="error">
          <p>O servidor recusou o contrato:</p>
          <ul>
            {state.serverMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Banner>
      )}
      <CoupleSection form={form} disabled={readOnly} />
      <EventSection form={form} disabled={readOnly} />
      <PhotographersSection form={form} disabled={readOnly} />
      <PaymentSection state={state} disabled={readOnly} />
      <SigningSection form={form} disabled={readOnly} />
      {!readOnly && (
        <div className={styles.actions}>
          <Button type="submit" variant="primary" busy={submitting} disabled={requireChanges && !state.hasChanges}>
            Salvar
          </Button>
          {actions?.({ hasChanges: state.hasChanges })}
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 6: Write the create page**

Append to `frontend/src/features/contracts/messages.ts`:

```ts
export const PDF_AFTER_SAVE_FAILED =
  "Contrato salvo, mas o PDF não foi baixado. Use Baixar PDF na página do contrato.";
```

`frontend/src/features/contracts/CreateContract.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { downloadContractPdf, useCreateContract } from "../../api/contracts";
import { todayIso } from "../../domain/dates";
import { PageLayout, useToast } from "../../ui";
import { ContractForm } from "./ContractForm";
import { type ContractFormValues, defaultValues, toRequest } from "./formModel";
import { PDF_AFTER_SAVE_FAILED } from "./messages";

export function CreateContract() {
  const navigate = useNavigate();
  const notify = useToast();
  const create = useCreateContract();
  const [initialValues] = useState(() => defaultValues(todayIso()));

  const submit = async (values: ContractFormValues) => {
    // A 422 propagates to the form; other failures are toasted by the query client.
    const contract = await create.mutateAsync(toRequest(values));
    try {
      await downloadContractPdf(contract.id);
      notify("Contrato salvo");
    } catch {
      notify(PDF_AFTER_SAVE_FAILED, { tone: "error" });
    }
    navigate(`/contratos/${contract.id}`, { replace: true });
  };

  return (
    <PageLayout title="Novo contrato">
      <ContractForm initialValues={initialValues} onSubmit={submit} />
    </PageLayout>
  );
}
```

`frontend/src/features/contracts/EditContract.tsx` (replaced in Task 10):

```tsx
import { PageLayout } from "../../ui";

export function EditContract(_props: { id: string }) {
  return <PageLayout title="Editar contrato" />;
}
```

`frontend/src/features/contracts/ContractFormPage.tsx`:

```tsx
import { CreateContract } from "./CreateContract";
import { EditContract } from "./EditContract";

export function ContractFormPage({ id }: { id?: string }) {
  return id === undefined ? <CreateContract /> : <EditContract id={id} />;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/features/contracts && npm run lint && npm run typecheck`
Expected: PASS. Troubleshooting:
- If `toHaveValue(2)` fails for "Número de fotógrafos", check that the input has `type="number"`. jsdom then reports a number.
- If the 20-items test is slow, keep it; it is the only check on the limit in the UI.
- `TextField`'s `name` is typed `FieldPathByValue<ContractFormValues, string>`, so `setValue(name, tidy)` typechecks. A template-literal name such as `` `payment.items.${index}.amount_cents` `` satisfies it.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat: create contracts from a validated form and download the PDF"
```

---

### Task 10: The contract form — edit, conflicts and unsaved changes

**Files:**
- Create: `frontend/src/features/contracts/useUnsavedChangesGuard.ts`, `frontend/src/features/contracts/ContractFormPage.edit.test.tsx`
- Modify: `frontend/src/features/contracts/EditContract.tsx` (replace the placeholder), `frontend/src/features/contracts/ContractForm.tsx` (add the guard), `frontend/src/features/contracts/messages.ts`

**Interfaces:**
- Consumes: `useContract`, `useUpdateContract`, `useRestoreContract`, `useDownloadPdf` (Task 7); `ContractForm` (Task 9); `fromContract`, `toRequest` (Task 8); `changedSections` (Task 4); `coupleLabel`, `RESTORE_CONFLICT` (Task 7).
- Produces:
  - `useUnsavedChangesGuard(active: boolean): { blocked: boolean; stay: () => void; leave: () => void }`. It blocks in-app navigation to another path while `active`, and warns on tab close or reload.
  - `EDIT_CONFLICT_DELETED` in `messages.ts`.

- [ ] **Step 1: Write the failing edit tests**

`frontend/src/features/contracts/ContractFormPage.edit.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { IDS, makeContract, page, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const URL_PATH = `/contratos/${IDS.contract}`;
const EVENT_REQUEST = {
  date: "2027-03-14",
  venue_name: "Capela",
  venue_address: null,
  coverage_start: "16:00",
  coverage_end: null,
  hours_contracted: null,
};

function serveContract(contract = makeContract()) {
  server.use(http.get("/api/v1/contracts/:id", () => HttpResponse.json(contract)));
}

test("loads the contract into the form with nothing to save yet", async () => {
  serveContract();
  renderApp(URL_PATH);
  expect(await screen.findByRole("heading", { level: 1, name: "Bruno & Ana" })).toBeInTheDocument();
  expect(screen.getByLabelText("Nome do noivo")).toHaveValue("Bruno Costa");
  expect(screen.getByLabelText("CPF da noiva")).toHaveValue("987.654.321-00");
  expect(screen.getByLabelText("Valor do item 1")).toHaveValue("1.200,00");
  expect(screen.getByLabelText("Desconto PIX")).toHaveValue("300,00");
  expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
});

test("saving sends only the changed section with If-Match", async () => {
  serveContract();
  let sent: { body: unknown; ifMatch: string | null } | undefined;
  server.use(
    http.patch("/api/v1/contracts/:id", async ({ request }) => {
      sent = { body: await request.json(), ifMatch: request.headers.get("If-Match") };
      return HttpResponse.json(makeContract({ version: 2, event: { ...makeContract().event, venue_name: "Capela" } }));
    }),
  );
  const { user } = renderApp(URL_PATH);
  const venue = await screen.findByLabelText("Local do evento");
  await user.clear(venue);
  await user.type(venue, "Capela");
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  expect(await screen.findByText("Alterações salvas")).toBeInTheDocument();
  expect(sent).toEqual({ body: { event: EVENT_REQUEST }, ifMatch: '"1"' });
  expect(screen.getByLabelText("Local do evento")).toHaveValue("Capela");
  expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
});

test("retyping the same amount differently is not a change", async () => {
  serveContract();
  const { user } = renderApp(URL_PATH);
  const amount = await screen.findByLabelText("Valor do item 1");
  await user.clear(amount);
  await user.type(amount, "1200");
  expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
});

test("a changed item list is sent whole", async () => {
  serveContract();
  let body: unknown;
  server.use(
    http.patch("/api/v1/contracts/:id", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(makeContract({ version: 2 }));
    }),
  );
  const { user } = renderApp(URL_PATH);
  await user.click(await screen.findByRole("button", { name: "Remover item 2" }));
  await user.clear(screen.getByLabelText("Desconto PIX"));
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  await screen.findByText("Alterações salvas");
  expect(body).toEqual({
    payment: {
      items: [{ description: "Cobertura da cerimônia na igreja", amount_cents: 120000 }],
      pix_discount_cents: null,
    },
  });
});

test("a stale version offers a reload that discards the edits", async () => {
  let version = 1;
  server.use(
    http.get("/api/v1/contracts/:id", () =>
      HttpResponse.json(
        version === 1
          ? makeContract()
          : makeContract({ version: 2, event: { ...makeContract().event, venue_name: "Capela Nova" } }),
      ),
    ),
    http.patch("/api/v1/contracts/:id", () => {
      version = 2;
      return problem(412, "Precondition Failed");
    }),
  );
  const { user } = renderApp(URL_PATH);
  const venue = await screen.findByLabelText("Local do evento");
  await user.clear(venue);
  await user.type(venue, "Minha edição");
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  const dialog = await screen.findByRole("dialog", { name: "Contrato alterado" });
  expect(dialog).toHaveTextContent("Este contrato foi alterado em outro lugar.");
  await user.click(screen.getByRole("button", { name: "Recarregar" }));
  await waitFor(() => expect(screen.getByLabelText("Local do evento")).toHaveValue("Capela Nova"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("a deleted contract is read-only until restored", async () => {
  serveContract(makeContract({ deleted_at: "2026-10-14T10:00:00Z" }));
  server.use(http.post("/api/v1/contracts/:id/restore", () => HttpResponse.json(makeContract())));
  const { user } = renderApp(URL_PATH);
  expect(await screen.findByText(/Este contrato foi excluído/)).toBeInTheDocument();
  expect(screen.getByLabelText("Nome do noivo")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Restaurar" }));
  await waitFor(() => expect(screen.getByLabelText("Nome do noivo")).toBeEnabled());
  expect(screen.getByText("Contrato restaurado")).toBeInTheDocument();
});

test("a missing contract says so", async () => {
  server.use(http.get("/api/v1/contracts/:id", () => problem(404, "contract not found")));
  renderApp(URL_PATH);
  expect(await screen.findByRole("heading", { level: 1, name: "Contrato não encontrado" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Voltar para contratos" })).toBeInTheDocument();
});

test("leaving with unsaved changes asks first", async () => {
  serveContract();
  server.use(http.get("/api/v1/clients", () => HttpResponse.json(page([]))));
  const { user, router } = renderApp(URL_PATH);
  const venue = await screen.findByLabelText("Local do evento");
  await user.type(venue, " editado");

  await user.click(screen.getByRole("link", { name: "Clientes" }));
  expect(screen.getByRole("dialog", { name: "Descartar alterações?" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(router.state.location.pathname).toBe(URL_PATH);
  expect(screen.getByLabelText("Local do evento")).toHaveValue("Igreja Matriz editado");

  await user.click(screen.getByRole("link", { name: "Clientes" }));
  await user.click(screen.getByRole("button", { name: "Sair sem salvar" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/clientes"));
});

test("leaving without changes does not ask", async () => {
  serveContract();
  server.use(http.get("/api/v1/clients", () => HttpResponse.json(page([]))));
  const { user, router } = renderApp(URL_PATH);
  await screen.findByLabelText("Local do evento");
  await user.click(screen.getByRole("link", { name: "Clientes" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/clientes"));
});

test("Baixar PDF waits for unsaved changes to be saved", async () => {
  serveContract();
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  server.use(
    http.get("/api/v1/contracts/:id/pdf", () =>
      new HttpResponse(new Blob(["%PDF"]), { headers: { "Content-Type": "application/pdf" } }),
    ),
  );
  const { user } = renderApp(URL_PATH);
  const download = await screen.findByRole("button", { name: "Baixar PDF" });
  expect(download).toBeEnabled();

  await user.type(screen.getByLabelText("Local do evento"), "!");
  expect(download).toBeDisabled();
  expect(screen.getByText("Salve as alterações antes de baixar o PDF.")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Local do evento"), "{Backspace}");
  expect(download).toBeEnabled();
  await user.click(download);
  await waitFor(() => expect(clicked).toHaveBeenCalledOnce());
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/contracts/ContractFormPage.edit.test.tsx`
Expected: FAIL. The placeholder renders no form.

- [ ] **Step 3: Write the guard and add it to the form**

`frontend/src/features/contracts/useUnsavedChangesGuard.ts`:

```ts
import { useEffect } from "react";
import { useBlocker } from "react-router";

export function useUnsavedChangesGuard(active: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => active && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  return {
    blocked: blocker.state === "blocked",
    stay: () => blocker.reset?.(),
    leave: () => blocker.proceed?.(),
  };
}
```

In `frontend/src/features/contracts/ContractForm.tsx`, import `ConfirmDialog` from `../../ui` and `useUnsavedChangesGuard` from `./useUnsavedChangesGuard`. After `const submitting = ...`, add:

```tsx
  // While a save runs, its own navigation (create -> edit page) must not be blocked.
  const guard = useUnsavedChangesGuard(!readOnly && state.hasChanges && !submitting);
```

Then, just before `</form>`, add:

```tsx
      <ConfirmDialog
        open={guard.blocked}
        title="Descartar alterações?"
        confirmLabel="Sair sem salvar"
        tone="danger"
        onConfirm={guard.leave}
        onCancel={guard.stay}
      >
        <p>Você tem alterações não salvas neste contrato.</p>
      </ConfirmDialog>
```

- [ ] **Step 4: Write the edit page**

Append to `frontend/src/features/contracts/messages.ts`:

```ts
export const EDIT_CONFLICT_DELETED =
  "Este contrato foi excluído em outro lugar. Recarregue a página para ver o estado atual.";
```

`frontend/src/features/contracts/EditContract.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { ApiError, type ContractPatch } from "../../api/client";
import { useContract, useDownloadPdf, useRestoreContract, useUpdateContract } from "../../api/contracts";
import { changedSections } from "../../domain/patch";
import { Banner, Button, ConfirmDialog, PageLayout, useToast } from "../../ui";
import { ContractForm } from "./ContractForm";
import { type ContractFormValues, fromContract, toRequest } from "./formModel";
import { EDIT_CONFLICT_DELETED, RESTORE_CONFLICT } from "./messages";
import { coupleLabel } from "./names";

export function EditContract({ id }: { id: string }) {
  const contract = useContract(id);
  const update = useUpdateContract(id);
  const restore = useRestoreContract();
  const pdf = useDownloadPdf();
  const notify = useToast();
  const [conflict, setConflict] = useState(false);

  const data = contract.data;
  if (data === undefined) {
    if (!contract.isError) {
      return (
        <PageLayout title="Editar contrato">
          <p>Carregando…</p>
        </PageLayout>
      );
    }
    const missing = contract.error instanceof ApiError && contract.error.status === 404;
    return (
      <PageLayout title={missing ? "Contrato não encontrado" : "Editar contrato"}>
        {missing ? (
          <p>
            <Link to="/contratos">Voltar para contratos</Link>
          </p>
        ) : (
          <Banner tone="error">
            Não foi possível carregar o contrato.{" "}
            <Button onClick={() => void contract.refetch()}>Tentar de novo</Button>
          </Banner>
        )}
      </PageLayout>
    );
  }

  const deleted = data.deleted_at !== null;

  const submit = async (values: ContractFormValues) => {
    // Sections are compared as API requests, so only real changes are sent.
    const body = changedSections(toRequest(fromContract(data)), toRequest(values)) as ContractPatch;
    try {
      await update.mutateAsync({ version: data.version, body });
      notify("Alterações salvas");
    } catch (error) {
      if (error instanceof ApiError && error.status === 412) return setConflict(true);
      if (error instanceof ApiError && error.status === 409) return notify(EDIT_CONFLICT_DELETED, { tone: "error" });
      throw error;
    }
  };

  const restoreContract = () =>
    restore.mutate(id, {
      onSuccess: () => notify("Contrato restaurado"),
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) notify(RESTORE_CONFLICT, { tone: "error" });
      },
    });

  return (
    <PageLayout title={coupleLabel(data.groom, data.bride)}>
      {deleted && (
        <Banner tone="info">
          Este contrato foi excluído.{" "}
          <Button onClick={restoreContract} busy={restore.isPending}>
            Restaurar
          </Button>
        </Banner>
      )}
      <ContractForm
        // A new version (after a save or a reload) starts the form afresh from the server's data.
        key={data.version}
        initialValues={fromContract(data)}
        onSubmit={submit}
        readOnly={deleted}
        requireChanges
        actions={({ hasChanges }) => (
          <>
            <Button onClick={() => pdf.mutate(id)} disabled={hasChanges} busy={pdf.isPending}>
              Baixar PDF
            </Button>
            {hasChanges && <span>Salve as alterações antes de baixar o PDF.</span>}
          </>
        )}
      />
      <ConfirmDialog
        open={conflict}
        title="Contrato alterado"
        confirmLabel="Recarregar"
        onConfirm={() => {
          setConflict(false);
          void contract.refetch();
        }}
        onCancel={() => setConflict(false)}
      >
        <p>Este contrato foi alterado em outro lugar. Recarregue para ver a versão atual.</p>
      </ConfirmDialog>
    </PageLayout>
  );
}
```

`setConflict` and `notify` both return `void`, so `return setConflict(true)` keeps `submit` returning `Promise<void>`. If the `as ContractPatch` cast is reported as unnecessary by lint, remove it. If typecheck rejects the cast, the generated `ContractPatch` and `ContractCreate` have drifted: compare them in `schema.d.ts` and convert explicitly.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/features/contracts && npm run lint && npm run typecheck`
Expected: PASS, including the create tests. In particular, saving a new contract must still navigate without the guard asking.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/contracts
git commit -m "feat: edit contracts with version checks and an unsaved-changes guard"
```

---

### Task 11: Clients — list, export and anonymise

**Files:**
- Create: `frontend/src/api/clients.ts`, `frontend/src/features/clients/ClientListPage.test.tsx`, `frontend/src/features/clients/ClientListPage.module.css`
- Modify: `frontend/src/features/clients/ClientListPage.tsx` (replace the placeholder)

**Interfaces:**
- Consumes: `api`, `unwrap`, `ApiError`, `ClientOut` (Task 4); `saveBlob` (Task 4); `formatIsoDate` (Task 7); `ui` (Task 5); fixtures (Task 6).
- Produces:
  - `clientKeys = { all: ["clients"] }`
  - `useClients()` — infinite query, page size 20.
  - `exportClient(id: string): Promise<void>` — saves the export as `cliente-<id>.json`, pretty-printed.
  - `useExportClient()`, `useAnonymiseClient()` — mutations. Anonymising invalidates clients, contract lists and cached contracts.

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/clients/ClientListPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { IDS, makeClient, page, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const masked = (overrides = {}) => makeClient({ cpf: "***.***.***-09", ...overrides });
const anonymised = makeClient({
  id: IDS.bride,
  full_name: null,
  cpf: null,
  address: null,
  anonymised_at: "2026-10-14T09:00:00Z",
});

test("lists clients with masked CPF, date and status", async () => {
  server.use(http.get("/api/v1/clients", () => HttpResponse.json(page([masked(), anonymised]))));
  renderApp("/clientes");
  const active = await screen.findByRole("row", { name: /Bruno Costa/ });
  expect(active).toHaveTextContent("***.***.***-09");
  expect(active).toHaveTextContent("13/10/2026");
  expect(active).toHaveTextContent("Ativo");

  const gone = screen.getByRole("row", { name: /Cliente anonimizado/ });
  expect(gone).toHaveTextContent("Anonimizado");
  expect(within(gone).queryByRole("button")).not.toBeInTheDocument();
});

test("an empty list says so", async () => {
  server.use(http.get("/api/v1/clients", () => HttpResponse.json(page([]))));
  renderApp("/clientes");
  expect(await screen.findByText("Nenhum cliente ainda")).toBeInTheDocument();
});

test("Exportar dados saves the export as JSON", async () => {
  const exported = { client: makeClient(), contracts: [], exported_at: "2026-10-14T10:00:00Z" };
  const clicked: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
  server.use(
    http.get("/api/v1/clients", () => HttpResponse.json(page([masked()]))),
    http.get("/api/v1/clients/:id/export", () => HttpResponse.json(exported)),
  );
  const { user } = renderApp("/clientes");
  const row = await screen.findByRole("row", { name: /Bruno Costa/ });
  await user.click(within(row).getByRole("button", { name: "Exportar dados" }));

  await waitFor(() => expect(clicked).toHaveLength(1));
  expect(clicked[0]!.download).toBe(`cliente-${IDS.groom}.json`);
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0]![0] as Blob;
  expect(JSON.parse(await blob.text())).toEqual(exported);
});

test("Anonimizar needs the typed word, then the row turns anonymised", async () => {
  let done = false;
  server.use(
    http.get("/api/v1/clients", () =>
      HttpResponse.json(page([done ? { ...anonymised, id: IDS.groom } : masked()])),
    ),
    http.post("/api/v1/clients/:id/anonymise", () => {
      done = true;
      return HttpResponse.json({ ...anonymised, id: IDS.groom });
    }),
  );
  const { user } = renderApp("/clientes");
  const row = await screen.findByRole("row", { name: /Bruno Costa/ });
  await user.click(within(row).getByRole("button", { name: "Anonimizar" }));

  const dialog = screen.getByRole("dialog", { name: "Anonimizar cliente" });
  expect(dialog).toHaveTextContent("Esta ação não pode ser desfeita.");
  const confirm = within(dialog).getByRole("button", { name: "Anonimizar" });
  expect(confirm).toBeDisabled();
  await user.type(within(dialog).getByLabelText("Digite ANONIMIZAR para confirmar"), "ANONIMIZAR");
  await user.click(confirm);

  expect(await screen.findByText("Cliente anonimizado com sucesso")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(await screen.findByRole("row", { name: /Anonimizado/ })).toBeInTheDocument();
});

test("a client on an active contract cannot be anonymised, and the dialog says why", async () => {
  server.use(
    http.get("/api/v1/clients", () => HttpResponse.json(page([masked()]))),
    http.post("/api/v1/clients/:id/anonymise", () => problem(409, "client has an active contract")),
  );
  const { user } = renderApp("/clientes");
  const row = await screen.findByRole("row", { name: /Bruno Costa/ });
  await user.click(within(row).getByRole("button", { name: "Anonimizar" }));
  const dialog = screen.getByRole("dialog", { name: "Anonimizar cliente" });
  await user.type(within(dialog).getByLabelText("Digite ANONIMIZAR para confirmar"), "ANONIMIZAR");
  await user.click(within(dialog).getByRole("button", { name: "Anonimizar" }));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Este cliente está em um contrato que não foi excluído. Exclua o contrato antes de anonimizar.",
  );
  expect(screen.getByRole("dialog", { name: "Anonimizar cliente" })).toBeInTheDocument();
});

test("Carregar mais fetches the next page", async () => {
  server.use(
    http.get("/api/v1/clients", ({ request }) => {
      const cursor = new URL(request.url).searchParams.get("cursor");
      return HttpResponse.json(cursor === "c2" ? page([anonymised]) : page([masked()], "c2"));
    }),
  );
  const { user } = renderApp("/clientes");
  await screen.findByRole("row", { name: /Bruno Costa/ });
  await user.click(screen.getByRole("button", { name: "Carregar mais" }));
  expect(await screen.findByRole("row", { name: /Cliente anonimizado/ })).toBeInTheDocument();
});
```

The success toast reads "Cliente anonimizado com sucesso" so it cannot be confused with the "Cliente anonimizado" name shown in anonymised rows.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/clients`
Expected: FAIL. The placeholder has no rows.

- [ ] **Step 3: Implement the hooks**

`frontend/src/api/clients.ts`:

```ts
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import { contractKeys } from "./contracts";
import { saveBlob } from "./download";

const PAGE_SIZE = 20;

export const clientKeys = { all: ["clients"] as const };

const path = (id: string) => ({ path: { client_id: id } });

export function useClients() {
  return useInfiniteQuery({
    queryKey: clientKeys.all,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/clients", {
          params: { query: { limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
    getNextPageParam: (last) => last.next_cursor,
  });
}

export async function exportClient(id: string): Promise<void> {
  const data = await unwrap(api.GET("/api/v1/clients/{client_id}/export", { params: path(id) }));
  saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `cliente-${id}.json`);
}

export function useExportClient() {
  return useMutation({ mutationFn: exportClient });
}

export function useAnonymiseClient() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.POST("/api/v1/clients/{client_id}/anonymise", { params: path(id) })),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: clientKeys.all }),
        client.invalidateQueries({ queryKey: contractKeys.all }),
        client.invalidateQueries({ queryKey: ["contract"] }),
      ]),
  });
}
```

- [ ] **Step 4: Implement the page**

`frontend/src/features/clients/ClientListPage.module.css` (layout only):

```css
.actions {
  display: inline-flex;
  gap: var(--space-2);
}
.more {
  display: flex;
  justify-content: center;
  margin-top: var(--space-4);
}
```

`frontend/src/features/clients/ClientListPage.tsx`:

```tsx
import { useState } from "react";
import { ApiError, type ClientOut } from "../../api/client";
import { useAnonymiseClient, useClients, useExportClient } from "../../api/clients";
import { formatIsoDate } from "../../domain/dates";
import { Banner, Button, type Column, ConfirmDialog, PageLayout, Table, useToast } from "../../ui";
import styles from "./ClientListPage.module.css";

const ANONYMISE_CONFLICT =
  "Este cliente está em um contrato que não foi excluído. Exclua o contrato antes de anonimizar.";
const ANONYMISED_NAME = "Cliente anonimizado";

export function ClientListPage() {
  const notify = useToast();
  const clients = useClients();
  const exporter = useExportClient();
  const anonymise = useAnonymiseClient();
  const [target, setTarget] = useState<ClientOut | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const rows = clients.data?.pages.flatMap((result) => result.items) ?? [];

  const close = () => {
    setTarget(null);
    setDialogError(null);
  };

  const confirmAnonymise = () => {
    if (!target) return;
    setDialogError(null);
    anonymise.mutate(target.id, {
      onSuccess: () => {
        close();
        notify("Cliente anonimizado com sucesso");
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) setDialogError(ANONYMISE_CONFLICT);
        else if (error instanceof ApiError && error.status === 404) setDialogError("Este cliente não existe mais.");
      },
    });
  };

  const columns: Column<ClientOut>[] = [
    { header: "Nome", cell: (client) => client.full_name ?? ANONYMISED_NAME },
    { header: "CPF", cell: (client) => client.cpf ?? "—" },
    { header: "Cadastrado em", cell: (client) => formatIsoDate(client.created_at) },
    { header: "Situação", cell: (client) => (client.anonymised_at ? "Anonimizado" : "Ativo") },
    {
      header: "Ações",
      align: "end",
      cell: (client) =>
        client.anonymised_at ? null : (
          <span className={styles.actions}>
            <Button onClick={() => exporter.mutate(client.id)} busy={exporter.isPending && exporter.variables === client.id}>
              Exportar dados
            </Button>
            <Button variant="danger" onClick={() => setTarget(client)}>
              Anonimizar
            </Button>
          </span>
        ),
    },
  ];

  return (
    <PageLayout title="Clientes">
      {clients.isPending && <p>Carregando…</p>}
      {clients.isError && (
        <Banner tone="error">
          Não foi possível carregar os clientes.{" "}
          <Button onClick={() => void clients.refetch()}>Tentar de novo</Button>
        </Banner>
      )}
      {clients.isSuccess && (
        <Table
          label="Clientes"
          columns={columns}
          rows={rows}
          rowKey={(client) => client.id}
          rowMuted={(client) => client.anonymised_at !== null}
          empty={<p>Nenhum cliente ainda</p>}
        />
      )}
      {clients.hasNextPage && (
        <div className={styles.more}>
          <Button onClick={() => void clients.fetchNextPage()} busy={clients.isFetchingNextPage}>
            Carregar mais
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={target !== null}
        title="Anonimizar cliente"
        confirmLabel="Anonimizar"
        tone="danger"
        requireText="ANONIMIZAR"
        busy={anonymise.isPending}
        error={dialogError}
        onConfirm={confirmAnonymise}
        onCancel={close}
      >
        <p>
          O nome, o CPF e o endereço de {target?.full_name ?? "este cliente"} serão apagados para sempre. Esta ação
          não pode ser desfeita.
        </p>
      </ConfirmDialog>
    </PageLayout>
  );
}
```

- [ ] **Step 5: Run every frontend test with coverage**

Run: `npx vitest run src/features/clients && npm run lint && npm run typecheck && npm run test:coverage`
Expected: PASS, and line coverage of at least 80%. If coverage is below 80%, read the uncovered lines in the report and add a test in the owning task's test file. Never lower the threshold.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat: list clients, export their data and anonymise them"
```

---

### Task 12: End-to-end tests against the built app

Playwright drives Chromium against `frontend/dist` served by the real backend on a temporary database with fresh keys. That is the only place where the CSP, the Origin check, the SPA fallback and the real PDF all meet.

**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/e2e/backend.sh`, `frontend/e2e/helpers.ts`, `frontend/e2e/contracts.spec.ts`, `frontend/e2e/clients.spec.ts`
- Modify: `Makefile` (add `e2e`), `.gitignore` (add `playwright-report/` and `test-results/`)

**Interfaces:**
- Consumes: `completeCpf` (Task 3); every screen and label from Tasks 7–11; the backend's settings, read from environment variables (`CONTRACTOR_*`, `FIELD_ENCRYPTION_KEY`, `CPF_LOOKUP_KEY`, `DATABASE_PATH`, `FRONTEND_DIST`, `HOST`, `PORT`), which override `.env`.
- Produces: `make e2e`.

- [ ] **Step 1: Write the backend launcher and the config**

`frontend/e2e/backend.sh`:

```bash
#!/usr/bin/env bash
# Starts the real backend for end-to-end tests: a fresh database and fresh keys in a
# temporary folder, serving the built frontend. Never touches data/ or the keys in .env:
# environment variables take precedence over .env.
set -euo pipefail
PORT="${1:-8765}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$ROOT/backend"
if [[ "$(uname -s)" == "Darwin" ]]; then
  export DYLD_FALLBACK_LIBRARY_PATH="$(brew --prefix)/lib"
fi
eval "$(uv run python -m gerenciador.keygen | sed 's/^/export /')"
export CONTRACTOR_NAME="Fotografia Teste"
export CONTRACTOR_CPF="111.444.777-35"
export CONTRACTOR_ADDRESS="Rua Exemplo 1 - Centro"
export CONTRACTOR_REPRESENTATIVE="Pessoa Teste"
export DATABASE_PATH="$WORK/data/e2e.db"
export FRONTEND_DIST="$ROOT/frontend/dist"
export HOST="127.0.0.1"
export PORT
uv run python -m gerenciador
```

Run `chmod +x frontend/e2e/backend.sh`.

`frontend/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 8765;

export default defineConfig({
  testDir: "e2e",
  // One backend, one database: run serially so tests never race on shared rows.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure", acceptDownloads: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `bash e2e/backend.sh ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
```

Add to the root `.gitignore`:

```
playwright-report/
test-results/
```

Add to the root `Makefile` (and to `.PHONY`):

```make
# Builds the interface and runs Playwright against the real backend on a temporary database.
# First time only: cd frontend && npx playwright install chromium
e2e: build
	cd frontend && npx playwright test
```

- [ ] **Step 2: Write the helpers**

`frontend/e2e/helpers.ts`:

```ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type Download, type Page, test as base, expect } from "@playwright/test";
import { completeCpf } from "../src/domain/cpf";

// Every test fails on any browser console error, which is where CSP violations appear.
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors, "browser console errors (including CSP violations)").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

// Made-up CPFs: base 000000 plus a three-digit counter, with valid check digits.
let counter = Math.floor(Math.random() * 800) + 1;
export function freshCpf(): string {
  counter += 1;
  return completeCpf(`000000${String(counter).padStart(3, "0")}`);
}

function uniqueSuffix(): string {
  return Array.from({ length: 6 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
}

export type Couple = {
  groom: string;
  bride: string;
  groomCpf: string;
  brideCpf: string;
  /** What the list and the edit page show: "Noivoabc & Noivaabc". */
  label: string;
};

// The list shows first names only, so the unique part goes into the first name.
export function freshCouple(): Couple {
  const suffix = uniqueSuffix();
  const groomFirst = `Noivo${suffix}`;
  const brideFirst = `Noiva${suffix}`;
  return {
    groom: `${groomFirst} Costa`,
    bride: `${brideFirst} Lima`,
    groomCpf: freshCpf(),
    brideCpf: freshCpf(),
    label: `${groomFirst} & ${brideFirst}`,
  };
}

export async function fillContract(page: Page, couple: Couple): Promise<void> {
  await page.getByLabel("Nome do noivo").fill(couple.groom);
  await page.getByLabel("CPF do noivo").fill(couple.groomCpf);
  await page.getByLabel("Nome da noiva").fill(couple.bride);
  await page.getByLabel("CPF da noiva").fill(couple.brideCpf);
  await page.getByLabel("Endereço do casal").fill("Rua das Flores 100");
  await page.getByLabel("Data do evento").fill("2027-03-14");
  await page.getByLabel("Local do evento").fill("Igreja Matriz");
  await page.getByLabel("Início da cobertura").fill("16:00");
  await page.getByLabel("Descrição do item 1").fill("Cobertura da cerimônia na igreja");
  await page.getByLabel("Valor do item 1").fill("1.200,00");
  await page.getByRole("button", { name: "Adicionar item" }).click();
  await page.getByLabel("Descrição do item 2").fill("Diária segundo fotógrafo");
  await page.getByLabel("Valor do item 2").fill("500");
  await page.getByLabel("Desconto PIX").fill("300");
}

/** Creates a contract through the form and returns its id and the downloaded PDF. */
export async function createContract(page: Page, couple: Couple) {
  await page.goto("/contratos/novo");
  await fillContract(page, couple);
  const pdfResponse = page.waitForResponse((response) => response.url().endsWith("/pdf"));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(/\/contratos\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  return { id, download: await download, pdfResponse: await pdfResponse };
}

export async function sha256(download: Download): Promise<string> {
  const path = await download.path();
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
```

- [ ] **Step 3: Write the scenarios**

`frontend/e2e/contracts.spec.ts`:

```ts
import { createContract, expect, freshCouple, sha256, test } from "./helpers";

test("creating a contract downloads its PDF, matching the server's hash", async ({ page }) => {
  const { download, pdfResponse } = await createContract(page, freshCouple());
  expect(download.suggestedFilename()).toMatch(/^contrato-noivo[a-z]{6}-noiva[a-z]{6}-2027-03-14\.pdf$/);
  expect(await sha256(download)).toBe(pdfResponse.headers()["x-content-sha256"]);
  await expect(page.getByText("Contrato salvo")).toBeVisible();
});

test("an edit survives a reload of the contract's own URL", async ({ page }) => {
  await createContract(page, freshCouple());
  await page.getByLabel("Local do evento").fill("Capela Santa Luzia");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Alterações salvas")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Local do evento")).toHaveValue("Capela Santa Luzia");
});

test("a contract opens directly by URL, and a mistyped API path stays a JSON problem", async ({ page }) => {
  const couple = freshCouple();
  const { id } = await createContract(page, couple);
  await page.goto(`/contratos/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(couple.label);

  const problem = await page.request.get("/api/v1/nao-existe");
  expect(problem.status()).toBe(404);
  expect(problem.headers()["content-type"]).toBe("application/problem+json");
});

test("a deleted contract can be restored with Desfazer", async ({ page }) => {
  const couple = freshCouple();
  await createContract(page, couple);
  await page.getByRole("link", { name: "Contratos" }).click();
  const row = page.getByRole("row", { name: new RegExp(couple.label) });
  await row.getByRole("button", { name: "Excluir" }).click();
  await page.getByRole("dialog", { name: "Excluir contrato" }).getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Contrato excluído")).toBeVisible();
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByText("Contrato restaurado")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(couple.label) })).toHaveCount(1);
});
```

Each couple's first names carry a random six-letter suffix, so `couple.label` matches exactly one row even though every test shares one database.

`frontend/e2e/clients.spec.ts`:

```ts
import { readFile } from "node:fs/promises";
import { createContract, expect, freshCouple, test } from "./helpers";

test("a client on no active contract can be exported and anonymised", async ({ page }) => {
  const couple = freshCouple();
  await createContract(page, couple);

  // Anonymising is refused while the contract is active, so delete it first.
  await page.getByRole("link", { name: "Contratos" }).click();
  await page.getByRole("row", { name: new RegExp(couple.label) }).getByRole("button", { name: "Excluir" }).click();
  await page.getByRole("dialog", { name: "Excluir contrato" }).getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Contrato excluído")).toBeVisible();

  await page.getByRole("link", { name: "Clientes" }).click();
  const row = page.getByRole("row", { name: new RegExp(couple.groom) });

  const download = page.waitForEvent("download");
  await row.getByRole("button", { name: "Exportar dados" }).click();
  const exported = JSON.parse(await readFile(await (await download).path(), "utf-8"));
  expect(exported.client.full_name).toBe(couple.groom);
  expect(exported.contracts).toHaveLength(1);

  await row.getByRole("button", { name: "Anonimizar" }).click();
  const dialog = page.getByRole("dialog", { name: "Anonimizar cliente" });
  await dialog.getByLabel("Digite ANONIMIZAR para confirmar").fill("ANONIMIZAR");
  await dialog.getByRole("button", { name: "Anonimizar" }).click();
  await expect(page.getByText("Cliente anonimizado com sucesso")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(couple.groom) })).toHaveCount(0);
});
```

- [ ] **Step 4: Run the end-to-end tests**

Run (repository root, first time only): `cd frontend && npx playwright install chromium && cd ..`
Run: `make e2e`
Expected: 5 tests PASS. If a test fails on console errors, read the message: a "Refused to …" line is a CSP violation in the built app and must be fixed in the app, not filtered out.

- [ ] **Step 5: Commit**

```bash
git add .gitignore Makefile frontend/playwright.config.ts frontend/e2e
git commit -m "test: drive the built app end to end against the real backend"
```

---

### Task 13: Checks, CI, Dependabot, pre-commit and README

**Files:**
- Modify: `Makefile`, `.github/workflows/ci.yml`, `.github/dependabot.yml`, `.pre-commit-config.yaml`, `README.md`

**Interfaces:**
- Produces: `make check-backend`, `make check-frontend`, and `make check` (both). CI jobs `backend`, `frontend` and `e2e`.

- [ ] **Step 1: Split the checks in the Makefile**

Rename the existing `check:` target to `check-backend:`, keeping its recipe lines, and add:

```make
check-frontend:
	$(NPM) run format:check
	$(NPM) run lint
	$(NPM) run typecheck
	$(NPM) run test:coverage
	$(NPM) audit --audit-level=high
	frontend/scripts/check-api-types.sh

check: check-backend check-frontend
```

Add `check-backend check-frontend` to `.PHONY`.

Run: `make check`
Expected: every backend and frontend step passes, ending with `API types are current.`

- [ ] **Step 2: Add the CI jobs**

In `.github/workflows/ci.yml`, change the backend job's two `make` steps to `make install-backend` and `make check-backend` (Task 2 already split install), and add after the backend job:

```yaml
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install WeasyPrint system libraries
        run: sudo apt-get update && sudo apt-get install -y libpango-1.0-0 libpangoft2-1.0-0
      - uses: astral-sh/setup-uv@v5
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: make install
      - run: make check-frontend

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install WeasyPrint system libraries
        run: sudo apt-get update && sudo apt-get install -y libpango-1.0-0 libpangoft2-1.0-0
      - uses: astral-sh/setup-uv@v5
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: make install
      - run: cd frontend && npx playwright install --with-deps chromium
      - run: make e2e
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: frontend/playwright-report
          retention-days: 7
```

The frontend job needs the backend too, because `check-api-types.sh` regenerates the schema from the backend's routes.

- [ ] **Step 3: Add npm to Dependabot**

Append to `.github/dependabot.yml` under `updates:`:

```yaml
  - package-ecosystem: npm
    directory: /frontend
    schedule:
      interval: weekly
```

- [ ] **Step 4: Add the frontend pre-commit hooks**

Append to `.pre-commit-config.yaml` under `repos:`:

```yaml
  - repo: local
    hooks:
      - id: prettier-frontend
        name: prettier (frontend)
        entry: bash -c 'cd frontend && npx --no-install prettier --write "${@#frontend/}"' --
        language: system
        files: ^frontend/
        exclude: ^frontend/(src/api/schema\.d\.ts|package-lock\.json)$
        types_or: [ts, tsx, javascript, json, css]
      - id: eslint-frontend
        name: eslint (frontend)
        entry: bash -c 'cd frontend && npx --no-install eslint "${@#frontend/}"' --
        language: system
        files: ^frontend/.*\.(ts|tsx|js)$
        exclude: ^frontend/src/api/schema\.d\.ts$
```

`"${@#frontend/}"` strips the `frontend/` prefix from every staged path, because the tools run inside `frontend/`.

Run: `pre-commit run --all-files`
Expected: every hook passes. If Prettier rewrites files, review the diff and include it in this commit.

- [ ] **Step 5: Update the README**

In `README.md`:

1. **Setup:** change `brew install uv pango` to `brew install uv pango node@22`, and after `make install` add:

   ```markdown
   `make install` installs the backend and the interface. The first time you run the
   end-to-end tests, also run `cd frontend && npx playwright install chromium`.
   ```

2. **Run:** replace the opening paragraph with:

   ```markdown
   ```bash
   make run
   ```

   Open <http://127.0.0.1:8000>. `make run` builds the interface first when its
   sources have changed. The API is at <http://127.0.0.1:8000/api/v1>.
   ```

   Keep the existing sentence about refusing to start off loopback.

3. Add a **Develop** section after **Run**:

   ```markdown
   ## Develop

   ```bash
   make dev
   ```

   Runs the backend and the Vite dev server together. Open <http://localhost:5173>;
   Vite reloads the page as you edit and forwards `/api` to the backend.

   After changing the backend's routes or models, run `make api-types` and commit
   `frontend/src/api/schema.d.ts`. `make check` fails while it is out of date.
   ```

4. **Check:** after the existing sentence, add: `` `make e2e` builds the interface and runs the browser tests against the real backend on a temporary database. ``

5. **Personal data:** replace "Through the API you can export everything held about a person, correct it, or anonymise it (see "Using the API from the terminal")." with: "On the **Clientes** screen you can export everything held about a person or anonymise them. Corrections go through the contract form, or through the API (see "Using the API from the terminal")."

- [ ] **Step 6: Run everything once more**

Run: `make check && make e2e`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add Makefile .github .pre-commit-config.yaml README.md
git commit -m "chore: run frontend checks and browser tests in make and CI"
```
