# Pre-wedding Event — Design

Date: 2026-10-15
Status: approved
Branch: `feat/prewedding-event` (based on `main`)

## 1. Purpose

This is sub-project 2 of 3 toward an agenda of upcoming shoots built from
contracts (1. service catalog — merged in PR #12; 2. pre-wedding event — this
spec; 3. agenda).

Some contracts include a pre-wedding shoot. Its date and place are sometimes
known when the contract is created, but often only after signing. This
sub-project lets a contract carry one optional pre-wedding event — date,
place, optional address, optional start time — entered at creation or
scheduled later without editing the contract. Only contracts that include a
service marked `is_prewedding` in the catalog can have one.

### Success criteria

- When creating a contract that includes a pre-wedding service, the
  pre-wedding date and place can be filled in or left for later.
- From the contracts list, a pre-wedding can be scheduled, changed or
  cancelled without opening the contract form and without changing the
  contract's version, audit trail or PDF.
- A contract without a pre-wedding service can never have a pre-wedding.
- Removing the last pre-wedding item from a contract with a scheduled
  pre-wedding is only possible after an explicit confirmation, and cancels the
  pre-wedding in the same save.
- The server can list each contract's pre-wedding, so sub-project 3 can put
  it on the agenda.

### Out of scope

- Showing the pre-wedding in the contract PDF (it never appears there).
- A notes field, a pre-wedding page of its own, more than one pre-wedding per
  contract.
- The agenda itself (sub-project 3).

## 2. Data model

### prewedding_events (new)

| column          | type                                    | required |
|-----------------|-----------------------------------------|----------|
| `id`            | UUID string(36), primary key            | yes      |
| `contract_id`   | FK → `contracts.id`, unique             | yes      |
| `event_date`    | date                                    | yes      |
| `venue_name`    | string(200), trimmed, non-empty         | yes      |
| `venue_address` | string(300), trimmed, empty → null      | no       |
| `start_time`    | time                                    | no       |
| `version`       | int, starts at 1, +1 on every change    | yes      |
| `created_at`    | UTC datetime                            | yes      |
| `updated_at`    | UTC datetime                            | yes      |

The unique constraint is named `uq_prewedding_events_contract_id` and the FK
`fk_prewedding_events_contract_id_contracts` (Alembic batch mode needs named
constraints). Cancelling deletes the row; scheduling again creates a new row
with version 1.

### Eligibility

A contract is eligible when it is not soft-deleted and at least one of its
items links to a service with `is_prewedding = true` (the existing
`ContractService.has_prewedding`). Eligibility is checked on every schedule or
change. It is not checked on cancel: cancelling always works.

- No rule ties `event_date` to the wedding date or to today: pre-weddings are
  sometimes shot after the wedding, and may be recorded after the fact.
- A soft-deleted contract keeps its pre-wedding row, but the row is treated as
  absent: reads return 404 and the agenda will skip it. Restoring the
  contract brings it back.
- Un-marking a service as pre-wedding in the catalog keeps existing
  schedules. Changing them is then refused (409), cancelling still works. The
  catalog edit is not blocked.

### Migration `0003_prewedding_events`

Creates the table with its named FK and unique constraint. Touches no
existing data. The downgrade drops the table.

### Audit

New actions, `entity_type = "prewedding"`, `entity_id` = the pre-wedding id:

- `prewedding.scheduled` — details `{"version": 1, "contract_id": …}`
- `prewedding.updated` — details `{"version": n, "fields": [changed field names]}`
- `prewedding.cancelled` — details `{"version": n}`, plus
  `"via": "contract_update"` when cancelled through a contract edit.

Details never contain dates, places, addresses or times.

## 3. API

Conventions as elsewhere: strong `ETag: "<version>"`, `If-Match` on edits
(missing → 428, stale or malformed → 412 "The prewedding changed since it was
loaded"), RFC 9457 problem responses, 422 errors keyed by field. Error
messages are in Portuguese as in the rest of the API.

### 3.1 `/api/v1/contracts/{contract_id}/prewedding`

Body for `PUT` (`PreweddingIn`):

```json
{"date": "2027-03-12", "venue_name": "Parque Barigui",
 "venue_address": null, "start_time": "16:00"}
```

Response (`PreweddingOut`): the same fields plus `version`.

| method   | behaviour | responses |
|----------|-----------|-----------|
| `GET`    | Read the pre-wedding. | 200 + ETag. 404 when the contract does not exist or is deleted ("contrato não encontrado") or nothing is scheduled ("pré-wedding não agendado"). |
| `PUT`    | Schedule or change. | 201 + ETag when created, 200 + ETag when changed. 409 when the contract is not eligible ("este contrato não inclui pré-wedding"). 404 when the contract does not exist or is deleted. 422 on invalid fields. |
| `DELETE` | Cancel. Requires `If-Match`. | 204. 404 as for `GET`. 428 / 412. |

`If-Match` on `PUT`:

- Nothing scheduled: `If-Match` is not required (and ignored if sent).
- Something scheduled: `If-Match` is required; missing → 428, stale → 412.
  This also covers two simultaneous first schedules: the second sees a row
  and gets 428 instead of overwriting.
- A unique-constraint race on insert is reported as 428 as well.

### 3.2 Contract endpoints (changed)

- `POST /contracts` accepts an optional `prewedding: PreweddingIn | null`.
  When given and the contract's items include no pre-wedding service → 422
  on field `prewedding`: "inclua um serviço de pré-wedding". When valid, the
  pre-wedding is created in the same transaction and audited
  `prewedding.scheduled`.
- `PATCH /contracts/{id}` accepts an optional `cancel_prewedding: bool`
  (default false). When a pre-wedding is scheduled and the new items include
  no pre-wedding service:
  - without the flag → 409 problem with `code: "prewedding_scheduled"`,
    nothing saved;
  - with the flag → the contract is updated and the pre-wedding deleted in
    one transaction, audited `prewedding.cancelled` with
    `"via": "contract_update"`.
  When a pre-wedding item remains, or nothing is scheduled, the flag is
  ignored. `PATCH` never creates or changes a pre-wedding.
- `ContractOut` and the contract list rows gain `has_prewedding: bool` and
  `prewedding: PreweddingOut | null`. For a soft-deleted contract both are
  reported as `false` / `null`.

Pre-wedding operations never change the contract's version, ETag or audit
trail, apart from a cancellation done by a contract `PATCH` (which is a
contract edit anyway). The PDF renderer ignores pre-weddings.

## 4. Frontend

### 4.1 Contract form — create

A "Pré-wedding" section appears when any chosen item's service is a
pre-wedding service (from the catalog's `is_prewedding`), and disappears when
none is. Fields: Data, Local, Endereço, Horário. Hint: "Pode deixar em branco
e agendar depois." The group is optional; if any field is filled, Data and
Local become required. Values in a hidden section are not sent.

### 4.2 Contract form — edit

The section shows a read-only summary: "Pré-wedding: 12/03/2027 às 16:00 ·
Parque Barigui" (time omitted when absent), or "Pré-wedding: não agendado".

If the last pre-wedding item is removed while `contract.prewedding` is set,
Save opens a confirmation: "Este contrato tem um pré-wedding agendado em
12/03/2027. Remover o item cancela esse agendamento." Buttons **Voltar** and
**Remover e salvar**; the latter resends with `cancel_prewedding: true`. A
409 `prewedding_scheduled` from the server opens the same dialog (someone
scheduled one meanwhile).

### 4.3 Contracts list

Rows with `has_prewedding` get a button: "Agendar pré-wedding" when nothing
is scheduled, "Pré-wedding 12/03" when something is. It opens the
**pré-wedding dialog**:

- The four fields, prefilled when scheduled; Data and Local required.
- **Salvar** and **Cancelar**; when scheduled, also **Desmarcar
  pré-wedding**, which asks for confirmation first.
- Cancelar and Escape are disabled while saving.
- On 412: the contracts list is refetched and the message "O pré-wedding
  mudou desde que foi aberto. Os dados foram recarregados." is shown.
- Field errors from 422 appear next to each field; 409 shows its message.

### 4.4 Supporting changes

- Hooks `useSchedulePrewedding` (PUT, sending `If-Match` from the known
  version when one exists) and `useCancelPrewedding` (DELETE); both
  invalidate the contract list and that contract's detail.
- Regenerated OpenAPI types; MSW fixtures gain `has_prewedding` and
  `prewedding`.

## 5. Testing

- **Migration:** `0003` up and down on a database at `0002` with contracts.
- **Service (pytest):** schedule, change, cancel; refused when not eligible
  or deleted; version checks; audit details hold no dates or places; a
  schedule survives un-marking its service, cannot then be changed, can be
  cancelled; create-with-pre-wedding requires a pre-wedding item;
  removing the item → 409 without the flag, joint update with it; flag
  ignored when an item remains; pre-wedding operations leave the contract
  version unchanged.
- **API:** every status in 3.1 including the simultaneous-first-schedule
  428; `has_prewedding` / `prewedding` in detail and list.
- **PDF:** a contract renders the same text with and without a pre-wedding.
- **Frontend (Vitest + MSW):** section shows and hides with the item; the
  all-or-nothing rule; edit summary; removal confirmation in both the
  form-detected and 409 paths; list button text; dialog create, change,
  cancel, 412 reload, blocked closing while saving.
- **E2E (Playwright):** create a contract with a pre-wedding service and an
  empty section; schedule from the list and see the date on the button;
  remove the item in the contract form, confirm, and see the button gone.

`make check` and `make e2e` pass.
