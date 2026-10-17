# Instalments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every contract a payment plan of 1–4 monthly instalments, let Pedro mark them paid on a new Negócio page, and remind him in the Agenda during the last week of the month.

**Architecture:**
- **Backend:** a pure `domain/instalments.py` holds the split, spread, validation and month rules. A new `instalments` table (Alembic `0004`, with a backfill of existing contracts) hangs off `contracts`. `ContractService` saves the plan with the contract (create and PATCH, same version rule). A small `InstalmentService` marks instalments paid or unpaid, without touching the contract version, and lists them for the Negócio page and the Agenda reminder.
- **Frontend:** a new "Parcelas" form section, a `/negocio` page, and a "Cobranças" box in the Agenda, all built from existing `ui/` components.

**Tech Stack:**
- Backend: Python 3.13, FastAPI, SQLAlchemy 2.0, Alembic, pytest.
- Frontend: React 19, TypeScript, TanStack Query, React Hook Form, Vitest, MSW.
- End to end: Playwright with axe.

**Spec:** `docs/superpowers/specs/2026-10-17-instalments-design.md`

## Global Constraints

**Plan rules**
- Plan: 1 to 4 instalments. Each has `number` (1..N), `month` as `"YYYY-MM"`, `amount_cents` > 0, and `paid_on` as a date or null.
- Months strictly increase by number. The sum of the amounts equals the contract's `total_cents` exactly (the total after the PIX discount).
- Equal split: `floor(total / N)` each, with the leftover centavos on the last instalment. A total change is spread equally over the unpaid instalments, with leftover centavos on the last unpaid one.
- Paid instalments are immutable (month, amount, number) until undone.
- Marking paid or unpaid never changes the contract `version`, `updated_at` or PDF.

**Audit**
- New audit actions: `instalment.paid` and `instalment.unpaid`. Details hold `{"number": n, "month": "YYYY-MM"}` only, with `entity_type="contract"` and `entity_id=<contract id>`. No names, CPFs or amounts.
- A plan change during a contract save appends `"instalments"` to the `contract.updated` fields and bumps the version, as other fields do.

**Rules for deleted contracts and the plan form**
- Deleted contracts: their instalments are hidden from the list and reminder endpoints. Marking paid or unpaid returns 409. Restoring a contract brings them back unchanged.
- `plan_needs_review`: set by the migration. Cleared by any contract save whose request includes `instalments`.

**Text, date and frontend rules**
- UI text is Portuguese:
  - Section "Parcelas"; options "À vista" and "Parcelado"; label "Nº de parcelas"; the line "Total após desconto PIX".
  - Page title "Negócio"; menu entry "Negócio" after "Serviços".
  - Groups "Atrasadas", "<Month name>" (e.g. "Outubro") and "Próximos meses".
  - Buttons "Marcar como paga" and "Desfazer"; badge "Revisar plano".
  - Reminder box "Cobranças", with lines "Cobrar parcela: <casal> · n/N · R$ x".
- "Today" and "current month" use the browser's local date in the UI and `dt.date.today()` on the server (migration only).
- Reminder window: from the month's last day minus 6 through its last day, inclusive.
- All existing project rules hold: layered backend, RFC 9457 problems, money as integer centavos, the `ui/` layer with tokens only, WCAG 2.2 AA, CSP `default-src 'self'`, tests that query by role, label and text, and no edits to existing tests unless a task step names them.

## Review Focus

1. **Totals that don't divide evenly** (R$ 10,00 in 3 → 3,33 / 3,33 / 3,34): the split and the spread must keep the sum exact. Tests in Task 1.
2. **Month arithmetic across a year end and the February window** (Dec → Jan; the last 7 days of Feb in leap and non-leap years). Tests in Tasks 1 and 7.
3. **A total change on a fully paid plan, or one that would push an unpaid instalment to ≤ 0:** a 422 with a plan field error, never a 500 or a silent mismatch. Test in Task 3.
4. **Double-clicking "Marcar como paga":** one request takes effect, and the second (409 "already paid") is shown as a calm message, not an error toast. Tests in Tasks 4 and 6.
5. **A deleted then restored contract:** its instalments, paid ones included, come back exactly as they were. Test in Task 3.

---

### Task 1: Domain rules for instalments

**Files:**
- Create: `backend/src/gerenciador/domain/instalments.py`
- Test: `backend/tests/domain/test_instalments.py`

**Interfaces:**
- Produces:
  - `MAX_INSTALMENTS = 4`
  - `Month = str` (`"YYYY-MM"`)
  - `month_of(day: dt.date) -> str`
  - `add_months(month: str, n: int) -> str`
  - `split_equally(total_cents: int, count: int) -> list[int]`
  - `spread_change(amounts: Sequence[int], paid: Sequence[bool], new_total: int) -> list[int]`. Raises `ContractRuleError("instalments", …)` when no instalment is unpaid but the total changed, or when an unpaid amount would become ≤ 0.
  - `validate_plan(months: Sequence[str], amounts: Sequence[int], total_cents: int) -> None`. Raises `ContractRuleError` with field `instalments` for a bad count or a wrong sum, and `instalments.<i>.month` or `instalments.<i>.amount_cents` for a bad month order or a non-positive amount.
  - `in_reminder_window(today: dt.date) -> bool`

- [ ] **Step 1: Write the failing tests**
  - `split_equally(1000, 3) == [333, 333, 334]`; `split_equally(396000, 4) == [99000] * 4`; `split_equally(5, 1) == [5]`. Every result sums to its total.
  - `spread_change([1400, 1400, 1400], [True, False, False], 4800) == [1400, 1700, 1700]`. A decrease: `spread_change([1000, 1000], [True, False], 1500) == [1000, 500]`. Leftover centavos go to the last unpaid one: `spread_change([100, 100, 100], [False, False, True], 301) == [100, 101, 100]`.
  - `spread_change` raises with field `"instalments"` in two cases: all paid and the total changed, and a decrease that would make an unpaid amount 0.
  - `add_months("2026-12", 1) == "2027-01"`; `add_months("2027-01", -1) == "2026-12"`; `month_of(date(2026, 10, 17)) == "2026-10"`.
  - `validate_plan` rejects each of these: 0 instalments, 5 instalments, a sum ≠ total, months not strictly increasing, an amount ≤ 0, and a malformed month (`"2026-13"`, `"26-10"`).
  - `in_reminder_window`:
    - True on 2026-10-25 through 2026-10-31; False on 2026-10-24.
    - True on 2027-02-22 and False on 2027-02-21 (28-day month).
    - True on 2028-02-23 and False on 2028-02-22 (leap year).
- [ ] **Step 2: Run them to verify they fail**
  Run (from `backend/`): `DYLD_FALLBACK_LIBRARY_PATH="$(brew --prefix)/lib" uv run python -m pytest tests/domain/test_instalments.py -v`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement the functions in `domain/instalments.py`**
  - Pure: standard library plus `ContractRuleError` from `domain/contract.py`.
  - `in_reminder_window` compares `today.day > last_day - 7`, using `calendar.monthrange`.
- [ ] **Step 4: Run the tests and coverage**
  Run: `make check` (from the repository root). Expected: PASS, with `domain/` still at 100% line coverage.
- [ ] **Step 5: Commit**: `feat: add instalment split, spread and reminder-window rules`

---

### Task 2: Instalments table, model and backfill migration

**Files:**
- Create: `backend/migrations/versions/0004_instalments.py`
- Modify: `backend/src/gerenciador/db/models.py` (new `Instalment` model; `Contract.instalments` and `Contract.plan_needs_review`)
- Test: `backend/tests/db/test_instalments_migration.py`

**Interfaces:**
- Produces:
  - Table `instalments` with columns:
    - `id` String(36) PK
    - `contract_id` FK `contracts.id`, NOT NULL
    - `number` Integer
    - `month` String(7)
    - `amount_cents` Integer
    - `paid_on` Date, nullable
  - `UniqueConstraint("contract_id", "number", name="uq_instalments_contract_number")`. CHECK constraints: `amount_cents > 0` and `number BETWEEN 1 AND 4`.
  - `contracts.plan_needs_review` Boolean, NOT NULL, default false.
  - `Contract.instalments: Mapped[list[Instalment]]`, ordered by `number`, with `cascade="all, delete-orphan"` and `lazy="selectin"`.
  - `Instalment` model with the columns above.

- [ ] **Step 1: Write the failing migration test**
  - On a database migrated to `0003`, insert two contracts with items, one of them soft-deleted, one with a PIX discount. Then run `upgrade` to `0004`.
  - Assert each contract has exactly one instalment:
    - `number == 1`;
    - `month == month_of(date.today())`;
    - `amount_cents` equals the sum of its items minus the discount;
    - `paid_on is None`.
  - Assert `plan_needs_review` is true for both, `version` is unchanged and no `audit_events` rows were added.
  - Assert `downgrade` to `0003` drops the table and the column.
  - Follow the existing migration tests in `backend/tests/db/test_database.py` for setup.
- [ ] **Step 2: Run it to verify it fails.** Expected: FAIL (no revision 0004).
- [ ] **Step 3: Implement the migration and the model**
  - The backfill computes the total in SQL, per contract: `SUM(contract_items.amount_cents) - COALESCE(pix_discount_cents, 0)`.
  - It generates a UUID per row in Python, iterating over the selected contracts.
  - It uses `dt.date.today()` for the month.
- [ ] **Step 4: Run** `make check`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: store each contract's payment plan and backfill existing contracts`

---

### Task 3: Save the plan with the contract

**Files:**
- Modify:
  - `backend/src/gerenciador/services/contract_service.py`
  - `backend/src/gerenciador/api/v1/schemas.py`
  - `backend/src/gerenciador/api/v1/contracts.py` (only if the PATCH wiring needs it)
- Test: `backend/tests/api/test_contracts_api.py` (new tests appended) and `backend/tests/services/test_contract_instalments.py` (new)

**Interfaces:**
- Consumes: Task 1 functions and the Task 2 model.
- Produces:
  - `InstalmentInput(month: str, amount_cents: int)` (frozen dataclass) in `contract_service.py`.
  - `ContractInput.instalments: list[InstalmentInput] | None = None`. `None` means the plan was not sent (PATCH only).
  - `InstalmentView(number: int, month: str, amount_cents: int, paid_on: dt.date | None)`.
  - `ContractView.instalments: list[InstalmentView]` and `ContractView.plan_needs_review: bool`.
  - API:
    - `InstalmentIn {month: str (pattern ^\d{4}-(0[1-9]|1[0-2])$), amount_cents: Cents}`.
    - `ContractCreate.instalments: list[InstalmentIn]`, required, 1–4 items.
    - `ContractPatch.instalments: list[InstalmentIn] | None`. Only when the field is present in the request does `apply_to` pass a plan. Otherwise it passes `None` so the server spreads the change.
    - `InstalmentOut {number, month, amount_cents, paid_on}`.
    - `ContractOut.instalments: list[InstalmentOut]` and `ContractOut.plan_needs_review: bool`.

**Save rules:**
- **On create:** `validate_plan` against the computed total, then store numbers 1..N.
- **On PATCH with `instalments`:**
  - Validate against the new total.
  - Every instalment that is currently paid must appear at the same number with the same month and amount. Otherwise raise `ContractRuleError("instalments.<i>.amount_cents" or ".month", "parcela já paga não pode ser alterada")`. The count also can't drop below the number paid.
  - Unpaid rows are replaced. Paid rows keep their `paid_on`.
  - Clear `plan_needs_review`.
  - Append `"instalments"` to the changed fields when anything differs.
- **On PATCH without `instalments`, when `total_cents` changed:** apply `spread_change`, which raises the 422 itself, and append `"instalments"` to the changed fields.

- [ ] **Step 1: Write the failing tests**
  - Create with a 3-instalment custom plan (30/30/40 of the total): 201, and `instalments` echoed with numbers 1–3 and `paid_on: null`.
  - Create with a plan whose sum ≠ total: 422, field `instalments`.
  - Create without `instalments`: 422.
  - PATCH that raises an item amount (with no `instalments` sent) after instalment 1 is marked paid (set `paid_on` directly in the session): the unpaid ones absorb the difference equally, the version bumps, and `contract.updated` fields include `"instalments"`.
  - PATCH that changes the total when all instalments are paid: 422, field `instalments`.
  - PATCH that sends a plan changing a paid instalment's amount: 422 with the "parcela já paga" message.
  - PATCH that sends `instalments` on a contract with `plan_needs_review` true: the flag becomes false. A PATCH that changes only `venue_name` leaves the flag unchanged.
  - Delete and restore a contract with one paid instalment: `GET` returns the same instalments, including `paid_on`.
  - The existing contract tests keep passing. Where existing create helpers (`payload()` fixtures, `make_input()`) need a plan, add a default single-instalment plan for the current month to the fixture, not to each test.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Implement the service and schema changes.**
- [ ] **Step 4: Run** `make check` and `make api-types`, and commit the regenerated `frontend/src/api/schema.d.ts`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: save each contract's instalment plan and spread total changes over unpaid instalments`

---

### Task 4: Mark paid and list instalments

**Files:**
- Create:
  - `backend/src/gerenciador/services/instalment_service.py`
  - `backend/src/gerenciador/api/v1/instalments.py`
- Modify:
  - `backend/src/gerenciador/api/v1/__init__.py` (router)
  - `backend/src/gerenciador/api/deps.py` (dependency)
  - `backend/src/gerenciador/api/v1/schemas.py`
- Test: `backend/tests/api/test_instalments_api.py`

**Interfaces:**
- Produces:
  - `POST /api/v1/contracts/{contract_id}/instalments/{number}/paid`, body `{ "paid_on": "YYYY-MM-DD" }`: 200 with the `InstalmentOut`.
    - 404: unknown contract or number.
    - 409: contract deleted, or already paid (problem `detail` "already paid").
    - Audits `instalment.paid`.
  - `DELETE /api/v1/contracts/{contract_id}/instalments/{number}/paid`: 200 with the `InstalmentOut`.
    - 409: deleted contract, or not paid.
    - Audits `instalment.unpaid`.
  - `GET /api/v1/instalments?unpaid_through=YYYY-MM` (the parameter is optional): every instalment of non-deleted contracts, ordered by month, then contract event date, then number.
    - Shape `InstalmentListItem {contract_id, groom_name, bride_name, number, count, month, amount_cents, paid_on, plan_needs_review}`.
    - With `unpaid_through`, only unpaid instalments whose month is ≤ that month (the reminder list).
    - Names follow the agenda's `groom_name`/`bride_name` pattern, null when anonymised.
  - None of these change the contract's `version` or `updated_at`.

- [ ] **Step 1: Write the failing tests**
  - Mark paid: 200, `paid_on` stored, the contract version is unchanged, and an `instalment.paid` audit row has details exactly `{"number": 1, "month": "2026-10"}`.
  - Mark paid twice: the second call returns 409 with "already paid".
  - Unpaid on a paid instalment: 200, and `paid_on` becomes null.
  - Unpaid on an unpaid one: 409.
  - Unknown number: 404.
  - Deleted contract: 409 for both actions.
  - The list hides deleted contracts. `unpaid_through=2026-10` returns unpaid instalments for 2026-09 and 2026-10, but not 2026-11 and not paid ones.
  - Writes keep the existing Origin/JSON checks. Copy one existing "write without Origin is rejected" style assertion for the POST.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Implement the service, router and schemas**
  - Follow the pre-wedding route/service pattern for transactions and audit.
  - Run `make api-types` and commit the regenerated `schema.d.ts`.
- [ ] **Step 4: Run** `make check`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: mark instalments paid or unpaid and list them for the business area`

---

### Task 5: Parcelas section in the contract form

**Files:**
- Create:
  - `frontend/src/domain/instalments.ts` (+ `.test.ts`)
  - `frontend/src/features/contracts/sections/PlanSection.tsx`
- Modify:
  - `frontend/src/features/contracts/formModel.ts` (+ tests)
  - `frontend/src/features/contracts/useContractForm.ts`
  - `frontend/src/features/contracts/ContractForm.tsx` (render `PlanSection` between `PaymentSection` and `SigningSection`)
  - `frontend/src/test/fixtures.ts` (`makeContract` gains `instalments` and `plan_needs_review`)
- Test: `frontend/src/features/contracts/ContractFormPage.create.test.tsx` and `ContractFormPage.edit.test.tsx` (new tests appended)

**Interfaces:**
- Consumes: Task 3's API types (`InstalmentIn`, `InstalmentOut`, `ContractOut.instalments`).
- Produces (`domain/instalments.ts`): `splitEqually(total: number, count: number): number[]`, `spreadChange(amounts: number[], paid: boolean[], newTotal: number): number[] | null` (null when the backend would refuse), `addMonths(month: string, n: number): string`, `currentMonth(today?: Date): string` and `inReminderWindow(today?: Date): boolean`. Same rules as Task 1.
- Form values `plan: { mode: "single" | "split"; rows: { month: string; amount: string; paidOn: string | null }[] }`. Amounts are text, converted with `parseBrl` as for items. `toRequest` adds `instalments`, and `fromContract` fills `plan` from `ContractOut.instalments`.

**Form behaviour:**
- **New contract default:** À vista with one row in the current month for the whole total.
- **Parcelado:** shows "Nº de parcelas" (2–4).
- **Re-splitting:** changing the count, or the total while no amount was hand-edited, re-splits the unpaid rows. On create that means `splitEqually`; on edit, `spreadChange` over unpaid rows.
- **Months:** new rows get consecutive months after the last row.
- **Paid rows:** shown locked ("paga em dd/mm"), with month and amount disabled. The count can't drop below the number paid.
- **Validation:** client-side errors mirror Task 1. The sum must equal "Total após desconto PIX" (message "a soma das parcelas deve ser igual ao total"), months must strictly increase and amounts must be > 0. Each money field keeps the "em reais" description.

- [ ] **Step 1: Write the failing tests**
  - Unit (`instalments.test.ts`): the same values as Task 1's split, spread, add-months and window cases.
  - Component, create:
    - the default is À vista with one row for the full total;
    - choosing Parcelado with 4 rows splits R$ 3.960,00 into 4 × R$ 990,00 across consecutive months;
    - editing one amount so the sum is off shows the sum message and blocks Salvar;
    - saving sends `instalments` in the POST body.
  - Component, edit: a contract whose instalment 1 is paid shows that row locked and "paga em 05/10". Changing an item amount re-spreads only the unpaid rows. The PATCH includes `instalments`.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Implement.** Existing contract tests must keep passing. If an existing test's MSW handler returns a contract without `instalments`, update `makeContract` (the fixture), not the test.
- [ ] **Step 4: Run** `npm run format:check && npm run lint && npm run typecheck && npm test`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: set a contract's instalment plan in the contract form`

---

### Task 6: Negócio page with Parcelas

**Files:**
- Create:
  - `frontend/src/api/instalments.ts`
  - `frontend/src/features/business/BusinessPage.tsx` (+ `.module.css`, layout only)
  - `frontend/src/features/business/BusinessPage.test.tsx`
  - `frontend/src/features/business/groups.ts` (+ `.test.ts`)
- Modify:
  - `frontend/src/app/routes.tsx` (route `negocio`, and a "Negócio" link after "Serviços")
  - `frontend/src/api/keys.ts` (`instalmentKeys`)

**Interfaces:**
- Consumes: Task 4's endpoints.
- Produces:
  - `useInstalments(params?: { unpaidThrough?: string })`, `useMarkPaid()` and `useMarkUnpaid()`. Both mutations invalidate `instalmentKeys.all` and `contractKeys.one(id)`.
  - `groupInstalments(items, currentMonth): { late, thisMonth, upcoming }`:
    - `late` holds unpaid items with month < current, oldest first;
    - `thisMonth` holds all items of the current month;
    - `upcoming` holds unpaid items with month > current, grouped by month.

**Row content:** "Bruno & Ana", "2/3", the month name, and the amount in BRL. Each row links to its contract.

**Actions:**
- **Marcar como paga** sends today's local date.
- **Desfazer** appears on paid rows.
- A 409 "already paid" or "not paid" refreshes the list and shows a calm info toast "Esta parcela já estava atualizada.". Other errors follow the existing per-action error rules (`describeUnexpected` for non-unexpected `ApiError`s).

**Late rows and the review badge:**
- Late rows carry an icon and the word "Atrasada", not colour alone.
- A **Revisar plano** badge shows on rows whose contract has `plan_needs_review`.

**Layout:**
- Use the `SegmentedControl` only once more than one tab exists. For now the page shows the "Parcelas" heading only.
- Empty state: "Nenhuma parcela por aqui."

- [ ] **Step 1: Write the failing tests**
  - `groups.test.ts`: grouping around a current month of `2026-12`, with items in 2026-11, 2026-12 and 2027-01.
  - `BusinessPage.test.tsx`:
    - the page shows the three groups with the right rows;
    - Marcar como paga posts `{paid_on: <today>}` and the row shows "✓ paga em dd/mm";
    - Desfazer sends the DELETE;
    - a 409 on Marcar como paga shows "Esta parcela já estava atualizada." and refetches;
    - a double click sends one POST;
    - the Revisar plano badge appears;
    - the nav has a "Negócio" link that opens `/negocio`.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the frontend checks. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: add the Negócio page to mark instalments paid`

---

### Task 7: Cobranças reminder in the Agenda

**Files:**
- Create: `frontend/src/features/agenda/Reminders.tsx`
- Modify: `frontend/src/features/agenda/AgendaPage.tsx` (render `Reminders` above both views)
- Test: `frontend/src/features/agenda/AgendaPage.test.tsx` (new tests appended)

**Interfaces:**
- Consumes:
  - `useInstalments({ unpaidThrough: currentMonth() })`, which is only fetched when `inReminderWindow()` is true;
  - `inReminderWindow` and `currentMonth` from Task 5.

**Box content:**
- A "Cobranças" box lists "Cobrar parcela: Caio & Duda · 1/4 · R$ 990,00" per unpaid instalment due this month or earlier.
- Each line links to `/negocio`.
- The box is hidden outside the window or when the list is empty.

- [ ] **Step 1: Write the failing tests** (fake timers that fake `Date` only, as the existing create tests do):
  - On 2026-10-27 the box lists an unpaid instalment for 2026-10 and a late one for 2026-09.
  - On 2026-10-20 there is no box and no request (MSW `onUnhandledRequest: "error"` proves it).
  - On 2027-02-22 the box shows; on 2027-02-21 it doesn't.
  - A line links to `/negocio`.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the frontend checks. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: remind about unpaid instalments in the Agenda's last week of the month`

---

### Task 8: End to end, accessibility and README

**Files:**
- Create: `frontend/e2e/instalments.spec.ts`
- Modify:
  - `frontend/e2e/a11y.spec.ts` (add `/negocio` to the scanned screens)
  - `frontend/e2e/layout.spec.ts` (add `/negocio` to the overflow screens)
  - `frontend/e2e/helpers.ts` (if `createContract` must fill the Parcelas section — it should work with the À vista default unchanged)
  - `README.md` (one paragraph: the Parcelas section, the Negócio page, and the Agenda reminder in the last week of the month)

**Scenarios (`instalments.spec.ts`):**
1. Create a contract choosing Parcelado with 3 instalments (equal split). Then open Negócio, see this month's instalment, click Marcar como paga, and see "✓ paga em". Desfazer brings it back to open.
2. With the browser clock set to the 27th of the current month, the Agenda shows the "Cobranças" box listing the unpaid instalment. Use `page.clock.setFixedTime`, or `page.clock.install` with a date in the last week of the current month.
3. A contract's instalments reappear unchanged after delete and restore.

- [ ] **Step 1: Write the specs.**
- [ ] **Step 2: Run** `make e2e`. Expected: all specs pass. Fix any axe or overflow failure in the app, never by excluding rules.
- [ ] **Step 3: Run** `make check && make e2e`. Expected: PASS.
- [ ] **Step 4: Commit**: `test: drive instalments end to end and document the business area`
