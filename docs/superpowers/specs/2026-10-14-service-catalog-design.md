# Service Catalog — Design

Date: 2026-10-14
Status: approved
Branch: `feat/service-catalog` (based on `main`)

## 1. Purpose

Pedro is finding it hard to keep his shoots organised. He wants an agenda of
upcoming events built from his contracts, and some contracts have a second
event: a pre-wedding shoot whose date and place are often only known after
signing. The work is split into three sub-projects, built in this order:

1. **Service catalog** (this spec): contract items are chosen from a list of
   services kept in the database, and some services are marked as
   pre-wedding.
2. **Pre-wedding event**: an optional second event on a contract, which can be
   scheduled later without editing the contract, but only when the contract
   includes a pre-wedding service.
3. **Agenda**: a month calendar and a chronological list of the next month
   and the next three months, with every shoot in one colour.

Today each contract item is a free-text description and an amount. This
sub-project replaces the free text with a choice from the catalog, so items
are consistent and sub-project 2 can reliably tell whether a contract
includes a pre-wedding.

### Success criteria

- Pedro adds, edits, archives and restores services from a "Serviços" screen.
- In the contract form, each item is picked from a dropdown of active
  services; its default price fills in and stays editable.
- Every item on every contract, including those that existed before this
  change, is linked to a service.
- Renaming a service or changing its price never changes the wording or
  amount of an item already on a contract, unless that item itself is
  changed (section 3.3).
- The server can answer "does this contract include a pre-wedding service?".

### Out of scope

- The pre-wedding event and the agenda (sub-projects 2 and 3).
- Free-text items. Every item comes from the catalog; a one-off extra is
  added to the catalog first.
- Deleting services. Archiving hides them instead.
- Service descriptions, categories or ordering other than by name.

## 2. Data model

### services (new)

| Column | Notes |
|---|---|
| `id` | Same id format as contracts. |
| `name` | 1–200 characters, trimmed, same text rules as an item description. Unique, ignoring case, among services that are not archived. |
| `default_price_cents` | Integer > 0, at most 100,000,000 (same bounds as an item amount). |
| `is_prewedding` | Boolean, default false. Several services may be marked. |
| `archived_at` | Null while the service is active. |
| `version` | Integer, starts at 1, incremented on every edit. |
| `created_at`, `updated_at` | |

### contract_items (changed)

- New column `service_id`, a foreign key to `services`, not null after the
  migration.
- `description` and `amount_cents` stay. They are the contract's own copy of
  the item: the PDF, the client export and the contract API keep reading
  them.
- A contract has at most one item per service. This is enforced by the
  service layer (section 3.3) and by a unique index on
  `(contract_id, service_id)`.

### Migration `0002`

1. Create `services`.
2. For each distinct `contract_items.description`, create a service with that
   name and `default_price_cents` equal to the amount on the item from the
   most recently created contract that uses it.
3. Set `is_prewedding = true` where the name contains "pré-wedding" or
   "pre-wedding", ignoring case and accents.
4. Set `contract_items.service_id` to the service with the matching name,
   then make the column not null and add the unique index.
5. If a contract has two items with the same description, the migration
   stops with an error naming the contract id, instead of guessing. Pedro
   fixes that contract by hand and runs the migration again.

The downgrade drops the index, the column and the table. Item descriptions
and amounts are untouched, so no data is lost.

### Audit

New actions: `service.created`, `service.updated`, `service.archived`,
`service.restored`. `details` holds the service id, its `version` and the
names of the fields that changed — never the values, following the rules
for the existing actions.

## 3. API

All endpoints follow the contracts API conventions: `ETag` derived from
`version`, `If-Match` required on `PATCH`, RFC 9457 problem responses, and
`422` errors keyed by field path.

### 3.1 Services

| Endpoint | Purpose | Success |
|---|---|---|
| `GET /api/v1/services` | List services sorted by name (case- and accent-insensitive). `?include_archived=true` adds archived ones. Not paginated. | `200` |
| `POST /api/v1/services` | Create from `{name, default_price_cents, is_prewedding}`. | `201`, `Location`, `ETag` |
| `GET /api/v1/services/{id}` | Read one. | `200`, `ETag` |
| `PATCH /api/v1/services/{id}` | Change any of the three fields. Requires `If-Match`. | `200`, new `ETag` |
| `POST /api/v1/services/{id}/archive` | Hide from the dropdown. | `200` |
| `POST /api/v1/services/{id}/restore` | Make active again. | `200` |

`ServiceOut`: `id`, `name`, `default_price_cents`, `is_prewedding`,
`archived_at`, `version`.

Errors:

| Case | Response |
|---|---|
| Unknown id | `404` |
| Name already used by an active service (create, rename, or restore) | `409` |
| Archive an archived service, or restore an active one | `409` |
| Missing or stale `If-Match` | `428` / `412`, as for contracts |

### 3.2 Contract item shape (breaking change)

- `ItemIn` becomes `{service_id, amount_cents}`. `description` is removed
  from the input.
- `ItemOut` becomes `{service_id, description, amount_cents}`, where
  `description` is the contract's own copy.
- `ItemPatch` follows `ItemIn`; `payment.items` still replaces the whole list.

The frontend and the generated `schema.d.ts` change in the same branch.

### 3.3 Saving items

When a contract is created or its `payment.items` are replaced, for each
incoming item:

- If the contract already has an item with the same `service_id`, the new
  item keeps that item's `description` and takes the incoming
  `amount_cents`.
- Otherwise the item's `description` is the service's current `name`.

So a rename only reaches items added after it, and editing an unrelated part
of a contract never rewords clause 3.1 of its PDF.

Validation, each reported as `422` on `payment.items[n].service_id`:

| Case | Rule |
|---|---|
| `service_id` does not exist | Rejected. |
| Same `service_id` appears twice | Rejected on the second occurrence. |
| Service is archived and the contract did not already have it | Rejected ("serviço arquivado"). |
| Service is archived and the contract already had it | Allowed, so contracts stay editable after a service is archived. |

### 3.4 Pre-wedding check

`ContractService` gains `has_prewedding(contract) -> bool`, true when any
item's service has `is_prewedding`. It is read from the current service
flag, not copied, so marking a service later applies to existing contracts.
Sub-project 2 uses it; this sub-project only adds and tests it.

## 4. Frontend

### 4.1 Services screen — `/servicos`

- New "Serviços" link in the nav, after "Clientes".
- A table with columns Nome, Preço padrão (BRL), Pré-wedding (Sim/Não) and
  actions. A "Mostrar arquivados" checkbox adds archived services, shown
  muted with an "Arquivado" label.
- "Novo serviço" opens a dialog with name, default price and a
  "Ensaio de pré-wedding" checkbox. "Editar" opens the same dialog filled in
  and sends `If-Match`. A `412` shows a banner asking Pedro to reopen the
  service, as the contract form does.
- "Arquivar" and "Restaurar" act directly from the row, like contract delete
  and restore.
- API errors map onto the dialog's fields; a `409` name conflict appears on
  the name field.
- A successful change invalidates the services query. Query keys live with
  the existing shared keys (see commit `02dfa4d`).
- Built from the existing `Table`, `Dialog`, `TextInput`, `Checkbox` and
  `Button` components.

### 4.2 Contract form — `PaymentSection`

- Each item row has a service dropdown in place of the description input.
- The dropdown lists active services by name. A service chosen in another
  row is disabled.
- Choosing a service sets the amount to its default price. Choosing a
  different service replaces the amount; reselecting the same service keeps
  whatever amount Pedro typed.
- When editing, each row shows the contract's own `description` as the
  selected option's label, so the form matches the PDF even if the service
  was renamed. An archived service already on the contract appears as
  "‹description› (arquivado)" and stays selected.
- With no active services, the section shows a short message with a link to
  `/servicos` instead of an empty dropdown.

### 4.3 Supporting changes

- New `Select` in `ui/`: a native `<select>` styled with the design tokens,
  exported from `ui/index.ts`.
- `formModel.ts`: `ItemValues` becomes `{service_id, amount_cents}`.
  Validation requires a service and rejects duplicates, mirroring the API.
  `ITEM_FIELD` maps `payment.items.N.service_id` errors to the row's
  dropdown.
- `schema.d.ts` is regenerated with `make api-types`.
- The README section describing each screen gains "Serviços".

## 5. Testing

Backend (pytest, existing `tests/` layout):

- `db/`: migration `0002` on a database with free-text items — one service
  per distinct description, newest amount, pre-wedding guess, every item
  linked; it stops with an error when a contract repeats a description; the
  downgrade leaves items intact.
- `services/`: rule 3.3 (rename a service, edit the contract's venue, the
  item keeps its wording; a new item gets the new name; a price change keeps
  the wording); duplicate rejected; archived service rejected on a new item
  and allowed on an existing one; name conflict on create, rename and
  restore; `has_prewedding`.
- `api/`: every services endpoint (status codes, `ETag`/`If-Match`, problem
  shapes) and the new item shape on contract create, read and patch.
- `test_privacy.py`: `service.*` audit details contain no values.
- `test_export_openapi.py`: stays green with `openapi.json` regenerated.

Frontend (Vitest and Testing Library):

- Services page: list, archived toggle, create and edit dialogs, `409` on the
  name field, `412` banner, archive and restore.
- Contract form: choosing a service fills the price; the price stays
  editable; chosen services are disabled elsewhere; archived services show on
  old contracts; empty-catalog message; `422` on `service_id` lands on the
  right row.
- `formModel.test.ts` and the create and edit page tests updated for the new
  item shape.

End to end (Playwright against the real backend):

- `e2e/services.spec.ts`: create a service, use it in a new contract,
  download the PDF; rename the service and confirm that editing the contract
  keeps the old wording.

`make check` must pass.
