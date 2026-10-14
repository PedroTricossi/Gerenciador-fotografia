# Contract Generation — Design

Date: 2026-10-13
Status: awaiting review

## 1. Purpose

Pedro runs a wedding photography business and fills each client contract by
hand from a Google Docs base contract. This first sub-project replaces that
with a form: he types the couple's and the wedding's details, and the system
stores the contract and produces the PDF.

It is also the foundation of a larger company manager. Later sub-projects, each
with its own spec, will add a client board, an events calendar and instalment
tracking. They will read the data this sub-project stores.

### Success criteria

- A contract PDF for a new couple is produced from one form, with no manual
  editing of the document.
- The PDF text matches the base contract, with every per-client value filled in.
- Contracts can be listed, edited, soft-deleted and restored.
- Every action is recorded in an audit trail that cannot be altered.
- A client's personal data can be exported, corrected and anonymised.
- No personal data is committed to git, written to logs, or stored unencrypted
  where this design says it is encrypted.

### Out of scope

- Login and multi-user access (see 6.1 for the seam left for it).
- Client board, calendar, instalment schedules and payment tracking.
- Contract types other than weddings.
- Keeping past versions of an edited contract.
- Automatic retention timers. Anonymisation is a manual action.
- Deployment outside Pedro's own machine, HTTPS, rate limiting, Docker.
- Electronic signature.

## 2. Architecture

One repository, two projects.

```
backend/
  src/gerenciador/
    main.py                 app factory, middleware, serves frontend/dist if present
    config.py               settings from .env
    api/
      deps.py               get_current_actor, db session, request id
      errors.py             RFC 9457 problem responses
      v1/
        contracts.py
        clients.py
        audit.py
        health.py
        schemas.py
    services/
      contract_service.py   create, edit, delete, restore, render
      client_service.py     upsert, edit, export, anonymise
      audit_service.py      records one event per action
      contract_renderer.py  template + data -> Markdown -> HTML
      pdf_renderer.py       HTML -> PDF, behind a small interface
      crypto.py             field encryption, CPF lookup hash
    repositories/
      contract_repository.py
      client_repository.py
      audit_repository.py
    db/
      models.py             SQLAlchemy 2.0 models
      session.py
    domain/
      cpf.py                check-digit validation, masking
      money.py              BRL formatting, amount in words
      contract.py           totals, photographer wording, date wording
  migrations/               Alembic
  tests/
frontend/                   React + TypeScript + Vite
  src/
    api/                    client types generated from the OpenAPI schema
    features/contracts/     contract list and contract form
base_contract/contract_template.md
data/                       SQLite file, git-ignored
```

Rules:

- Dependencies point inward: `api` -> `services` -> `repositories`/`domain`.
  `domain` imports no framework.
- Routers hold no logic. They translate HTTP to service calls.
- Only repositories touch the database session.
- Each future feature adds its own router, service and repository and reuses
  `audit_service`, `crypto`, `db` and `domain`.

Stack: Python 3.13, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic, SQLite,
Jinja2, markdown-it-py, WeasyPrint, `cryptography`, `num2words`. Frontend: Node
22, React, TypeScript, Vite. WeasyPrint needs `brew install pango` once.

Running: in development, Vite serves the frontend and proxies `/api` to
FastAPI. For daily use, FastAPI serves the built `frontend/dist`, so there is
one process and one origin.

## 3. Data model

All IDs are UUID strings except `audit_events.id`. All timestamps are UTC.

### clients

One row per person. Groom and bride are separate rows because each is a
separate data subject under LGPD.

| Column | Notes |
|---|---|
| `id` | |
| `full_name` | Plain text, max 200. Null once anonymised. |
| `cpf_encrypted` | AES-256-GCM. Null once anonymised. |
| `cpf_lookup` | HMAC-SHA256 of the 11 digits, unique. Null once anonymised. |
| `address_encrypted` | AES-256-GCM. Null once anonymised. |
| `created_at`, `updated_at` | |
| `anonymised_at` | Null while the row identifies a person. |

### contracts

| Column | Notes |
|---|---|
| `id` | |
| `groom_id`, `bride_id` | Foreign keys to `clients`. Must differ. |
| `event_date` | Date, required. |
| `venue_name` | Required, max 200. |
| `venue_address` | Optional, max 300. |
| `coverage_start`, `coverage_end` | Time, optional. |
| `hours_contracted` | Integer 1–24, optional. |
| `photographer_count` | Integer 1–10, default 2. |
| `pix_discount_cents` | Integer, optional. |
| `signing_city` | Default "Curitiba", max 100. |
| `signing_date` | Default today. |
| `version` | Integer, starts at 1, incremented on every edit. |
| `created_at`, `updated_at` | |
| `deleted_at` | Null unless soft-deleted. |

### contract_items

`id`, `contract_id`, `position`, `description` (max 200), `amount_cents`
(integer > 0). A contract has 1 to 20 items.

### audit_events

| Column | Notes |
|---|---|
| `id` | Autoincrementing integer; gives a total order. |
| `occurred_at` | |
| `actor` | From `get_current_actor`; "owner" in this version. |
| `action` | See list below. |
| `entity_type`, `entity_id` | Nullable for rejected requests. |
| `outcome` | `success` or `failure`. |
| `request_id` | |
| `details` | JSON. Never contains personal values. |

Actions: `client.created`, `client.updated`, `client.exported`,
`client.anonymised`, `contract.created`, `contract.updated`,
`contract.deleted`, `contract.restored`, `contract.pdf_generated`,
`request.rejected`.

`details` holds, as applicable: the names of the fields that changed, the
contract `version`, the SHA-256 of a generated PDF, and for rejected requests
the route and the names of the fields that failed validation.

Rules:

- Append-only. `BEFORE UPDATE` and `BEFORE DELETE` triggers on `audit_events`
  raise an error. The repository exposes no update or delete.
- The event is written in the same database transaction as the action. If the
  event cannot be written, the action is rolled back.
- `request.rejected` events are written in their own transaction, since there
  is no action to share one with.

### Where personal data lives

Name, CPF and address exist only in `clients`. Contracts and audit events refer
to a client by ID. Anonymising a client row therefore removes the person from
the whole database.

The contract template prints one address for the couple. The contract form has
one address field; on create and edit it is written to both clients. The PDF
prints the groom's address.

## 4. API

Base path `/api/v1`. JSON bodies use `snake_case`. FastAPI publishes the
OpenAPI schema and the frontend's client types are generated from it.

| Method and path | Purpose | Success |
|---|---|---|
| `POST /contracts` | Create a contract; create or reuse both clients | `201`, `Location`, `ETag` |
| `GET /contracts` | List, newest first | `200` |
| `GET /contracts/{id}` | Read one | `200`, `ETag` |
| `PATCH /contracts/{id}` | Edit | `200`, new `ETag` |
| `DELETE /contracts/{id}` | Soft delete | `204` |
| `POST /contracts/{id}/restore` | Undo a soft delete | `200` |
| `GET /contracts/{id}/pdf` | Render the PDF from current data | `200`, `application/pdf` |
| `GET /clients` | List | `200` |
| `GET /clients/{id}` | Read one | `200` |
| `PATCH /clients/{id}` | Correct name, CPF or address | `200` |
| `GET /clients/{id}/export` | Everything held about the person | `200` |
| `POST /clients/{id}/anonymise` | Irreversibly blank personal data | `200` |
| `GET /audit-events` | List, newest first | `200` |
| `GET /audit-events/{id}` | Read one | `200` |
| `GET /health` | Liveness | `200` |

### Contract request body

```json
{
  "groom": { "full_name": "…", "cpf": "123.456.789-09" },
  "bride": { "full_name": "…", "cpf": "987.654.321-00" },
  "couple_address": "…",
  "event": {
    "date": "2027-03-14",
    "venue_name": "…",
    "venue_address": null,
    "coverage_start": "16:00",
    "coverage_end": null,
    "hours_contracted": null
  },
  "photographer_count": 2,
  "payment": {
    "items": [
      { "description": "Cobertura da cerimônia na igreja", "amount_cents": 120000 }
    ],
    "pix_discount_cents": 30000
  },
  "signing": { "city": "Curitiba", "date": "2026-10-13" }
}
```

`PATCH` accepts the same shape with every field optional. A supplied
`payment.items` replaces the whole list.

### Rules

- Unknown fields are rejected. Every string has a length limit.
- CPFs are accepted with or without punctuation, reduced to 11 digits, and
  checked against their check digits. Groom and bride CPFs must differ.
- On create, each person is looked up by `cpf_lookup`. A match is reused and
  its name and address are updated to the submitted values (audited as
  `client.updated`). No match creates a client.
- `total_cents` = sum of items − discount. It is computed by the server,
  returned in responses, and never accepted in requests.
- The discount, if present, is greater than 0 and less than the items' sum.
- Contract responses embed both clients. Single-resource reads return the full
  CPF, since the edit form needs it. List responses mask it
  (`***.***.***-09`).
- Edits require `If-Match` with the current `ETag` (derived from `version`).
  Missing header: `428`. Stale value: `412`.
- Soft-deleted contracts are omitted from `GET /contracts` unless
  `include_deleted=true`. Reading a soft-deleted contract by ID is allowed.
  Editing it or rendering its PDF returns `409` until it is restored.
- Changing a client's CPF to one that belongs to another client returns `409`.
- Anonymise is refused with `409` while the client is on any contract that is
  not soft-deleted.
- Restore is refused with `409` if either client has been anonymised.
- Lists use cursor pagination (`limit`, `cursor`, response `next_cursor`).
  `GET /audit-events` filters by `action`, `entity_id`, `from` and `to`.
- The PDF response carries `Content-Disposition` with a file name built from
  the couple's first names and the event date, and `X-Content-SHA256`, which
  equals the hash in the `contract.pdf_generated` event.
- Every response carries `X-Request-ID`.

### Errors

All errors are `application/problem+json` (RFC 9457) with `type`, `title`,
`status`, `detail` and `request_id`. Validation errors (`422`) add an `errors`
list of `{ "field": "groom.cpf", "message": "…" }` so the form can mark the
input. Problem responses never contain stack traces or submitted values.

## 5. Contract rendering

- `base_contract/contract_template.md` is a Jinja2 template. It is trusted
  input, edited only by Pedro.
- Pedro's own details come from settings: `CONTRACTOR_NAME`, `CONTRACTOR_CPF`,
  `CONTRACTOR_ADDRESS`, `CONTRACTOR_REPRESENTATIVE`.
- Payment items are rendered by a loop in the template. The PIX discount
  sentence sits in a conditional and is omitted when there is no discount.
- Pipeline: build a context of display strings -> render Jinja2 in a sandboxed
  environment -> Markdown to HTML with raw HTML disabled -> WeasyPrint to PDF
  with a print stylesheet (A4, page numbers).
- Every user-typed value is escaped for Markdown before it enters the template.

Display formats, all produced in `domain/`:

| Value | Format | Example |
|---|---|---|
| Money | BRL | `R$ 2.000,00` |
| Total in words | Portuguese | `dois mil reais` |
| Dates | Long form | `14 de março de 2027` |
| Times | 24-hour | `16:00` |
| Hours contracted | | `6 horas` |
| Missing optional event value | | `A definir` |
| Photographer count | Number and word | `2 (dois)` |
| Photographers phrase | Agrees in number | `2 (dois) fotógrafos`, `1 (um) fotógrafo` |
| CPF | Punctuated | `123.456.789-09` |

## 6. Security and privacy

### 6.1 Access

- The server binds to `127.0.0.1`. It refuses to start on any other address,
  because this version has no authentication.
- `Host` header allowlist (`localhost`, `127.0.0.1`) against DNS rebinding.
- Every non-`GET` request must carry an `Origin` matching the app's own origin
  and a JSON content type. No CORS is enabled.
- Every route depends on `get_current_actor`, which returns `"owner"`. Adding
  login later replaces this one dependency.

### 6.2 Data at rest

- CPF and address are encrypted per field with AES-256-GCM: a random 12-byte
  nonce per value, the table, column and row ID as associated data, and a key
  version prefix so keys can be rotated later.
- `cpf_lookup` is HMAC-SHA256 with a second, separate key.
- Both keys come from `.env` (`FIELD_ENCRYPTION_KEY`, `CPF_LOOKUP_KEY`). The
  app validates them at startup and fails fast if either is missing or
  malformed. A command generates them.
- The SQLite file lives in `data/`, git-ignored, created with mode `0600`.
- `.env` is git-ignored. `.env.example` is committed with placeholder values.
- The README states what to back up (the database and, separately, the keys)
  and that losing the keys loses every CPF and address.

### 6.3 Input, output and logs

- Strict Pydantic models at the boundary; ORM-parametrised SQL only.
- WeasyPrint's URL fetcher is replaced by one that refuses every request.
- Response headers: strict Content Security Policy, `X-Content-Type-Options:
  nosniff`, frame blocking, and `Cache-Control: no-store` on responses that
  contain personal data.
- Logs are structured, carry the request ID, and contain no personal values.

### 6.4 LGPD measures

| Principle or right | Mechanism |
|---|---|
| Minimisation | Only the fields the contract prints are collected. |
| Access | `GET /clients/{id}/export` |
| Rectification | `PATCH /clients/{id}` |
| Elimination | `POST /clients/{id}/anonymise` |
| Security | Field encryption, loopback-only access, audit trail |
| Accountability | Append-only audit of every write, export and PDF |

Anonymising sets `full_name`, `cpf_encrypted`, `cpf_lookup` and
`address_encrypted` to null and sets `anonymised_at`. It cannot be undone.

How long a finished contract may be kept before anonymising is a legal
decision for Pedro's lawyer or accountant. This design covers technical
measures and is not legal advice.

### 6.5 Supply chain

Locked dependencies (`uv.lock`, `package-lock.json`). CI runs `pip-audit`,
`npm audit`, Ruff's security rules and `gitleaks`. Dependabot proposes updates.

## 7. Frontend

Replaced by `2026-10-14-contract-frontend-design.md`, which covers the
contract list, the contract form and a clients screen for export and
anonymisation. Interface text is in Portuguese.

## 8. Testing

Development is test-driven: each behaviour starts as a failing test.

Backend (pytest):

- **Domain, unit:** CPF validation and masking, BRL formatting, amount in
  words, totals and discount rules, photographer and date wording.
  Property-based tests (Hypothesis) for CPF and money.
- **Services, unit:** rendering with each optional field present and absent,
  escaping of hostile input, encryption round-trip, decryption failing with a
  wrong key or altered associated data.
- **Repositories, integration:** a real temporary SQLite file with migrations
  applied, including the triggers that reject audit updates and deletes.
- **API, integration:** each route for success and for every rule in section
  4, plus the `Host` and `Origin` checks and the refusal to bind off loopback.
- **PDF:** text extracted from the generated PDF is compared with the expected
  clauses.
- **Privacy:** create a client, anonymise them, then scan the database file and
  captured logs for the original name and CPF. A second test asserts the raw
  database file never contains a plaintext CPF or address.

Frontend:

- **Component (Vitest, Testing Library):** form validation, adding and removing
  items, running total, API errors mapped to fields.
- **End to end (Playwright):** create a contract and receive a PDF, against the
  real backend.

## 9. Tooling

| Concern | Backend | Frontend |
|---|---|---|
| Runtime | Python 3.13, `uv` | Node 22, npm |
| Lint and format | Ruff | ESLint, Prettier |
| Types | mypy strict | TypeScript strict |
| Coverage gate | 90% lines, 100% on `domain/` | 80% lines |

- Pre-commit hooks run formatters, linters and `gitleaks`.
- GitHub Actions runs lint, types, tests, coverage gates and dependency audits
  on every push and pull request.
- The README documents one command each to install, run, and run all checks.
