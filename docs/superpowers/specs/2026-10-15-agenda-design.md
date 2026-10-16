# Agenda — Design

Date: 2026-10-15
Status: approved
Branch: `feat/agenda` (based on `main`)

## 1. Purpose

This is sub-project 3 of 3 toward an agenda of upcoming shoots built from
contracts (1. service catalog — merged in PR #12; 2. pre-wedding event —
merged in PR #13; 3. agenda — this spec).

Pedro finds it hard to keep his shoots organised. The agenda shows every
upcoming wedding and scheduled pre-wedding, taken from the contracts, as a
chronological list and as a month calendar. It becomes the app's start page.

### Success criteria

- Opening the app lands on the Agenda, showing the shoots of the next 30 days
  as a list, without any further click.
- The list can show the next 30 or the next 90 days, counted from today.
- The calendar shows one calendar month at a time, can move month by month in
  both directions, and jumps back to the current month with one click.
- Every shoot looks the same (one colour); a label tells a wedding from a
  pre-wedding.
- Every entry leads to its contract.
- Deleted contracts and unscheduled pre-weddings never appear. Changing a
  contract, its pre-wedding or a client is reflected the next time the agenda
  is shown.

### Out of scope

- Google Calendar or any other sync, iCal export, notifications.
- Editing from the agenda (it is read-only; editing stays in the contract form
  and the pré-wedding dialog).
- Colours per kind, filters, search, printing.
- Week or day views.

## 2. Data and API

No table, column or migration changes.

### 2.1 Entries

An agenda entry is one shoot:

| source      | included when | `date` | `start_time` | `venue_name` |
|-------------|---------------|--------|--------------|--------------|
| wedding     | contract not soft-deleted and its `event_date` in range | `event_date` | `coverage_start` (may be null) | contract `venue_name` |
| pre-wedding | a `prewedding_events` row whose `event_date` is in range, on a contract not soft-deleted | row `event_date` | row `start_time` (may be null) | row `venue_name` |

- A pre-wedding whose service was un-marked after scheduling still appears: it
  is a real appointment until it is cancelled.
- Order: `date`; then `start_time` with null first; then `wedding` before
  `prewedding`; then `contract_id`. The order is stable between loads.

### 2.2 `GET /api/v1/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD`

Read-only. Both dates are inclusive and required.

Response `200`: a JSON array of `AgendaEntryOut`:

```json
[{"contract_id": "…", "kind": "wedding", "date": "2026-10-24",
  "start_time": "16:00:00", "venue_name": "Igreja São José",
  "groom": {"full_name": "João Silva"}, "bride": {"full_name": "Maria Souza"}}]
```

- `kind` is `"wedding"` or `"prewedding"`.
- `groom` / `bride` carry only `full_name`, which is `null` for an anonymised
  client. No CPF, address or other personal data is returned.

Errors (RFC 9457, 422 keyed by field, Portuguese messages as elsewhere):

- `from` or `to` missing or not a date → 422 on that field (FastAPI
  validation).
- `to` before `from` → 422 on `query.to`: "a data final não pode ser
  anterior à inicial".
- Span longer than 120 days (`to - from > 119` days, i.e. more than 120 days
  inclusive) → 422 on `query.to`: "o intervalo máximo é de 120 dias".
- Field names follow FastAPI's query-parameter errors (`query.from`,
  `query.to`), as the existing `query.limit` errors do.

No pagination, no ETag, no audit entry. Past dates are allowed.

### 2.3 Backend structure

- `services/agenda_service.py`: `AgendaEntry` (frozen dataclass:
  `contract_id`, `kind`, `date`, `start_time`, `venue_name`, `groom_name`,
  `bride_name`) and `AgendaService(session).between(start, end) ->
  list[AgendaEntry]`, which runs one query for weddings and one for
  pre-weddings (both excluding soft-deleted contracts), merges and sorts them.
  It validates the range and raises the existing `ContractRuleError("to",
  message)`, which the API already maps to a 422 keyed by field.
- `api/v1/agenda.py`: the router; `AgendaEntryOut` in `schemas.py`; an
  `Agenda` dependency in `deps.py`.

## 3. Frontend

### 3.1 Navigation

- New route `/agenda`, first item in the navigation: Agenda, Contratos,
  Clientes, Serviços.
- `/` redirects to `/agenda` (was `/contratos`). The not-found page's link
  goes to the agenda ("Ir para a agenda").

### 3.2 Agenda page

- Title "Agenda" and a two-option switch **Lista** | **Calendário**.
- The last view used is remembered per device (`localStorage`, wrapped in
  try/catch). Without a stored value, or when storage fails, the list is
  shown.
- "Today" is the browser's local date.

### 3.3 List view

- A range switch **Próximos 30 dias** | **Próximos 90 dias** (default 30,
  remembered like the view).
- Requests `from = today`, `to = today + 30` (or `+ 90`) days.
- Entries are grouped by date under a heading such as "sáb., 24/10/2026";
  today's heading is "Hoje", tomorrow's "Amanhã".
- Each row: the time ("16:00") or "—"; the couple ("João & Maria", using the
  existing `coupleLabel`, so anonymised clients read "Cliente anonimizado");
  the label "Casamento" or "Pré-wedding"; the place. The whole row links to
  `/contratos/{contract_id}`.
- No entries: "Nenhum ensaio ou casamento nos próximos 30 dias." (or 90).

### 3.4 Calendar view

- Header with the month ("outubro de 2026"), **‹** and **›** buttons
  (accessible names "Mês anterior" / "Próximo mês") and a **Hoje** button that
  returns to the current month.
- A grid of whole weeks starting on Sunday, columns "Dom Seg Ter Qua Qui Sex
  Sáb". Days of the neighbouring months are faded; today is outlined.
- Requests `from` = first day shown, `to` = last day shown (28–42 days).
- Each day shows up to 3 chips in the single shoot colour: time (if any), the
  couple, and "Pré" for a pre-wedding. Each chip links to the contract. With
  more than 3 entries a line "+N mais" follows the 3 chips (N = entries − 3).
- Clicking a day's number, or its "+N mais", lists that day's entries below
  the grid (same rows as the list view). This is the same on every screen
  width; there is no separate dialog.
- Narrow screens (below 640px wide; the app has no breakpoint yet, this
  introduces one): days show a dot instead of chips; tapping a day lists its
  entries below the grid as above.
- No empty-state message; empty days are blank.

### 3.5 Loading, errors, freshness

- Loading shows "Carregando…", errors the usual banner with "Tentar de novo",
  as on the other list pages.
- Queries are keyed by `["contracts", "agenda", from, to]`; moving months or
  switching ranges fetches again; data already fetched is reused.
- Because the key sits under `["contracts"]`, every mutation that already
  invalidates contract data (create, update, delete, restore a contract;
  schedule or cancel a pre-wedding; anonymise a client) refreshes the agenda
  too, with no change to those mutations.

## 4. Edge cases

- Wedding and pre-wedding of one contract on the same day: two entries, the
  wedding first (unless the pre-wedding has an earlier time — order is by time
  first, nulls first).
- Entries on the boundary days (today; today + 30/90; first/last grid day) are
  included.
- Restoring a deleted contract brings back both its entries.
- Times are wall-clock values shown as stored; no timezone conversion.

## 5. Testing

- **Backend (pytest):** entries inside the range included and just outside
  excluded, both boundaries inclusive; deleted contract hides both entries and
  restore brings them back; unscheduled pre-wedding adds nothing; a schedule
  whose service was un-marked still appears; ordering (time, nulls first,
  wedding before pre-wedding, contract id); anonymised client → `null` name;
  response carries no CPF or address; 422 for missing date, `to` before
  `from`, span over 120 days; exactly 120 days accepted.
- **Frontend (Vitest + MSW):** `/` lands on the agenda; list requests the right
  range for 30 and 90 days, groups by day with Hoje/Amanhã, shows the empty
  message; a row links to its contract; calendar requests the right range for
  a month whose weeks spill over, ‹ › and Hoje work, a day with 4 entries
  shows 3 chips and "+1 mais", and opening it lists all 4; clicking a day lists
  its entries; view and range are
  remembered and the page works when storage throws; error banner and retry;
  the agenda's query key sits under the contracts key.
- **E2E (Playwright):** create a contract dated within the next 30 days with a
  pre-wedding service and schedule its pre-wedding; open the app, land on the
  Agenda and see both entries in the list; switch to the calendar and see them
  in the month; click one to reach the contract.
- **README:** a short "Agenda" section.

`make check` and `make e2e` pass.
